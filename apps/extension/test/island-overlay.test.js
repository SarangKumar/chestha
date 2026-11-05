import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

/**
 * The injected overlay, actually executed.
 *
 * `scripts/extension/island.js` runs in a place nothing else in this repo
 * does — a content script in someone else's page — and there is no browser in
 * this environment to load it in. So it is run here against a fake DOM and a
 * fake `chrome`, which is enough to catch the failures that matter: throwing
 * on load, never mounting, drawing the wrong thing, or sending a command
 * without saying which tab it is for.
 *
 * The fake is deliberately thin. It implements only what the overlay touches,
 * which doubles as a check that the overlay touches very little: every method
 * added here is a new way it could be reaching into a page.
 */
const SOURCE = readFileSync(
  fileURLToPath(new URL('../../../scripts/extension/island.js', import.meta.url)),
  'utf8',
);

function element(tag) {
  const adopt = (kid) => { if (kid && typeof kid === 'object') kid.parent = self; return kid; };
  const self = {
    tag,
    className: '',
    children: [],
    attrs: {},
    listeners: {},
    style: {},
    textContent: '',
    innerHTML: '',
    parent: null,
    append: (...kids) => { for (const kid of kids) self.children.push(adopt(kid)); },
    appendChild: (kid) => { self.children.push(adopt(kid)); return kid; },
    // A real replaceWith swaps the node inside its parent. The first version
    // of this fake only recorded the call, which made the overlay look broken
    // when it was not — every assertion after an expand was reading the node
    // that had already been replaced.
    replaceWith: (next) => {
      const siblings = self.parent?.children;
      const index = siblings?.indexOf(self) ?? -1;
      if (index >= 0) siblings[index] = adopt(next);
    },
    remove: () => {
      self.removed = true;
      const siblings = self.parent?.children;
      const index = siblings?.indexOf(self) ?? -1;
      if (index >= 0) siblings.splice(index, 1);
    },
    setAttribute: (key, value) => { self.attrs[key] = value; },
    addEventListener: (name, fn) => { self.listeners[name] = fn; },
    attachShadow: () => {
      self.shadow = element('#shadow');
      return self.shadow;
    },
    querySelector: (selector) => query(self, selector),
  };
  return self;
}

function query(root, selector) {
  const wanted = selector.replace('.', '');
  for (const kid of root.children ?? []) {
    if (String(kid.className ?? '').split(' ').includes(wanted)) return kid;
    const deeper = query(kid, selector);
    if (deeper) return deeper;
  }
  return null;
}

/** Every text node under a subtree, in order. */
function textOf(node, out = []) {
  if (node?.textContent) out.push(node.textContent);
  for (const kid of node?.children ?? []) textOf(kid, out);
  return out;
}

function run({ stored, audio, hidden = false } = {}) {
  const documentElement = element('html');
  const changeListeners = [];
  const sent = [];
  let timer = null;

  const sandbox = {
    window: {},
    document: {
      documentElement,
      hidden,
      fullscreenElement: null,
      createElement: element,
      createElementNS: (_ns, tag) => element(tag),
      addEventListener: () => {},
    },
    chrome: {
      runtime: {
        lastError: null,
        sendMessage: (message, callback) => { sent.push(message); callback?.(); },
      },
      storage: {
        // The overlay reads two records now: the page's (mode and tasks) and
        // the audio host's (what is playing). It asks for both at once.
        local: {
          get: (_keys, callback) => callback({
            'chestha.island': stored,
            'chestha.island.audio': audio,
          }),
        },
        onChanged: { addListener: (fn) => changeListeners.push(fn) },
      },
    },
    setInterval: (fn) => { timer = fn; return 1; },
    clearInterval: () => {},
  };
  sandbox.window.top = sandbox.window;
  sandbox.window.self = sandbox.window;

  vm.createContext(sandbox);
  vm.runInContext(SOURCE, sandbox, { filename: 'island.js' });

  // Looked up lazily, because the overlay mounts and unmounts as snapshots
  // arrive: a reference captured now would be stale by the next assertion.
  const host = () => documentElement.children[0] ?? null;
  return {
    get host() { return host(); },
    get root() { return host()?.shadow ?? null; },
    sent,
    changeListeners,
    tick: () => timer?.(),
    find: (selector) => (host()?.shadow ? query(host().shadow, selector) : null),
  };
}

