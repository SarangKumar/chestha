import Link from 'next/link';
import { SITE_SOCIALS } from '@chestha/core';
import { BuyMeCoffeeButton } from '@/components/BuyMeCoffeeButton';
import { Icon } from '@/components/marketing/Icon';

export const metadata = {
  title: 'About',
  description:
    'What Chestha is, where your data lives, what reaches the network, and who made it.',
};

/**
 * About answers "what is this and where is my data".
 *
 * Every claim here is checked against the code. An About page that overclaims
 * on privacy is worse than none at all — so the network section names each
 * request the app can make, what it sends, and what comes back.
 */
export default function AboutPage() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-10 sm:px-6">
      <header className="mb-6 space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
          About Chestha
        </h1>
        <p className="text-card leading-relaxed text-ink-muted">
          A local-first personal workspace: tasks, a calendar, ambient sound, a
          dashboard you arrange yourself, and a tracker for data-structures practice.
        </p>
      </header>

      <Panel>
        <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-[auto_1fr]">
          <dt className="text-meta font-medium text-ink-muted">Version</dt>
          <dd className="text-card tabular-nums text-ink">
            {process.env.NEXT_PUBLIC_APP_VERSION}
          </dd>

          <dt className="text-meta font-medium text-ink-muted">Runs as</dt>
          <dd className="text-card leading-relaxed text-ink">
            A Chrome extension that replaces the New Tab page, with this website
            alongside it for posts and accounts. The two keep separate workspace
            data, because browsers treat them as separate origins — move data
            across with Export and Import.
          </dd>

          <dt className="text-meta font-medium text-ink-muted">Where data lives</dt>
          <dd className="text-card leading-relaxed text-ink">
            In your browser, on your device, in IndexedDB — including when you are
            signed in. An export file is the only copy that survives clearing your
            browser data.
          </dd>
        </dl>
      </Panel>

      <Panel>
        <h2 className="flex items-center gap-2 text-card font-semibold text-ink">
          <Icon name="lock" className="size-4 text-ink-muted" /> Privacy
        </h2>
        <p className="mt-2 text-card leading-relaxed text-ink-muted">
          No analytics, no telemetry, no crash reporting. Nothing about how you use
          the app is recorded anywhere but your own browser.
        </p>
        <p className="mt-3 text-card leading-relaxed text-ink-muted">
          One request is not optional: because most sections need an account, a New
          Tab asks this site whether you are signed in. It sends your Chestha session
          cookie and nothing else, and the answer is your username and nothing else —
          so it identifies you to your own account, on our own site, and to nobody
          else. It is cached for ten minutes, which is why opening ten tabs is one
          request and why the workspace still knows what to show you offline. Your
          widget board does not need it and works signed out.
        </p>
        <p className="mt-3 text-card leading-relaxed text-ink-muted">
          One more request follows from that one. While a{' '}
          <strong className="font-medium text-ink">profile card</strong> is on screen
          in the extension — the card widget on your board, or the account menu while
          it is open — it asks this site for your own handle, interests, counts and
          reading streak. Same cookie, same origin, and it answers only for the
          account the cookie belongs to: it takes no username, so it is not a way to
          look anyone else up.
        </p>
        <p className="mt-3 text-card leading-relaxed text-ink-muted">
          <strong className="font-medium text-ink">Writing a post</strong> is the one
          request the workspace makes that writes rather than reads. It sends what you
          typed to the same site, with the same cookie, when you open the Writing
          section and when you save, publish or delete — and it can reach no post but
          your own.
        </p>
        <p className="mt-3 text-card leading-relaxed text-ink-muted">
          Three further things can reach the internet, and only once you ask them to.
          The <strong className="font-medium text-ink">GitHub activity</strong> widget
          reads public activity from <Code>api.github.com</Code> after you enter a
          username. The <strong className="font-medium text-ink">Weather</strong>{' '}
          widget reads a forecast from <Code>open-meteo.com</Code> after you set a
          location. <strong className="font-medium text-ink">Read mode</strong>{' '}
          fetches published posts from this site after you switch the start screen
          away from your widgets — with no account and no cookie, so we cannot tell
          who asked. All three are inert until then, each sends only what it needs to
          answer the question, and reversing it ends the requests. Nothing else in the
          running app contacts the network.
        </p>
      </Panel>

      <Panel>
        <h2 className="text-card font-semibold text-ink">Made by</h2>
        <p className="mt-2 text-card leading-relaxed text-ink-muted">
          Chestha is built by Sarang Kumar. Links open in a new tab.
        </p>
        <ul className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          {SITE_SOCIALS.map((item) => (
            <li key={item.id}>
              <a
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-card font-medium text-ink underline decoration-line-strong underline-offset-2 transition-colors duration-150 hover:decoration-ink"
              >
                {item.label}
              </a>
            </li>
          ))}
          <li><BuyMeCoffeeButton size="sm" variant="default" /></li>
        </ul>
      </Panel>

      <Panel>
        <h2 className="text-card font-semibold text-ink">Credits</h2>
        <ul className="mt-2 space-y-2 text-card leading-relaxed text-ink-muted">
          <li>
            Ambient sounds are recordings from{' '}
            <a
              href="https://mixkit.co/free-sound-effects/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline decoration-line-strong underline-offset-2 transition-colors duration-150 hover:decoration-ink"
            >
              Mixkit
            </a>
            , used under the Mixkit Free License and bundled with the app — they play
            from your device, not from the internet. Files you add yourself appear
            beside them, credited as you describe them.
          </li>
          <li>
            Question metadata for the practice tracker is built from published,
            permissively licensed datasets. Only facts are stored — title, difficulty,
            topics, id. Problem statements belong to LeetCode and are never copied.
          </li>
          <li>Backgrounds other than your own images are drawn from the theme&rsquo;s own colours.</li>
        </ul>
      </Panel>

      <Panel>
        <h2 className="text-card font-semibold text-ink">Getting around</h2>
        <p className="mt-2 text-card leading-relaxed text-ink-muted">
          In the workspace, press <Kbd>⌘K</Kbd> for the command palette, which reaches
          every section and finds any task. <Kbd>N</Kbd> captures a task from anywhere.
          Every shortcut can be rebound in Settings, which is also where you hide
          sections you do not use. For a map of every page and widget, see the{' '}
          <Link
            href="/guide"
            className="font-medium text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink"
          >
            Guide
          </Link>
          .
        </p>
      </Panel>
    </div>
  );
}

function Panel({ children }) {
  return <section className="rounded-panel border border-line bg-surface p-5">{children}</section>;
}

function Code({ children }) {
  return <code className="font-mono text-meta">{children}</code>;
}

function Kbd({ children }) {
  return (
    <kbd className="rounded-chip border border-line bg-inset px-1.5 py-0.5 font-mono text-[10px]">
      {children}
    </kbd>
  );
}
