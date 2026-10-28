import { HIDEABLE_SECTIONS } from '@chestha/core';
import { Panel, SectionHeader } from '../components/ui.jsx';
import { Icon } from '../components/icons.jsx';
import { SITE_SOCIALS } from '../siteLinks.js';
import { BuyMeCoffeeButton } from '../components/BuyMeCoffeeButton.jsx';
import { isExtensionRuntime } from '../app/platform.js';

/**
 * About answers "what is this and where is my data". It stays out of the nav
 * rail on purpose. On the website it is linked from the header and the site
 * footer; in the extension New Tab it remains reachable from the command
 * palette and `#/about`.
 *
 * Everything stated here is checked against the code. An About page that
 * overclaims on privacy is worse than none at all.
 */
export function About({ onNavigate }) {
  const onWebsite = !isExtensionRuntime();

  return (
    <div className="space-y-4">
      <SectionHeader
        title="About Chestha"
        description="A local-first personal workspace: tasks, a calendar, ambient sound, a dashboard you arrange yourself, and a tracker for data-structures practice."
      />

      <Panel className="p-5">
        <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-[auto_1fr]">
          <dt className="text-meta font-medium text-ink-muted">Version</dt>
          <dd className="tabular text-sm text-ink">{__APP_VERSION__}</dd>

          <dt className="text-meta font-medium text-ink-muted">Runs as</dt>
          <dd className="text-sm text-ink">
            A web app, or a Chrome extension that replaces the New Tab page. The two keep
            separate data, because browsers treat them as separate origins — move data across
            with Export and Import.
          </dd>

          <dt className="text-meta font-medium text-ink-muted">Where data lives</dt>
          <dd className="text-sm text-ink">
            In this browser, on this device, in IndexedDB. There is no account and no server to
            sync to, so an export file is the only copy that survives clearing your browser data.
          </dd>
        </dl>
      </Panel>

      <Panel className="p-5">
        <h2 className="flex items-center gap-2 text-card font-semibold text-ink">
          <Icon name="lock" className="size-4 text-ink-muted" /> Privacy
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          No account, no analytics, no telemetry, no crash reporting. Nothing about how you use
          the app is recorded anywhere but your own browser.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-ink-muted">
          Two widgets can reach the internet, and only once you ask them to. The{' '}
          <strong className="font-medium text-ink">GitHub activity</strong> widget reads public
          activity from <code className="font-mono text-xs">api.github.com</code> after you enter
          a username. The <strong className="font-medium text-ink">Weather</strong> widget reads a
          forecast from <code className="font-mono text-xs">open-meteo.com</code> after you set a
          location. Both are inert until then, both send only what they need to answer the
          question, and removing the widget ends the requests. Nothing else in the running app
          contacts the network.
        </p>
      </Panel>

      <Panel className="p-5">
        <h2 className="text-card font-semibold text-ink">Made by</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          Chestha is built by Sarang Kumar. Links open in a new tab.
        </p>
        <ul className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          {SITE_SOCIALS.map((item) => (
            <li key={item.id}>
              <a
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-ink underline decoration-line-strong underline-offset-2 transition-colors duration-150 hover:decoration-ink"
              >
                {item.label}
              </a>
            </li>
          ))}
          <li>
            <BuyMeCoffeeButton size="sm" variant="outline" />
          </li>
        </ul>
      </Panel>

      <Panel className="p-5">
        <h2 className="text-card font-semibold text-ink">Credits</h2>
        <ul className="mt-2 space-y-2 text-sm leading-relaxed text-ink-muted">
          <li>
            Ambient sounds are synthesised in the browser with the Web Audio API — no recordings
            are shipped. Files you add yourself appear beside them, credited as you describe them.
          </li>
          <li>
            Question metadata for the practice tracker is built from published, permissively
            licensed datasets. Only facts are stored — title, difficulty, topics, id. Problem
            statements belong to LeetCode and are never copied.
          </li>
          <li>Backgrounds other than your own images are drawn from the theme's own colours.</li>
        </ul>
      </Panel>

      <Panel className="p-5">
        <h2 className="text-card font-semibold text-ink">Getting around</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          Press <kbd className="rounded-chip border border-line bg-inset px-1.5 py-0.5 font-mono text-[10px]">⌘K</kbd>{' '}
          for the command palette, which reaches every section and finds any task.{' '}
          <kbd className="rounded-chip border border-line bg-inset px-1.5 py-0.5 font-mono text-[10px]">N</kbd>{' '}
          captures a task from anywhere. Every shortcut can be rebound in{' '}
          <button
            type="button"
            onClick={() => onNavigate?.('settings')}
            className="font-medium text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink"
          >
            Settings
          </button>
          , which is also where you hide any of the {HIDEABLE_SECTIONS.length} main sections you
          do not use.
          {onWebsite && (
            <>
              {' '}
              On this website, About is also linked from the top bar and the footer.
            </>
          )}
        </p>
      </Panel>
    </div>
  );
}
