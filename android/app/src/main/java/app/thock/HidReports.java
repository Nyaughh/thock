package app.thock;

import java.util.Arrays;
import java.util.HashMap;
import java.util.Map;

/**
 * What the phone tells the computer it is (the HID report descriptor), the
 * key tables, and the current contents of each report.
 *
 * Report 1  keyboard   [modifiers, 0, key, key, key, key, key, key]
 * Report 2  mouse      [buttons, x, y, wheel, pan]
 * Report 3  media keys [usage low, usage high]
 *
 * Not thread-safe: the owner holds a lock around every call.
 */
final class HidReports {
    static final int KEYBOARD = 1, MOUSE = 2, CONSUMER = 3;

    /** Windows wheel units per notch, which is what the keyboard UI sends. */
    private static final int WHEEL_NOTCH = 120;

    static final byte[] DESCRIPTOR = bytes(
        // ── Keyboard ──
        0x05, 0x01,        // Usage Page (Generic Desktop)
        0x09, 0x06,        // Usage (Keyboard)
        0xA1, 0x01,        // Collection (Application)
        0x85, KEYBOARD,    //   Report ID
        0x05, 0x07,        //   Usage Page (Keyboard)
        0x19, 0xE0,        //   Usage Minimum (Left Control)
        0x29, 0xE7,        //   Usage Maximum (Right GUI)
        0x15, 0x00,        //   Logical Minimum (0)
        0x25, 0x01,        //   Logical Maximum (1)
        0x75, 0x01,        //   Report Size (1)
        0x95, 0x08,        //   Report Count (8)
        0x81, 0x02,        //   Input (Data, Variable, Absolute): modifiers
        0x95, 0x01,        //   Report Count (1)
        0x75, 0x08,        //   Report Size (8)
        0x81, 0x01,        //   Input (Constant): reserved byte
        0x95, 0x05,        //   Report Count (5)
        0x75, 0x01,        //   Report Size (1)
        0x05, 0x08,        //   Usage Page (LEDs)
        0x19, 0x01,        //   Usage Minimum (Num Lock)
        0x29, 0x05,        //   Usage Maximum (Kana)
        0x91, 0x02,        //   Output (Data, Variable, Absolute): LEDs
        0x95, 0x01,        //   Report Count (1)
        0x75, 0x03,        //   Report Size (3)
        0x91, 0x01,        //   Output (Constant): padding
        0x95, 0x06,        //   Report Count (6)
        0x75, 0x08,        //   Report Size (8)
        0x15, 0x00,        //   Logical Minimum (0)
        0x26, 0xFF, 0x00,  //   Logical Maximum (255)
        0x05, 0x07,        //   Usage Page (Keyboard)
        0x19, 0x00,        //   Usage Minimum (0)
        0x2A, 0xFF, 0x00,  //   Usage Maximum (255)
        0x81, 0x00,        //   Input (Data, Array): six keys
        0xC0,              // End Collection

        // ── Mouse ──
        0x05, 0x01,        // Usage Page (Generic Desktop)
        0x09, 0x02,        // Usage (Mouse)
        0xA1, 0x01,        // Collection (Application)
        0x85, MOUSE,       //   Report ID
        0x09, 0x01,        //   Usage (Pointer)
        0xA1, 0x00,        //   Collection (Physical)
        0x05, 0x09,        //     Usage Page (Buttons)
        0x19, 0x01,        //     Usage Minimum (1)
        0x29, 0x03,        //     Usage Maximum (3)
        0x15, 0x00,        //     Logical Minimum (0)
        0x25, 0x01,        //     Logical Maximum (1)
        0x95, 0x03,        //     Report Count (3)
        0x75, 0x01,        //     Report Size (1)
        0x81, 0x02,        //     Input (Data, Variable, Absolute): buttons
        0x95, 0x01,        //     Report Count (1)
        0x75, 0x05,        //     Report Size (5)
        0x81, 0x01,        //     Input (Constant): padding
        0x05, 0x01,        //     Usage Page (Generic Desktop)
        0x09, 0x30,        //     Usage (X)
        0x09, 0x31,        //     Usage (Y)
        0x09, 0x38,        //     Usage (Wheel)
        0x15, 0x81,        //     Logical Minimum (-127)
        0x25, 0x7F,        //     Logical Maximum (127)
        0x75, 0x08,        //     Report Size (8)
        0x95, 0x03,        //     Report Count (3)
        0x81, 0x06,        //     Input (Data, Variable, Relative)
        0x05, 0x0C,        //     Usage Page (Consumer)
        0x0A, 0x38, 0x02,  //     Usage (AC Pan): sideways scroll
        0x15, 0x81,        //     Logical Minimum (-127)
        0x25, 0x7F,        //     Logical Maximum (127)
        0x75, 0x08,        //     Report Size (8)
        0x95, 0x01,        //     Report Count (1)
        0x81, 0x06,        //     Input (Data, Variable, Relative)
        0xC0,              //   End Collection
        0xC0,              // End Collection

        // ── Media keys ──
        0x05, 0x0C,        // Usage Page (Consumer)
        0x09, 0x01,        // Usage (Consumer Control)
        0xA1, 0x01,        // Collection (Application)
        0x85, CONSUMER,    //   Report ID
        0x15, 0x00,        //   Logical Minimum (0)
        0x26, 0xFF, 0x03,  //   Logical Maximum (1023)
        0x19, 0x00,        //   Usage Minimum (0)
        0x2A, 0xFF, 0x03,  //   Usage Maximum (1023)
        0x75, 0x10,        //   Report Size (16)
        0x95, 0x01,        //   Report Count (1)
        0x81, 0x00,        //   Input (Data, Array)
        0xC0               // End Collection
    );