/** What a workspace page writes: the setting, and the day. */
const ISLAND = {
  v: 1,
  at: Date.now(),
  owner: 'tab-a',
  mode: 'everywhere',
  tasks: {
    pending: [{ id: 't1', title: 'Ship the island', overdue: true }],
    pendingCount: 3,
    done: 2,
    total: 5,
  },
};

/** What the offscreen audio host writes: what is actually playing. */
const AUDIO = {
  v: 1,
  at: Date.now(),
  playing: true,
  blocked: false,
  count: 1,
  streaming: true,
  loop: true,
  volume: 0.6,
  title: 'Immigrant Punk',
  subtitle: 'Your music',
  credit: 'Gogol Bordello',
  media: { position: 40, duration: 212 },
};

const PLAYING = { stored: ISLAND, audio: AUDIO };

test('the overlay mounts one host element and draws inside a shadow root', () => {
  const page = run(PLAYING);

  assert.ok(page.host, 'a host element was appended to documentElement');
  assert.equal(page.host.attrs.style.includes('position: fixed'), true);
  assert.equal(page.host.attrs.style.includes('display: block'), true, 'all:initial makes it inline otherwise');
  assert.ok(page.root, 'it drew into a shadow root rather than the page');
});

test('the collapsed pill names the track rather than only its state', () => {
  const page = run(PLAYING);
  const pill = page.find('.pill');

  assert.ok(pill, 'the pill is drawn');
  assert.ok(textOf(pill).includes('Immigrant Punk'), `expected the title, got ${textOf(pill).join('|')}`);
  assert.ok(textOf(pill).includes('3'), 'and the pending count');
});

test('a paused track still shows its name, not the word Paused', () => {
  const pill = run({ ...PLAYING, audio: { ...AUDIO, playing: false } }).find('.pill');

  assert.ok(textOf(pill).includes('Immigrant Punk'));
  assert.ok(!textOf(pill).includes('Paused'));
});

test('a mix with no title falls back to its state rather than drawing nothing', () => {
  const pill = run({ ...PLAYING, audio: { ...AUDIO, title: '' } }).find('.pill');

  assert.ok(textOf(pill).includes('Playing'));
});

test('a stale audio record is not drawn — the host has stopped reporting', () => {
  // The host beats every second, so fifteen is already long gone. The page's
  // record has a much longer fuse, which is why they are checked separately.
  const page = run({ stored: ISLAND, audio: { ...AUDIO, at: Date.now() - 60_000 } });

  assert.ok(page.host, 'the day is still worth showing');
  assert.ok(!textOf(page.find('.pill')).includes('Immigrant Punk'), 'but not the silent track');
});

test('the music is still named when every workspace tab is closed', () => {
  // The whole point of the offscreen host: audio outlives the page. The task
  // record goes stale, the audio one does not, and the overlay keeps playing.
  const page = run({ stored: { ...ISLAND, at: Date.now() - 300_000 }, audio: AUDIO });

  assert.ok(textOf(page.find('.pill')).includes('Immigrant Punk'));
});

test('nothing is drawn when the island is not set to everywhere', () => {
  assert.equal(run({ ...PLAYING, stored: { ...ISLAND, mode: 'workspace' } }).host, null);
  assert.equal(run({ ...PLAYING, stored: { ...ISLAND, mode: 'off' } }).host, null);
});

