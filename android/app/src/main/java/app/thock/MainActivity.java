package app.thock;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ActivityInfo;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.HashMap;
import java.util.Map;

/**
 * One full-screen WebView showing the keyboard (the same files the Wi-Fi
 * version serves, bundled into the app), plus the bridge that turns its key
 * presses into Bluetooth keyboard reports.
 */
public final class MainActivity extends Activity implements HidPeripheral.Listener {

    /** Bundled files are served from this made-up address so the page gets a normal web origin. */
    private static final String ASSET_HOST = "appassets.androidplatform.net";
    private static final int REQUEST_PERMISSION = 1, REQUEST_ENABLE = 2, REQUEST_VISIBLE = 3;
    private static final int VISIBLE_SECONDS = 120;

    private WebView web;
    private HidPeripheral hid;

    @SuppressLint("SetJavaScriptEnabled")
    @Override protected void onCreate(Bundle saved) {
        super.onCreate(saved);

        Window window = getWindow();
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        WindowManager.LayoutParams params = window.getAttributes();
        params.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
        window.setAttributes(params);

        // A phone is a keyboard only on its side; tablets may be held either way.
        if (getResources().getConfiguration().smallestScreenWidthDp < 600) {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
        }

        hid = new HidPeripheral(this, this);

        if ((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
            WebView.setWebContentsDebuggingEnabled(true);
        }
        web = new WebView(this);
        web.setBackgroundColor(0xFF0A0B0C);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setHapticFeedbackEnabled(false);
        web.setLongClickable(false);
        web.setOnLongClickListener(view -> true); // no text-selection menu over the keys

        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);                  // remembers your settings
        settings.setMediaPlaybackRequiresUserGesture(false);  // key sounds from the first press
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setTextZoom(100);
        settings.setSupportZoom(false);

        web.setWebViewClient(new Assets());
        web.addJavascriptInterface(new Bridge(), "ThockNative");
        setContentView(web);
        web.loadUrl("https://" + ASSET_HOST + "/index.html");
    }

    @Override protected void onStart() {
        super.onStart();
        IntentFilter filter = new IntentFilter(BluetoothAdapter.ACTION_STATE_CHANGED);
        filter.addAction(BluetoothDevice.ACTION_BOND_STATE_CHANGED);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(bluetoothEvents, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(bluetoothEvents, filter);
        }
        hid.start();
        onStatusChanged();
    }

    @Override protected void onStop() {
        unregisterReceiver(bluetoothEvents);
        hid.stop(); // the computer sees the keyboard switch off, which also lifts any held key
        onStatusChanged();
        super.onStop();
    }

    @Override protected void onResume() {
        super.onResume();
        web.onResume();
        hideSystemBars();
    }

    @Override protected void onPause() {
        web.onPause();
        super.onPause();
    }

    @Override protected void onDestroy() {
        web.removeJavascriptInterface("ThockNative");
        web.destroy();
        super.onDestroy();
    }

