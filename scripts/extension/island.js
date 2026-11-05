/**
 * The island, injected into every page you browse.
 *
 * This is the overlay half of the feature whose other half is
 * `apps/extension/src/components/Island.jsx`. The workspace writes a snapshot
 * of what it is playing and what is due to `chrome.storage.local`; this reads
 * it and draws the same notch on whatever site you are on.
 *
 * ## What it does and does not touch
 *
 * It **reads nothing from the page**. It appends one element to
 * `document.documentElement`, draws inside a closed shadow root, and never
 * looks at the document it is sitting on — no DOM queries, no text, no forms,
 * no URL beyond the frame check below. The content script match pattern is
 * `<all_urls>` because an overlay that only worked on a list of sites would be
 * useless, not because anything here wants the page's data. That is the whole
 * justification for the broad match, and it holds only as long as the previous
 * sentence stays true: **nothing in this file may ever read page content.**
 *
 * ## Why it is written like this
 *
 * MV3 content scripts are classic scripts — no imports — so the storage key
 * and the snapshot shape are restated here rather than imported from
 * `packages/core/src/island.js`. That file is the contract; this is a copy of
 * the three constants it exports, and `ISLAND_VERSION` is what stops an
 * extension update from drawing a snapshot it no longer understands.
 *
 * Styling is a string in a shadow root rather than a stylesheet because the
 * host page's CSS must not reach it and its CSS must not reach the host page.
 * The keyframes are the same ones in `apps/extension/src/components/island.css`
 * — changing one means changing both.
 */

const ISLAND_KEY = 'chestha.island';
const ISLAND_VERSION = 1;
const ISLAND_STALE_MS = 90_000;

/**
 * Audio is a second record, written by the offscreen document rather than by
 * a workspace page — see `apps/extension/src/audio/protocol.js`. Two records,
 * because they have different writers and different lifetimes: the mix plays
 * on with every Chestha tab closed, and the overlay should still name it.
 *
 * Its heartbeat is a second, so it goes stale fifteen times faster than the
 * island's. A silent host is one that has stopped beating, and a notch still
 * claiming to play would be the one lie this must not tell.
 */
const AUDIO_KEY = 'chestha.island.audio';
const AUDIO_VERSION = 1;
const AUDIO_STALE_MS = 15_000;

// Only the top frame. An ad iframe is not a place to hang a notch, and every
// frame drawing its own would stack them.
if (window.top === window.self) {
  install();
}