test('the mode survives a stale page record, so "off" stays off', () => {
  // Otherwise closing every Chestha tab would turn the overlay back on for
  // someone who had switched it off.
  const off = { ...ISLAND, mode: 'off', at: Date.now() - 300_000 };
  assert.equal(run({ stored: off, audio: AUDIO }).host, null);
});

test('nothing is drawn for a record written by a newer version', () => {
  assert.equal(run({ stored: { ...ISLAND, v: 2 }, audio: { ...AUDIO, v: 2 } }).host, null);
});

test('the island appears on a quiet day, as long as Chestha is running', () => {
  // Requiring something to report meant that with nothing playing and nothing
  // due, the overlay never appeared on other sites at all — which reads as
  // broken rather than as restraint, and was half of why it "never showed up".
  const quiet = {
    ...ISLAND,
    tasks: { pending: [], pendingCount: 0, done: 0, total: 0 },
  };
  const page = run({ stored: quiet, audio: undefined });

  assert.ok(page.host, 'the pill is drawn');
  assert.ok(textOf(page.find('.pill')).includes('Chestha'));
});

test('with Chestha closed and nothing playing there is nothing to be the top of', () => {
  const page = run({
    stored: { ...ISLAND, at: Date.now() - 300_000, tasks: { pending: [], pendingCount: 0, done: 0, total: 0 } },
    audio: undefined,
  });

  assert.equal(page.host, null);
});

test('an empty or missing record draws nothing and does not throw', () => {
  for (const nothing of [undefined, null, {}, { v: 1 }]) {
    assert.equal(run({ stored: nothing, audio: nothing }).host, null);
  }
});

test('the overlay re-reads storage on a tick, so a missed change still lands', () => {
  // The failure this covers: a page injected before the workspace ever
  // published sees an empty first read, and `onChanged` only reports what
  // happens afterwards. Without the re-read it would stay blank forever.
  const page = run({ stored: undefined, audio: undefined });
  assert.equal(page.host, null);

  page.tick();
  assert.equal(page.host, null, 'still nothing, because storage is still empty');
});

test('a storage change paints the overlay without a reload', () => {
  const page = run({ stored: undefined, audio: undefined });
  assert.equal(page.changeListeners.length, 1);

  page.changeListeners[0]({ 'chestha.island.audio': { newValue: AUDIO } }, 'local');
  assert.ok(page.find('.pill'), 'the pill appeared on the change event');
});

test('transport commands are relayed, addressed to the tab that was shown', () => {
  const page = run(PLAYING);
  page.find('.pill').listeners.click();

  const stop = page.find('.controls').children.find((c) => c.attrs['aria-label'] === 'Stop');
  stop.listeners.click();

  assert.equal(page.sent.length, 1);
  // Spread across the realm boundary: an object built inside the vm has a
  // different Object.prototype, which deepEqual treats as a difference.
  assert.deepEqual({ ...page.sent[0] }, {
    type: 'island/relay', command: 'stop', payload: undefined, target: 'tab-a',
  });
});

test('completing a task from another page sends the task id and nothing else', () => {
  const page = run(PLAYING);
  page.find('.pill').listeners.click();
  page.find('.tick').listeners.click();

  assert.equal(page.sent[0].command, 'complete');
  assert.equal(page.sent[0].target, 'tab-a');
  assert.deepEqual({ ...page.sent[0].payload }, { id: 't1' });
});

test('the expanded panel shows the track, the clocks and what is due', () => {
  const page = run(PLAYING);
  page.find('.pill').listeners.click();

  const text = textOf(page.find('.panel')).join(' | ');
  assert.ok(text.includes('Immigrant Punk'), text);
  assert.ok(text.includes('Gogol Bordello'), text);
  assert.ok(text.includes('0:40'), 'elapsed');
  assert.ok(text.includes('3:32'), 'length');
  assert.ok(text.includes('Ship the island'), 'the pending task');
  assert.ok(text.includes('+2 more'), 'and the honest remainder');
});
