# Thock

Your phone or tablet as a full-screen 75% mechanical keyboard and trackpad for your computer.

There are two ways to connect, with the same keyboard on screen either way:

| | Android app | Web app |
|---|---|---|
| Works on | Android 9 or newer | iPhone, iPad, Android |
| Connection | Bluetooth | Wi-Fi |
| Needed on the computer | Nothing | The Thock program (Windows only) |
| Computer sees | A Bluetooth keyboard and mouse | Typed keys from the program |

iPhones and iPads cannot use the Bluetooth way: Apple does not let an app present the device as a Bluetooth keyboard.

## Android: Bluetooth, nothing on the computer

1. On the phone, download `thock.apk` from the [latest release](https://github.com/Nyaughh/thock/releases/latest) and open it to install (Android asks you to allow installing from that source). With a USB cable and developer mode, `adb install thock.apk` does the same.
2. Open Thock and allow the **Nearby devices** permission.
3. Tap **Make this phone visible**.
4. On the computer, open Bluetooth settings, add a device, and pick the phone. Accept the code on both.

The computer now treats the phone as a keyboard and mouse. Next time, open Thock and it reconnects to the last computer on its own.

- If the phone was already paired with that computer (for file sharing or audio), remove it on the computer first and pair again, or the computer will not notice the keyboard.
- Android only lets an app be a keyboard while it is on screen. Leaving Thock disconnects it; coming back reconnects.
- A few phone makers remove this part of Bluetooth. Thock says so on its first screen if yours is one.

## iPhone, iPad or any browser: Wi-Fi

1. On the Windows PC, double-click `start.bat` (or run `npm install` once, then `npm start`).
2. The first time, Windows Firewall asks whether to allow Node.js. Allow it on **private** networks, or the phone cannot reach the computer.
3. A pairing page opens on the computer. Point the phone camera at the QR code. Phone and computer must be on the same Wi-Fi.

The phone remembers the pairing, so next time you only open the page (add it to the home screen for a proper full-screen app).

## Using it

| | |
|---|---|
| Layout | A real 75%: function row in three blocks, navigation column, knob in the corner. Narrow screens fall back to 65%. |
| Knob | Opens settings. A small amber dot shows on it while the computer is not connected. |
| Modifiers | Hold Shift/Ctrl/Alt/Win with another finger, or tap one to hold it for the next key. |
| `Fn` | Arrows become Home/End/PgUp/PgDn, `Backspace` becomes Delete, `P` `[` `]` are play/previous/next, `M` `,` `.` are mute/volume. On the 65% layout the number row becomes F1–F12. |
| Trackpad key | Full-screen trackpad. Tap to click, two-finger tap for right click, two-finger drag to scroll, tap-then-drag to drag. Tablets also get one above the keys. |

Settings cover thirteen switch sounds, six keycap profiles, colourways, the case, legend placement (corner, centre, side-printed, blank), typeface, lighting, and trackpad behaviour. While settings are open the keys still click but nothing is sent, so you can try sounds safely.

### Sounds

The key sounds are recordings of real switches, not synthesised: Gateron Black Ink and Red Ink, NovelKeys Cream, Alpaca, Turquoise Tealios, Cherry MX Black, Brown and Blue, Holy Panda, Topre, Kailh Box Navy, Alps Blue, and buckling spring. Each has its own press sound for every row, for space, enter and backspace, and for the key coming back up.

The recordings come from [kbsim](https://github.com/tplai/kbsim) by Thomas Lai (MIT licence, included in `public/sounds/LICENSE.txt`). `tools/build-sounds.py` cuts and levels them.

### Colourways and cases

- **F75 gradient** (after the side-printed Aula F75 versions): Black, Blue, Pink, Black Pink, plus Violet and Mint. The caps fade down the board, row by row.
- **F75**: Black, Light Blue, Green
- **Rainy** (after the Wobkey Rainy75): Black, Silver, Blue, Pink, Purple
- **Thock**: Graphite, Retro, Harbor, Terminal, Laser
- or pick your own three colours

The non-gradient sets use three colours: letters, modifiers, and an accent on Esc, Enter, space and the arrows. Each set comes with the case it is sold in; **Case** switches any of them to a white or black body. Some legend colours are darker than on the real boards so they stay readable on a screen.

### Lighting

- **Legends** lights the letters from behind, like shine-through caps: one colour, a colour that cycles, or a rainbow wave across the board. With side-printed legends this is the look of a lit F75.
- **Under the keys** is separate: light between the caps (solid, breathing, wave, or rippling from each press).

## Options for the Windows program

```
node server/index.js --port 5000    # different port (default 4747)
node server/index.js --dry-run      # log key presses instead of typing them
node server/index.js --new-code     # replace the pairing code
node server/index.js --no-open      # don't open the pairing page
npm run selftest                    # check that Windows accepts injected input
```

## Good to know

- **Admin windows** (Task Manager, installers, UAC prompts) ignore keys from the Wi-Fi program unless it is started as administrator. This is a Windows rule. Bluetooth has no such limit.
- **Wi-Fi is not encrypted.** Pairing needs the six-digit code and wrong guesses are throttled, but someone snooping on the same Wi-Fi could see what you type. Use it on a network you trust. Bluetooth is encrypted by the pairing.
- **Scrolling over Bluetooth** moves a notch at a time, like a mouse wheel. Over Wi-Fi it is smooth.
- **Sound on iPhone** starts after the first tap, as browsers require.

## How it stays fast

- A key press sends the key first, then moves the cap and plays the sound, all in the same instant.
- Pressing a key only slides a layer the graphics chip already holds; nothing is redrawn or re-laid-out.
- Sounds are uncompressed and held in memory, one file per switch, so nothing is decoded or fetched when a key is pressed.
- Lit legends are recoloured a quarter at a time (about 0.15 ms a step); the light under the keys animates only position and opacity.
- No framework, no web fonts, no images: the interface is about 120 KB, plus about 1 MB of recordings loaded one switch at a time.

## Layout of the code

```
public/                    the keyboard itself (shared by both versions)
  js/keyboard.js           touch handling, modifiers, key repeat
  js/layouts.js            75% and 65% layouts, Fn layer
  js/themes.js             colourways and profiles
  js/sound.js              plays the switch recordings
  js/sound-packs.js        where each clip sits in its file (generated)
  js/lit.js                lit legends
  sounds/                  one WAV per switch
  js/trackpad.js           gestures
  js/net.js                Wi-Fi link (WebSocket)
  js/native.js             Bluetooth link (Android app)
  css/app.css              keycaps, case, backlight, settings
server/                    Wi-Fi version: web server, pairing, Windows key injection
tools/build-sounds.py      rebuilds sounds/ from a copy of kbsim
android/                   Bluetooth version
  app/src/main/java/app/thock/
    HidPeripheral.java     registers the phone as a Bluetooth keyboard and mouse
    HidReports.java        what it tells the computer it is, and the key tables
    MainActivity.java      full-screen view of public/, and the bridge to it
```

To rebuild the Android app after changing anything (needs the Android SDK and JDK 17):

```
cd android
gradlew assembleDebug
```

The result is `android/app/build/outputs/apk/debug/app-debug.apk`.

## Licence

MIT, see `LICENSE`. The switch recordings in `public/sounds/` are from kbsim and carry their own MIT notice in `public/sounds/LICENSE.txt`.
