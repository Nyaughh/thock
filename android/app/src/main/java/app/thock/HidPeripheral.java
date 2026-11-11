package app.thock;

import android.Manifest;
import android.annotation.SuppressLint;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothClass;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothHidDevice;
import android.bluetooth.BluetoothHidDeviceAppSdpSettings;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothProfile;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.Set;

/**
 * Makes the phone a Bluetooth keyboard and mouse, the same way a real one is:
 * it registers a HID device with the phone's Bluetooth stack, and the computer
 * pairs with it from its ordinary Bluetooth settings.
 *
 * Android only keeps the registration while the app is on screen, so the
 * activity calls start() when it appears and stop() when it goes away.
 */
@SuppressLint("MissingPermission") // every entry point checks hasPermission() first
final class HidPeripheral {

    interface Listener {
        void onStatusChanged();
        void onCapsLock(boolean on);
    }

    static final String UNSUPPORTED = "unsupported", PERMISSION = "permission", OFF = "off",
        STARTING = "starting", READY = "ready", CONNECTING = "connecting", CONNECTED = "connected";

    private static final String PREF_HOST = "host";
    private static final int LED_CAPS_LOCK = 0x02;
    private static final int MAX_MOVE = 4000;
    private static final long PROXY_TIMEOUT_MS = 5000, CONNECT_TIMEOUT_MS = 15000;

    private final Context context;
    private final Listener listener;
    private final BluetoothAdapter adapter;
    private final SharedPreferences prefs;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final HidReports reports = new HidReports();

    private BluetoothHidDevice hid;
    private boolean started, proxyRequested, registered, unsupported;
    private BluetoothDevice host;
    private boolean hostConnected;

    HidPeripheral(Context context, Listener listener) {
        this.context = context.getApplicationContext();
        this.listener = listener;
        BluetoothManager manager = (BluetoothManager) context.getSystemService(Context.BLUETOOTH_SERVICE);
        adapter = manager == null ? null : manager.getAdapter();
        prefs = context.getSharedPreferences("thock", Context.MODE_PRIVATE);
    }