function install() {
  let snapshot = null;
  let audio = null;
  let expanded = false;
  let host = null;
  let root = null;
  let ticking = null;

  pull();

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    let touched = false;
    if (ISLAND_KEY in changes) { snapshot = read(changes[ISLAND_KEY].newValue); touched = true; }
    if (AUDIO_KEY in changes) { audio = readAudio(changes[AUDIO_KEY].newValue); touched = true; }
    if (touched) render();
  });

  // Two reasons for the timer, not one:
  //
  //  - A snapshot goes stale when the workspace tab closes. Audio stops with
  //    it, and a notch still saying "Playing" would be a lie; nothing tells us
  //    the tab went away, so staleness has to be noticed on a clock.
  //  - `onChanged` only reports what changes *after* this script is listening.
  //    A tab woken from the back/forward cache, or injected while the service
  //    worker was asleep, can otherwise sit forever on the empty first read.
  //    Re-reading is cheap and removes a whole class of "it never appeared".
  setInterval(pull, 15_000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) pull();
  });

  function pull() {
    try {
      chrome.storage.local.get([ISLAND_KEY, AUDIO_KEY], (values) => {
        if (chrome.runtime.lastError) return;
        snapshot = read(values?.[ISLAND_KEY]);
        audio = readAudio(values?.[AUDIO_KEY]);
        render();

        // A workspace is reporting but the audio record is missing or old.
        // Something is playing that this page cannot see, or nothing is and
        // the record simply was not cleaned up — either way the host is the
        // one who knows, so ask it to say so again. Once per poll at most,
        // and it never causes a host to be created.
        if (snapshot && !sound()) {
          try {
            chrome.runtime.sendMessage({ type: 'island/refresh' }, () => {
              void chrome.runtime.lastError;
            });
          } catch {
            /* the extension was reloaded under this page */
          }
        }
      });
    } catch {
      // The extension was reloaded under this page: its storage is gone from
      // this script's point of view, and the overlay goes with the next load.
    }
  }

  /** The audio host's record. Same defensiveness, different writer. */
  function readAudio(raw) {
    if (!raw || typeof raw !== 'object' || raw.v !== AUDIO_VERSION) return null;
    const duration = Number(raw.media?.duration) || 0;
    return {
      at: Number(raw.at) || 0,
      playing: raw.playing === true,
      loop: raw.loop !== false,
      title: typeof raw.title === 'string' ? raw.title : '',
      subtitle: typeof raw.subtitle === 'string' ? raw.subtitle : '',
      credit: typeof raw.credit === 'string' ? raw.credit : '',
      media: duration > 0
        ? { position: Math.min(Number(raw.media.position) || 0, duration), duration }
        : null,
    };
  }

  /** Defensive read. The writer is our own extension, so this guards against
   *  version skew rather than hostility — a stale shape must not throw. */
  function read(raw) {
    if (!raw || typeof raw !== 'object' || raw.v !== ISLAND_VERSION) return null;
    const tasks = raw.tasks && typeof raw.tasks === 'object' ? raw.tasks : {};
    return {
      at: Number(raw.at) || 0,
      owner: typeof raw.owner === 'string' ? raw.owner : '',
      mode: typeof raw.mode === 'string' ? raw.mode : 'workspace',
      sound: raw.sound && typeof raw.sound === 'object' ? raw.sound : null,
      media: raw.media && typeof raw.media === 'object' ? raw.media : null,
      tasks: {
        pending: Array.isArray(tasks.pending) ? tasks.pending.slice(0, 5) : [],
        pendingCount: Number(tasks.pendingCount) || 0,
        done: Number(tasks.done) || 0,
        total: Number(tasks.total) || 0,
      },
    };
  }

  /** The audio record, if the host is still beating. */
  function sound() {
    if (!audio) return null;
    if (Date.now() - audio.at > AUDIO_STALE_MS) return null;
    return audio;
  }

  /** The task half, if a workspace page has reported recently. */
  function tasks() {
    if (!snapshot) return { pending: [], pendingCount: 0, done: 0, total: 0 };
    if (Date.now() - snapshot.at > ISLAND_STALE_MS) {
      return { pending: [], pendingCount: 0, done: 0, total: 0 };
    }
    return snapshot.tasks;
  }

  function visible() {
    // The mode is a setting, not a live fact, so it is read from the island
    // record even when that record has gone stale — otherwise closing every
    // Chestha tab would turn the overlay back on for someone who set it off.
    if ((snapshot?.mode ?? 'everywhere') !== 'everywhere') return false;
    // Someone watching a video full screen has not asked for a notch over it.
    if (document.fullscreenElement) return false;

    // Drawn whenever Chestha is running or something is playing — not only
    // when there is news. Requiring content meant that on a quiet day the
    // island never appeared on other sites at all, which reads as broken
    // rather than as restraint. With everything closed and nothing playing
    // there is nothing to be the top of, so it goes.
    if (sound()) return true;
    return Boolean(snapshot) && Date.now() - snapshot.at <= ISLAND_STALE_MS;
  }

  function send(command, payload) {
    try {
      // `target` addresses the workspace tab that owns the audio. Without it a
      // relayed `play` would be obeyed by every open workspace tab at once.
      const target = snapshot?.owner || null;
      chrome.runtime.sendMessage({ type: 'island/relay', command, payload, target }, () => {
        // The workspace tab may be gone, in which case the relay opens it. The
        // error is read so Chrome does not log an unchecked-lastError warning.
        void chrome.runtime.lastError;
      });
    } catch {
      // The extension was reloaded or removed while this page stayed open.
      // Nothing to do: the overlay goes on the next navigation.
    }
  }

  function mount() {
    if (host) return;
    host = document.createElement('div');
    host.id = 'chestha-island-host';
    // `all: initial` is the one declaration on the host, so no inherited style
    // from the page reaches the shadow tree.
    host.setAttribute(
      'style',
      // `display: block` is explicit because `all: initial` makes the host
      // inline, and relying on position:fixed to blockify it is a rule nobody
      // reading this should have to remember.
      'all: initial; display: block; position: fixed; inset: 0 0 auto 0;'
      + ' z-index: 2147483646; pointer-events: none;',
    );
    root = host.attachShadow({ mode: 'closed' });
    root.appendChild(styles());
    // documentElement, not body: a page that replaces its body (a SPA route
    // change, a framework remount) would take the overlay with it.
    document.documentElement.appendChild(host);
  }

  function unmount() {
    if (!host) return;
    host.remove();
    host = null;
    root = null;
    expanded = false;
  }

  function render() {
    if (!visible()) { unmount(); return; }
    mount();

    const wrap = document.createElement('div');
    wrap.className = 'wrap';
    wrap.appendChild(expanded ? panel() : pill());

    const previous = root.querySelector('.wrap');
    if (previous) previous.replaceWith(wrap);
    else root.appendChild(wrap);

    clearInterval(ticking);
    // The bar moves on its own between the host's reports. Only while the
    // panel is open: a timer redrawing a collapsed pill every second is work
    // nobody can see.
    const track = sound();
    if (expanded && track?.media && track.playing) {
      ticking = setInterval(() => {
        track.media.position = Math.min(track.media.position + 1, track.media.duration);
        render();
      }, 1000);
    }
  }

  function open(next) {
    expanded = next;
    render();
  }

  function pill() {
    const button = el('button', 'pill');
    button.type = 'button';
    button.setAttribute('aria-label', 'Open the Chestha island');
    // The name of what is playing, not the word "Playing": a pill that says
    // only that is a status light, and the point of a glance at the notch is
    // knowing which track it is.
    const track = sound();
    const due = tasks();
    const label = track
      ? (track.title || (track.playing ? 'Playing' : 'Paused'))
      : due.pendingCount > 0 ? 'Today' : 'Chestha';
    button.append(
      track ? meter(track.playing) : glyph('check', 'muted'),
      text('label', label),
    );
    if (due.pendingCount > 0) {
      button.append(text('count', String(due.pendingCount)));
    }
    button.addEventListener('click', () => open(true));
    button.addEventListener('mouseenter', () => open(true));
    return button;
  }

  function panel() {
    const box = el('div', 'panel');
    box.addEventListener('mouseleave', () => open(false));

    const head = el('div', 'head');
    head.append(text('brand', 'Chestha'));
    head.append(el('div', 'spacer'));
    const openApp = el('button', 'ghost');
    openApp.type = 'button';
    openApp.textContent = 'Open Chestha';
    openApp.addEventListener('click', () => send('open'));
    const close = el('button', 'ghost');
    close.type = 'button';
    close.setAttribute('aria-label', 'Close');
    close.textContent = '✕';
    close.addEventListener('click', () => open(false));
    head.append(openApp, close);
    box.append(head);

    const body = el('div', 'body');
    if (sound()) body.append(playing());
    if (sound() && hasTasks()) body.append(el('div', 'rule'));
    if (hasTasks()) body.append(days(), ring());
    if (!sound() && !hasTasks()) {
      const quiet = el('div', 'days');
      quiet.append(text('heading', 'Today'), text('more', 'Nothing playing, nothing due.'));
      body.append(quiet);
    }
    box.append(body);
    return box;
  }

  function hasTasks() {
    const due = tasks();
    return due.pendingCount > 0 || due.done > 0;
  }

  function playing() {
    const track = sound();
    const block = el('div', 'nowplaying');

    const art = el('div', 'art');
    art.append(meter(track.playing, true));
    block.append(art);

    const lines = el('div', 'lines');
    lines.append(
      text('title', track.title),
      text('sub', track.subtitle),
      text('credit', track.credit),
    );

    if (track.media) {
      const row = el('div', 'progress');
      row.append(text('time', clock(track.media.position)));
      const bar = el('div', 'track');
      const fill = el('div', 'fill');
      fill.style.width = `${Math.min(100, (track.media.position / track.media.duration) * 100)}%`;
      bar.append(fill);
      row.append(bar, text('time', clock(track.media.duration)));
      lines.append(row);
    }

    const controls = el('div', 'controls');
    controls.append(
      control(track.playing ? 'pause' : 'play', track.playing ? 'Pause' : 'Play',
        () => send(track.playing ? 'pause' : 'play')),
      control('stop', 'Stop', () => send('stop')),
      control('repeat', track.loop ? 'Repeat on' : 'Repeat off',
        () => send('loop', { loop: !track.loop }), !track.loop),
    );
    lines.append(controls);

    block.append(lines);
    return block;
  }

  function days() {
    const block = el('div', 'days');
    const due = tasks();
    const list = el('ul', 'tasks');
    // Counted against what was actually drawn, not against a hard 2: the
    // snapshot's list is clipped to keep the payload small, so it can hold
    // fewer rows than the room here. Subtracting the assumed number instead
    // of the real one makes "+N more" wrong in exactly the case it matters.
    const drawn = due.pending.slice(0, 2);
    for (const task of drawn) {
      const row = el('li', 'task');
      const done = el('button', 'tick');
      done.type = 'button';
      done.setAttribute('aria-label', `Complete ${task.title}`);
      done.append(glyph('circle'));
      done.addEventListener('click', () => send('complete', { id: task.id }));
      row.append(done, text(task.overdue ? 'tasktext overdue' : 'tasktext', task.title));
      list.append(row);
    }
    if (due.pendingCount > drawn.length) {
      const more = el('li', 'more');
      more.textContent = `+${due.pendingCount - drawn.length} more`;
      list.append(more);
    }
    if (due.pendingCount === 0) {
      const none = el('li', 'more');
      none.textContent = 'Nothing left due today.';
      list.append(none);
    }
    block.append(text('heading', 'Today'), list);
    return block;
  }

  function ring() {
    const due = tasks();
    const total = due.total;
    const fraction = total > 0 ? due.done / total : 0;
    const box = el('div', 'ring');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 48 48');
    svg.setAttribute('aria-hidden', 'true');
    const circumference = 2 * Math.PI * 20;
    svg.innerHTML =
      '<circle cx="24" cy="24" r="20" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="3"/>'
      + `<circle cx="24" cy="24" r="20" fill="none" stroke="#fff" stroke-width="3"`
      + ` stroke-linecap="round" transform="rotate(-90 24 24)"`
      + ` stroke-dasharray="${circumference}" stroke-dashoffset="${circumference * (1 - fraction)}"/>`;
    box.append(svg, text('ringtext', `${due.done}/${total}`));
    return box;
  }

  // ── little builders ──────────────────────────────────────────────────────

  function el(tag, className) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    return node;
  }

  function text(className, value) {
    const node = el('span', className);
    // textContent, never innerHTML: these strings come from the user's own
    // task titles and track names, and this runs inside someone else's page.
    node.textContent = value ?? '';
    return node;
  }

  function clock(seconds) {
    const total = Math.max(0, Math.round(Number(seconds) || 0));
    const mm = Math.floor(total / 60);
    const ss = String(total % 60).padStart(2, '0');
    return `${mm}:${ss}`;
  }

  function meter(active, large) {
    const box = el('span', large ? 'meter large' : 'meter');
    for (let index = 1; index <= 4; index += 1) {
      const bar = el('span', active ? `bar bar${index}` : 'bar still');
      box.append(bar);
    }
    return box;
  }

  function control(name, label, onClick, dim) {
    const button = el('button', dim ? 'control dim' : 'control');
    button.type = 'button';
    button.title = label;
    button.setAttribute('aria-label', label);
    button.append(glyph(name));
    button.addEventListener('click', onClick);
    return button;
  }

  function glyph(name, className) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    if (className) svg.setAttribute('class', className);
    const paths = {
      play: '<path fill="currentColor" d="M8 5.14v13.72a1 1 0 0 0 1.53.85l10.74-6.86a1 1 0 0 0 0-1.7L9.53 4.29A1 1 0 0 0 8 5.14Z"/>',
      pause: '<rect fill="currentColor" x="6.5" y="5" width="3.6" height="14" rx="1.3"/><rect fill="currentColor" x="13.9" y="5" width="3.6" height="14" rx="1.3"/>',
      stop: '<rect fill="currentColor" x="6" y="6" width="12" height="12" rx="2.4"/>',
      repeat: '<g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 10.5A4 4 0 0 1 8.5 6.5H18"/><path d="m15.5 4 3 2.5-3 2.5"/><path d="M19.5 13.5a4 4 0 0 1-4 4H6"/><path d="m8.5 20-3-2.5 3-2.5"/></g>',
      circle: '<circle cx="12" cy="12" r="7.5" fill="none" stroke="currentColor" stroke-width="1.8"/>',
      check: '<path d="m5 12.5 4.5 4.5L19 7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
    };
    svg.innerHTML = paths[name] ?? paths.check;
    return svg;
  }

  /** The shadow root's whole stylesheet. Mirrors island.css — change both. */
  function styles() {
    const sheet = document.createElement('style');
    sheet.textContent = `
      :host { all: initial; }
      * { box-sizing: border-box; margin: 0; padding: 0; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
      .wrap { display: flex; justify-content: center; pointer-events: none; }
      .pill, .panel {
        pointer-events: auto;
        background: #000;
        color: #fff;
        border: 1px solid rgba(255,255,255,0.1);
        border-top: 0;
        box-shadow: 0 18px 40px -12px rgba(0,0,0,0.65);
        animation: drop 320ms cubic-bezier(0.22,1,0.36,1) both;
      }
      .pill {
        display: flex; align-items: center; gap: 10px;
        height: 32px; padding: 0 16px;
        border-radius: 0 0 20px 20px;
        cursor: pointer;
      }
      .label {
        font-size: 11px; font-weight: 500; color: rgba(255,255,255,0.9);
        max-width: 14rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }
      .count {
        font-size: 10px; font-weight: 600; font-variant-numeric: tabular-nums;
        background: rgba(255,255,255,0.15); border-radius: 999px; padding: 1px 6px;
      }
      .panel {
        width: min(94vw, 46rem);
        padding: 8px 16px 16px;
        border-radius: 0 0 32px 32px;
        animation: drop 320ms cubic-bezier(0.22,1,0.36,1) both, reveal 220ms cubic-bezier(0.22,1,0.36,1) 60ms both;
      }
      .head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
      .brand { font-size: 11px; font-weight: 600; letter-spacing: 0.02em; }
      .spacer { flex: 1; }
      .ghost {
        background: none; border: 0; cursor: pointer;
        color: rgba(255,255,255,0.45); font-size: 11px; padding: 2px 6px; border-radius: 8px;
      }
      .ghost:hover { color: #fff; background: rgba(255,255,255,0.1); }
      .body { display: flex; align-items: stretch; gap: 16px; }
      .rule { width: 1px; background: rgba(255,255,255,0.1); flex: none; }
      .nowplaying { display: flex; align-items: center; gap: 12px; min-width: 0; flex: 1; }
      .art {
        width: 64px; height: 64px; flex: none; border-radius: 16px;
        background: rgba(255,255,255,0.08); box-shadow: inset 0 0 0 1px rgba(255,255,255,0.1);
        display: grid; place-items: center;
      }
      .lines { min-width: 0; flex: 1; }
      .titlerow { display: flex; align-items: center; gap: 6px; min-width: 0; }
      .title { font-size: 14px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .badge {
        font-size: 10px; border: 1px solid rgba(255,255,255,0.2); border-radius: 999px;
        padding: 0 6px; color: rgba(255,255,255,0.6); flex: none;
      }
      .sub { display: block; font-size: 11px; color: rgba(255,255,255,0.55); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .credit { display: block; font-size: 11px; color: rgba(255,255,255,0.35); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .progress { display: flex; align-items: center; gap: 8px; margin-top: 6px; }
      .time { font-size: 10px; color: rgba(255,255,255,0.45); font-variant-numeric: tabular-nums; flex: none; }
      .track { flex: 1; min-width: 0; height: 4px; border-radius: 999px; background: rgba(255,255,255,0.15); overflow: hidden; }
      .fill { height: 100%; background: #fff; border-radius: 999px; transition: width 1000ms linear; }
      .controls { display: flex; align-items: center; gap: 2px; margin-top: 6px; }
      .control {
        background: none; border: 0; cursor: pointer; padding: 6px; border-radius: 8px;
        color: rgba(255,255,255,0.8); display: grid; place-items: center;
      }
      .control:hover { background: rgba(255,255,255,0.1); color: #fff; }
      .control.dim { color: rgba(255,255,255,0.4); }
      .control svg { width: 16px; height: 16px; display: block; }
      .days { min-width: 0; flex: 1; }
      .heading { font-size: 9px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: rgba(255,255,255,0.45); }
      .tasks { list-style: none; margin-top: 4px; }
      .task { display: flex; align-items: center; gap: 6px; min-width: 0; }
      .tick { background: none; border: 0; cursor: pointer; padding: 2px; color: rgba(255,255,255,0.4); display: grid; place-items: center; }
      .tick:hover { color: #fff; }
      .tick svg { width: 14px; height: 14px; display: block; }
      .tasktext { font-size: 11px; color: rgba(255,255,255,0.85); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .tasktext.overdue { color: #fff; font-weight: 600; }
      .more { font-size: 11px; color: rgba(255,255,255,0.4); }
      .ring { position: relative; width: 64px; height: 64px; flex: none; display: grid; place-items: center; }
      .ring svg { position: absolute; inset: 0; width: 100%; height: 100%; }
      .ringtext { position: relative; font-size: 11px; font-weight: 600; font-variant-numeric: tabular-nums; }
      .muted { color: rgba(255,255,255,0.6); width: 14px; height: 14px; display: block; }
      .meter { display: flex; align-items: flex-end; gap: 2px; }
      .meter.large { gap: 4px; }
      .bar { width: 2px; height: 10px; background: #fff; border-radius: 999px; transform-origin: bottom; animation: bar 900ms ease-in-out infinite; }
      .meter.large .bar { width: 4px; height: 20px; }
      .bar.still { animation: none; transform: scaleY(0.35); }
      .bar1 { animation-delay: 0ms; height: 5px; }
      .bar2 { animation-delay: 150ms; height: 10px; }
      .bar3 { animation-delay: 300ms; height: 7px; }
      .bar4 { animation-delay: 450ms; height: 4px; }
      .meter.large .bar1 { height: 10px; }
      .meter.large .bar2 { height: 20px; }
      .meter.large .bar3 { height: 14px; }
      .meter.large .bar4 { height: 7px; }
      @keyframes drop { from { transform: translateY(-100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
      @keyframes reveal { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
      @keyframes bar { 0%, 100% { transform: scaleY(0.35); } 50% { transform: scaleY(1); } }
      @media (prefers-reduced-motion: reduce) {
        .pill, .panel, .bar, .fill { animation: none !important; transition: none !important; }
        .bar { transform: scaleY(0.7); }
      }
    `;
    return sheet;
  }
}
