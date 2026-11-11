// The screen shown inside the Android app until a computer is connected.
// Pairing happens the way it does for any Bluetooth keyboard: the computer
// finds the phone in its own Bluetooth settings.

const bridge = window.ThockNative;

const VIEWS = {
  unsupported: () => ({
    title: 'This phone cannot be a Bluetooth keyboard.',
    text: 'Its maker left that part of Bluetooth out. The Wi-Fi version of Thock still works with it.',
  }),
  permission: () => ({
    title: 'Allow Bluetooth.',
    text: 'Thock needs the Nearby devices permission to show up as a keyboard.',
    action: ['Allow', () => bridge.resolve()],
  }),
  off: () => ({
    title: 'Bluetooth is off.',
    text: 'Turn it on to use this phone as a keyboard.',
    action: ['Turn on', () => bridge.resolve()],
  }),
  starting: () => ({ title: 'Starting Bluetooth…', text: '' }),
  connecting: (status) => ({
    title: `Connecting to ${status.host ?? 'your computer'}…`,
    text: 'Check that its Bluetooth is on and that it is nearby.',
  }),
  ready: () => ({
    title: 'Pair it like any Bluetooth keyboard.',
    text: 'Already paired with that computer for something else? Remove this phone there first, then add it again.',
    action: ['Make this phone visible', () => bridge.makeVisible()],
    steps: true,
  }),
};

/**
 * root   the #bt element
 * link   the NativeLink
 * sound  for button ticks
 */
export function initBluetoothPairing({ root, link, sound }) {
  const $ = (id) => root.querySelector(id);
  const title = $('#btTitle'), text = $('#btMsg'), action = $('#btAction');
  const steps = $('#btSteps'), phoneName = $('#btName'), hosts = $('#btHosts');
  let onAction = null;
  let drawn = '';

  action.addEventListener('click', () => { sound.tick(1); onAction?.(); });
  hosts.addEventListener('click', (e) => {
    const address = e.target.closest('.host')?.dataset.address;
    if (!address) return;
    sound.tick(1);
    link.dial(address);
  });

  function render(status) {
    root.hidden = status.state === 'connected';
    if (root.hidden) return;

    // Redraw only when something changed, so a tap is never lost to a refresh.
    const signature = JSON.stringify([status.state, status.name, status.host, status.hosts]);
    if (signature === drawn) return;
    drawn = signature;

    const view = (VIEWS[status.state] ?? VIEWS.starting)(status);
    title.textContent = view.title;
    text.textContent = view.text;
    action.hidden = !view.action;
    if (view.action) action.textContent = view.action[0];
    onAction = view.action?.[1] ?? null;

    steps.hidden = !view.steps;
    phoneName.textContent = status.name || 'this phone';

    const known = view.steps ? status.hosts ?? [] : [];
    hosts.hidden = known.length === 0;
    hosts.replaceChildren();
    if (known.length) {
      const heading = document.createElement('h2');
      heading.textContent = 'Or go back to';
      hosts.append(heading);
      for (const host of known) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'host';
        button.dataset.address = host.address;
        button.append(host.name);
        const hint = document.createElement('small');
        hint.textContent = 'Connect';
        button.append(hint);
        hosts.append(button);
      }
    }
  }

  link.onStatus = render;
  // The app reports changes itself; this catches anything it has no event for.
  setInterval(() => { if (!root.hidden && !document.hidden) link.refresh(); }, 2000);
}
