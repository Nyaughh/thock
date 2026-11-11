// WebSocket link to the desktop. Reconnects on its own once paired.

function deviceName() {
  const ua = navigator.userAgent;
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'iPad';
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/Android/.test(ua)) return /Mobile/.test(ua) ? 'Android phone' : 'Android tablet';
  return 'Browser';
}

/**
 * Events (via on*): onState(state, detail)
 *   'connecting' | 'open' { host } | 'retrying' | 'rejected' { reason } | 'closed'
 * onMessage(array) for anything the desktop sends after pairing.
 */
export class Link {
  onState = () => {};
  onMessage = () => {};

  #ws = null;
  #code = null;
  #open = false;
  #wasOpen = false;
  #retry = null;
  #delay = 600;
  #pingTimer = null;
  latency = null;
  host = null;

  get isOpen() { return this.#open; }

  connect(code) {
    this.#code = code;
    this.#wasOpen = false;
    this.#dial();
  }

  disconnect() {
    this.#code = null;
    clearTimeout(this.#retry);
    this.#ws?.close();
  }

  #dial() {
    clearTimeout(this.#retry);
    this.#ws?.close();
    this.onState(this.#wasOpen ? 'retrying' : 'connecting');

    const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = (this.#ws = new WebSocket(`${scheme}://${location.host}/ws`));
    let rejected = false;

    ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', code: this.#code, name: deviceName() }));

    ws.onmessage = (event) => {
      let message;
      try { message = JSON.parse(event.data); } catch { return; }
      if (message?.t === 'ok') {
        this.#open = this.#wasOpen = true;
        this.#delay = 600;
        this.host = message.host;
        this.#startPing();
        this.onState('open', { host: message.host });
      } else if (message?.t === 'no') {
        rejected = true;
        this.#code = null;
        this.onState('rejected', { reason: message.reason });
      } else if (Array.isArray(message)) {
        if (message[0] === 'pong') this.latency = Math.round(performance.now() - message[1]);
        else this.onMessage(message);
      }
    };

    ws.onclose = () => {
      if (ws !== this.#ws) return; // superseded by a newer attempt
      this.#open = false;
      clearInterval(this.#pingTimer);
      if (rejected) return; // already reported
      if (!this.#code) return this.onState('closed');
      // Keep trying: the desktop may be asleep or the phone between networks.
      this.onState(this.#wasOpen ? 'retrying' : 'connecting');
      this.#retry = setTimeout(() => this.#dial(), this.#delay);
      this.#delay = Math.min(this.#delay * 1.6, 4000);
    };
    ws.onerror = () => {};
  }

  #startPing() {
    clearInterval(this.#pingTimer);
    const ping = () => this.send(['ping', performance.now()]);
    ping();
    this.#pingTimer = setInterval(ping, 4000);
  }

  /** Try again right now, e.g. when the app comes back to the foreground. */
  wake() {
    if (this.#code && !this.#open) this.#dial();
  }

  send(message) {
    if (this.#open && this.#ws.readyState === WebSocket.OPEN) this.#ws.send(JSON.stringify(message));
  }
}