    @Override public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemBars();
    }

    @SuppressWarnings("deprecation")
    private void hideSystemBars() {
        Window window = getWindow();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.setDecorFitsSystemWindows(false);
            WindowInsetsController controller = window.getInsetsController();
            if (controller == null) return;
            controller.hide(WindowInsets.Type.systemBars());
            controller.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        } else {
            window.getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                    | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
        }
    }

    /** Back closes the settings panel if it is open; otherwise it leaves the app. */
    @SuppressWarnings("deprecation")
    @Override public void onBackPressed() {
        web.evaluateJavascript("!!(window.__thockBack&&window.__thockBack())", handled -> {
            if (!"true".equals(handled)) moveTaskToBack(true);
        });
    }

    // ── Bluetooth changes ────────────────────────────────────────────────────

    private final BroadcastReceiver bluetoothEvents = new BroadcastReceiver() {
        @Override public void onReceive(Context context, Intent intent) {
            if (BluetoothAdapter.ACTION_STATE_CHANGED.equals(intent.getAction())) {
                int state = intent.getIntExtra(BluetoothAdapter.EXTRA_STATE, BluetoothAdapter.ERROR);
                if (state == BluetoothAdapter.STATE_ON) hid.start();
                else if (state == BluetoothAdapter.STATE_OFF) { hid.stop(); hid.start(); }
            }
            onStatusChanged();
        }
    };

    @Override public void onStatusChanged() {
        toPage(hid.statusJson());
    }

    @Override public void onCapsLock(boolean on) {
        toPage("{\"t\":\"caps\",\"on\":" + on + "}");
    }

    private void toPage(String json) {
        runOnUiThread(() -> {
            if (web != null) web.evaluateJavascript("window.__thock&&window.__thock(" + json + ")", null);
        });
    }

    @Override public void onRequestPermissionsResult(int request, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(request, permissions, results);
        if (request != REQUEST_PERMISSION) return;
        boolean granted = results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED;
        if (!granted && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
            && !shouldShowRequestPermissionRationale(Manifest.permission.BLUETOOTH_CONNECT)) {
            // Refused for good: Android will not ask again, so open the app's settings page.
            startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", getPackageName(), null)));
        }
        hid.start();
        onStatusChanged();
    }

    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        hid.start();
        onStatusChanged();
    }

    // ── Called by the page ───────────────────────────────────────────────────

    private final class Bridge {
        @JavascriptInterface public String status() { return hid.statusJson(); }

        @JavascriptInterface public void key(String code, boolean down) { hid.key(code, down); }
        @JavascriptInterface public void move(int dx, int dy) { hid.move(dx, dy); }
        @JavascriptInterface public void button(int index, boolean down) { hid.button(index, down); }
        @JavascriptInterface public void wheel(int dy, int dx) { hid.wheel(dy, dx); }

        @JavascriptInterface public void connect(String address) { hid.connect(address); }
        @JavascriptInterface public void forget() { hid.forget(); }

        /** Ask for whatever is missing: the Bluetooth permission, or Bluetooth itself. */
        @JavascriptInterface public void resolve() {
            runOnUiThread(() -> {
                String state = hid.state();
                try {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
                        && (checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED
                            || checkSelfPermission(Manifest.permission.BLUETOOTH_ADVERTISE) != PackageManager.PERMISSION_GRANTED)) {
                        requestPermissions(new String[] {
                            Manifest.permission.BLUETOOTH_CONNECT, Manifest.permission.BLUETOOTH_ADVERTISE,
                        }, REQUEST_PERMISSION);
                    } else if (HidPeripheral.OFF.equals(state)) {
                        startActivityForResult(new Intent(BluetoothAdapter.ACTION_REQUEST_ENABLE), REQUEST_ENABLE);
                    }
                } catch (RuntimeException e) {
                    openBluetoothSettings();
                }
            });
        }

        /** Let computers find this phone for two minutes, so one can add it as a keyboard. */
        @JavascriptInterface public void makeVisible() {
            runOnUiThread(() -> {
                try {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
                        && (checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED
                            || checkSelfPermission(Manifest.permission.BLUETOOTH_ADVERTISE) != PackageManager.PERMISSION_GRANTED)) {
                        requestPermissions(new String[] {
                            Manifest.permission.BLUETOOTH_CONNECT, Manifest.permission.BLUETOOTH_ADVERTISE,
                        }, REQUEST_PERMISSION);
                        return;
                    }
                    Intent intent = new Intent(BluetoothAdapter.ACTION_REQUEST_DISCOVERABLE);
                    intent.putExtra(BluetoothAdapter.EXTRA_DISCOVERABLE_DURATION, VISIBLE_SECONDS);
                    startActivityForResult(intent, REQUEST_VISIBLE);
                } catch (RuntimeException e) {
                    openBluetoothSettings();
                }
            });
        }

        @JavascriptInterface public void bluetoothSettings() {
            runOnUiThread(MainActivity.this::openBluetoothSettings);
        }
    }

    private void openBluetoothSettings() {
        try {
            startActivity(new Intent(Settings.ACTION_BLUETOOTH_SETTINGS));
        } catch (RuntimeException ignored) { /* no settings app */ }
    }

    // ── Bundled files ────────────────────────────────────────────────────────

    private final class Assets extends WebViewClient {
        @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            return !ASSET_HOST.equals(request.getUrl().getHost()); // never leave the bundled page
        }

        @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            String path = uri.getPath();
            if (!ASSET_HOST.equals(uri.getHost()) || path == null || path.contains("..")) return notFound();
            path = path.equals("/") ? "index.html" : path.substring(1);
            try {
                String type = mimeType(path);
                boolean text = type.startsWith("text/") || type.endsWith("json") || type.endsWith("xml");
                Map<String, String> headers = new HashMap<>();
                if (path.endsWith(".html")) {
                    headers.put("Content-Security-Policy",
                        "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'");
                }
                return new WebResourceResponse(type, text ? "utf-8" : null, 200, "OK", headers, getAssets().open(path));
            } catch (IOException e) {
                return notFound();
            }
        }

        private WebResourceResponse notFound() {
            return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found",
                new HashMap<>(), new ByteArrayInputStream(new byte[0]));
        }

        private String mimeType(String path) {
            String ext = path.substring(path.lastIndexOf('.') + 1);
            switch (ext) {
                case "html": return "text/html";
                case "css": return "text/css";
                case "js": return "text/javascript";
                case "svg": return "image/svg+xml";
                case "png": return "image/png";
                case "wav": return "audio/wav";
                case "json": return "application/json";
                case "webmanifest": return "application/manifest+json";
                case "woff2": return "font/woff2";
                default: return "application/octet-stream";
            }
        }
    }
}