    boolean hasPermission() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.S
            || context.checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED;
    }

    // ── Lifecycle ────────────────────────────────────────────────────────────

    /** Safe to call again whenever something may have changed (permission, Bluetooth switched on). */
    synchronized void start() {
        started = true;
        if (adapter == null) { unsupported = true; return; }
        try {
            if (!hasPermission() || !adapter.isEnabled()) return;
            if (hid != null) { if (!registered) register(); return; }
            if (proxyRequested) return;
            proxyRequested = adapter.getProfileProxy(context, proxyListener, BluetoothProfile.HID_DEVICE);
            if (!proxyRequested) { unsupported = true; return; }
            // Some phones ship with the keyboard role removed and simply never answer.
            main.postDelayed(proxyTimeout, PROXY_TIMEOUT_MS);
        } catch (SecurityException e) {
            // Permission was taken away between the check and the call.
        }
    }

    synchronized void stop() {
        started = false;
        main.removeCallbacks(proxyTimeout);
        main.removeCallbacks(connectTimeout);
        if (hid != null) {
            try {
                hid.unregisterApp();
                adapter.closeProfileProxy(BluetoothProfile.HID_DEVICE, hid);
            } catch (RuntimeException ignored) { /* Bluetooth already gone */ }
        }
        hid = null;
        proxyRequested = registered = false;
        dropHost();
    }

    private final Runnable proxyTimeout = () -> {
        synchronized (HidPeripheral.this) {
            if (hid != null || !proxyRequested) return;
            unsupported = true;
        }
        changed();
    };

    private final Runnable connectTimeout = () -> {
        synchronized (HidPeripheral.this) {
            if (host == null || hostConnected) return;
            try { if (hid != null) hid.disconnect(host); } catch (RuntimeException ignored) { }
            dropHost();
        }
        changed();
    };

    private final BluetoothProfile.ServiceListener proxyListener = new BluetoothProfile.ServiceListener() {
        @Override public void onServiceConnected(int profile, BluetoothProfile proxy) {
            synchronized (HidPeripheral.this) {
                main.removeCallbacks(proxyTimeout);
                if (!started) { // the app left the screen while we were waiting
                    adapter.closeProfileProxy(profile, proxy);
                    return;
                }
                hid = (BluetoothHidDevice) proxy;
                unsupported = false;
                register();
            }
            listener.onStatusChanged();
        }

        @Override public void onServiceDisconnected(int profile) {
            synchronized (HidPeripheral.this) {
                hid = null;
                proxyRequested = registered = false;
                dropHost();
            }
            listener.onStatusChanged();
        }
    };

    private void register() {
        BluetoothHidDeviceAppSdpSettings sdp = new BluetoothHidDeviceAppSdpSettings(
            "Thock", "Keyboard and trackpad", "Thock",
            BluetoothHidDevice.SUBCLASS1_COMBO, HidReports.DESCRIPTOR);
        try {
            if (!hid.registerApp(sdp, null, null, context.getMainExecutor(), callback)) unsupported = true;
        } catch (RuntimeException e) {
            unsupported = true;
        }
    }

    private void changed() {
        listener.onStatusChanged();
    }

    private void dropHost() {
        host = null;
        hostConnected = false;
        reports.reset();
    }

    // ── Events from the computer ─────────────────────────────────────────────

    private final BluetoothHidDevice.Callback callback = new BluetoothHidDevice.Callback() {
        @Override public void onAppStatusChanged(BluetoothDevice plugged, boolean isRegistered) {
            synchronized (HidPeripheral.this) {
                registered = isRegistered;
                if (!isRegistered) dropHost();
                else if (host == null) reconnect(plugged);
            }
            listener.onStatusChanged();
        }

        @Override public void onConnectionStateChanged(BluetoothDevice device, int state) {
            synchronized (HidPeripheral.this) {
                if (state == BluetoothProfile.STATE_CONNECTED) {
                    main.removeCallbacks(connectTimeout);
                    reports.reset();
                    host = device;
                    hostConnected = true;
                    prefs.edit().putString(PREF_HOST, device.getAddress()).apply();
                } else if (state == BluetoothProfile.STATE_CONNECTING) {
                    if (host == null) host = device;
                } else if (device.equals(host) && state == BluetoothProfile.STATE_DISCONNECTED) {
                    main.removeCallbacks(connectTimeout);
                    dropHost();
                }
            }
            listener.onStatusChanged();
        }

        @Override public void onGetReport(BluetoothDevice device, byte type, byte id, int bufferSize) {
            synchronized (HidPeripheral.this) {
                if (hid == null) return;
                byte[] data = type == BluetoothHidDevice.REPORT_TYPE_INPUT ? reports.current(id) : null;
                if (data != null) hid.replyReport(device, type, id, data);
                else hid.reportError(device, BluetoothHidDevice.ERROR_RSP_UNSUPPORTED_REQ);
            }
        }

        @Override public void onSetReport(BluetoothDevice device, byte type, byte id, byte[] data) {
            synchronized (HidPeripheral.this) {
                if (hid != null) hid.reportError(device, BluetoothHidDevice.ERROR_RSP_SUCCESS);
            }
            if (type == BluetoothHidDevice.REPORT_TYPE_OUTPUT) leds(id, data);
        }

        @Override public void onInterruptData(BluetoothDevice device, byte reportId, byte[] data) {
            leds(reportId, data);
        }

        @Override public void onVirtualCableUnplug(BluetoothDevice device) {
            // The computer removed the pairing.
            synchronized (HidPeripheral.this) {
                if (device.getAddress().equals(prefs.getString(PREF_HOST, null))) prefs.edit().remove(PREF_HOST).apply();
            }
            listener.onStatusChanged();
        }
    };

    private void leds(int reportId, byte[] data) {
        if (reportId == HidReports.KEYBOARD && data != null && data.length > 0) {
            listener.onCapsLock((data[0] & LED_CAPS_LOCK) != 0);
        }
    }

    /** Go back to the computer used last time, if it is still paired. */
    private void reconnect(BluetoothDevice plugged) {
        BluetoothDevice target = plugged;
        if (target == null) {
            String address = prefs.getString(PREF_HOST, null);
            if (address != null && BluetoothAdapter.checkBluetoothAddress(address)) target = adapter.getRemoteDevice(address);
        }
        if (target != null && target.getBondState() == BluetoothDevice.BOND_BONDED) dial(target);
    }

    private void dial(BluetoothDevice device) {
        try {
            if (host != null && !host.equals(device)) hid.disconnect(host);
            if (hid.getConnectionState(device) == BluetoothProfile.STATE_CONNECTED) {
                host = device;
                hostConnected = true;
                return;
            }
            dropHost();
            if (!hid.connect(device)) return;
            host = device;
            main.removeCallbacks(connectTimeout);
            main.postDelayed(connectTimeout, CONNECT_TIMEOUT_MS);
        } catch (RuntimeException ignored) { /* Bluetooth went away */ }
    }

    // ── Commands from the keyboard UI ────────────────────────────────────────

    void connect(String address) {
        synchronized (this) {
            if (hid == null || !registered || !BluetoothAdapter.checkBluetoothAddress(address)) return;
            BluetoothDevice device = adapter.getRemoteDevice(address);
            if (device.getBondState() != BluetoothDevice.BOND_BONDED) return;
            dial(device);
        }
        listener.onStatusChanged();
    }

    /** Disconnect and stop going back to this computer on its own. */
    void forget() {
        synchronized (this) {
            prefs.edit().remove(PREF_HOST).apply();
            try { if (hid != null && host != null) hid.disconnect(host); } catch (RuntimeException ignored) { }
            dropHost();
        }
        listener.onStatusChanged();
    }

    synchronized void key(String code, boolean down) {
        if (!hostConnected) return;
        int id = reports.key(code, down);
        if (id != 0) send(id, reports.current(id));
    }

    synchronized void button(int index, boolean down) {
        if (hostConnected && reports.button(index, down)) send(HidReports.MOUSE, reports.mouse(0, 0, 0, 0));
    }

    synchronized void move(int dx, int dy) {
        if (!hostConnected) return;
        dx = clamp(dx, MAX_MOVE);
        dy = clamp(dy, MAX_MOVE);
        // A report carries -127..127 per axis; longer strokes go out as several.
        while (dx != 0 || dy != 0) {
            int stepX = clamp(dx, 127), stepY = clamp(dy, 127);
            send(HidReports.MOUSE, reports.mouse(stepX, stepY, 0, 0));
            dx -= stepX;
            dy -= stepY;
        }
    }

    synchronized void wheel(int dy, int dx) {
        if (!hostConnected) return;
        int notches = clamp(reports.wheelNotches(clamp(dy, 2400)), 127);
        int pan = clamp(reports.panNotches(clamp(dx, 2400)), 127);
        if (notches != 0 || pan != 0) send(HidReports.MOUSE, reports.mouse(0, 0, notches, pan));
    }

    private void send(int id, byte[] data) {
        try {
            hid.sendReport(host, id, data);
        } catch (RuntimeException ignored) { /* link dropped; the state callback follows */ }
    }

    private static int clamp(int value, int limit) {
        return Math.max(-limit, Math.min(limit, value));
    }

    // ── State for the UI ─────────────────────────────────────────────────────

    synchronized String state() {
        if (adapter == null || unsupported) return UNSUPPORTED;
        if (!hasPermission()) return PERMISSION;
        try {
            if (!adapter.isEnabled()) return OFF;
        } catch (SecurityException e) {
            return PERMISSION;
        }
        if (!registered) return STARTING;
        if (host == null) return READY;
        return hostConnected ? CONNECTED : CONNECTING;
    }

    /** { state, name, host, hosts: [{ name, address }] } */
    synchronized String statusJson() {
        JSONObject out = new JSONObject();
        try {
            String state = state();
            out.put("t", "status");
            out.put("state", state);
            JSONArray hosts = new JSONArray();
            boolean canRead = adapter != null && hasPermission() && !UNSUPPORTED.equals(state) && !OFF.equals(state);
            if (canRead) {
                out.put("name", adapter.getName());
                if (host != null) out.put("host", label(host));
                String last = prefs.getString(PREF_HOST, null);
                Set<BluetoothDevice> bonded = adapter.getBondedDevices();
                if (bonded != null) {
                    for (BluetoothDevice device : bonded) {
                        if (!isComputer(device) && !device.getAddress().equals(last)) continue;
                        hosts.put(new JSONObject().put("name", label(device)).put("address", device.getAddress()));
                    }
                }
            }
            out.put("hosts", hosts);
        } catch (JSONException | SecurityException ignored) {
            // Leave out what could not be read.
        }
        return out.toString();
    }

    private static boolean isComputer(BluetoothDevice device) {
        BluetoothClass type = device.getBluetoothClass();
        return type != null && type.getMajorDeviceClass() == BluetoothClass.Device.Major.COMPUTER;
    }

    private static String label(BluetoothDevice device) {
        String name = device.getName();
        return name == null || name.isEmpty() ? "Computer" : name;
    }
}
