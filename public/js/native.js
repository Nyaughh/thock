// Link used inside the Android app, where the phone itself is a Bluetooth
// keyboard. Same shape as the WebSocket Link in net.js, so the rest of the
// app does not care which one it has.

const bridge = window.ThockNative;

/** True when the page is running inside the Android app. */
export const isNative = !!bridge;

/**
 * onState(state, detail)   'open' { host } | 'closed'
 * onMessage(array)         ['caps', bool] when the computer's Caps Lock changes
 * onStatus(status)         every Bluetooth change, for the pairing screen:
 *                          { state, name, host, hosts: [{ name, address }] }
 *                          state is unsupported | permission | off | starting
 *                                   | ready | connecting | connected
 */
export class NativeLink {
  native = true;
  onState = () => {};
  onMessage = () => {};
  onStatus = () => {};

  latency = null;
  host = null;
  status = { state: 'starting', hosts: [] };
  #open = false;

  constructor() {
    // The app calls this whenever Bluetooth changes.
    window.__thock = (message) => {
      if (message.t === 'caps') this.onMessage(['caps', message.on]);
      else if (message.t === 'status') this.#apply(message);
    };
  }

  get isOpen() { return this.#open; }

  connect() { this.refresh(); }
  wake() { this.refresh(); }
  refresh() { this.#apply(JSON.parse(bridge.status())); }

  /** Connect to a computer this phone is already paired with. */
  dial(address) { bridge.connect(address); }

  /** Stop using the current computer. The pairing itself is removed in Bluetooth settings. */
  disconnect() { bridge.forget(); }

  #apply(status) {
    this.status = status;
    this.host = status.host ?? null;
    const open = status.state === 'connected';
    if (open !== this.#open) {
      this.#open = open;
      this.onState(open ? 'open' : 'closed', { host: this.host });
    }
    this.onStatus(status);
  }

  send(message) {
    if (!this.#open) return;
    switch (message[0]) {
      case 'kd': bridge.key(message[1], true); break;
      case 'ku': bridge.key(message[1], false); break;
      case 'm': bridge.move(message[1], message[2]); break;
      case 'bd': bridge.button(message[1], true); break;
      case 'bu': bridge.button(message[1], false); break;
      case 'w': bridge.wheel(message[1], message[2] ?? 0); break;
    }
  }
}