    /** KeyboardEvent.code -> keyboard usage. */
    private static final Map<String, Integer> KEYS = new HashMap<>();
    /** KeyboardEvent.code -> bit in the modifier byte. */
    private static final Map<String, Integer> MODIFIERS = new HashMap<>();
    /** KeyboardEvent.code -> consumer usage. */
    private static final Map<String, Integer> MEDIA = new HashMap<>();

    static {
        for (int i = 0; i < 26; i++) KEYS.put("Key" + (char) ('A' + i), 0x04 + i);
        for (int i = 1; i <= 9; i++) KEYS.put("Digit" + i, 0x1D + i);
        KEYS.put("Digit0", 0x27);
        for (int i = 1; i <= 12; i++) KEYS.put("F" + i, 0x39 + i);
        for (int i = 13; i <= 24; i++) KEYS.put("F" + i, 0x68 + i - 13);

        String[] names = {
            "Enter", "Escape", "Backspace", "Tab", "Space", "Minus", "Equal",
            "BracketLeft", "BracketRight", "Backslash", null, "Semicolon", "Quote",
            "Backquote", "Comma", "Period", "Slash", "CapsLock",
        };
        for (int i = 0; i < names.length; i++) if (names[i] != null) KEYS.put(names[i], 0x28 + i);

        String[] nav = {
            "PrintScreen", "ScrollLock", "Pause", "Insert", "Home", "PageUp",
            "Delete", "End", "PageDown", "ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp",
        };
        for (int i = 0; i < nav.length; i++) KEYS.put(nav[i], 0x46 + i);
        KEYS.put("ContextMenu", 0x65);

        String[] mods = {
            "ControlLeft", "ShiftLeft", "AltLeft", "MetaLeft",
            "ControlRight", "ShiftRight", "AltRight", "MetaRight",
        };
        for (int i = 0; i < mods.length; i++) MODIFIERS.put(mods[i], 1 << i);

        MEDIA.put("MediaPlayPause", 0xCD);
        MEDIA.put("MediaTrackNext", 0xB5);
        MEDIA.put("MediaTrackPrevious", 0xB6);
        MEDIA.put("MediaStop", 0xB7);
        MEDIA.put("AudioVolumeMute", 0xE2);
        MEDIA.put("AudioVolumeUp", 0xE9);
        MEDIA.put("AudioVolumeDown", 0xEA);
    }

    private int modifiers;
    private final int[] pressed = new int[6];
    private int media;
    private int buttons;
    private int wheelRest, panRest;

    void reset() {
        modifiers = 0;
        Arrays.fill(pressed, 0);
        media = 0;
        buttons = 0;
        wheelRest = panRest = 0;
    }

    /** Applies a key change. Returns the report that now needs sending, or 0. */
    int key(String code, boolean down) {
        Integer bit = MODIFIERS.get(code);
        if (bit != null) {
            int next = down ? modifiers | bit : modifiers & ~bit;
            if (next == modifiers) return 0;
            modifiers = next;
            return KEYBOARD;
        }
        Integer usage = KEYS.get(code);
        if (usage != null) return setKey(usage, down) ? KEYBOARD : 0;

        Integer consumer = MEDIA.get(code);
        if (consumer == null) return 0;
        if (down) media = consumer;
        else if (media == consumer) media = 0;
        else return 0;
        return CONSUMER;
    }

    private boolean setKey(int usage, boolean down) {
        int free = -1;
        for (int i = 0; i < pressed.length; i++) {
            if (pressed[i] == usage) {
                if (down) return false;
                pressed[i] = 0;
                return true;
            }
            if (pressed[i] == 0 && free < 0) free = i;
        }
        if (!down || free < 0) return false; // more than six keys: ignore the extra
        pressed[free] = usage;
        return true;
    }

    /** Returns true when the button state changed. */
    boolean button(int index, boolean down) {
        if (index < 0 || index > 2) return false;
        int next = down ? buttons | (1 << index) : buttons & ~(1 << index);
        if (next == buttons) return false;
        buttons = next;
        return true;
    }

    /** Wheel units in, whole notches out; the remainder is kept for next time. */
    int wheelNotches(int units) {
        wheelRest += units;
        int notches = wheelRest / WHEEL_NOTCH;
        wheelRest -= notches * WHEEL_NOTCH;
        return notches;
    }

    int panNotches(int units) {
        panRest += units;
        int notches = panRest / WHEEL_NOTCH;
        panRest -= notches * WHEEL_NOTCH;
        return notches;
    }

    byte[] keyboard() {
        byte[] report = new byte[8];
        report[0] = (byte) modifiers;
        for (int i = 0; i < pressed.length; i++) report[2 + i] = (byte) pressed[i];
        return report;
    }

    byte[] consumer() {
        return new byte[] { (byte) media, (byte) (media >> 8) };
    }

    byte[] mouse(int dx, int dy, int wheel, int pan) {
        return new byte[] { (byte) buttons, (byte) dx, (byte) dy, (byte) wheel, (byte) pan };
    }

    byte[] current(int id) {
        switch (id) {
            case KEYBOARD: return keyboard();
            case MOUSE: return mouse(0, 0, 0, 0);
            case CONSUMER: return consumer();
            default: return null;
        }
    }

    private static byte[] bytes(int... values) {
        byte[] out = new byte[values.length];
        for (int i = 0; i < values.length; i++) out[i] = (byte) values[i];
        return out;
    }
}
