import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { BrandMark } from './BrandMark.jsx';
import { CHROME_STORE_URL, GITHUB_REPO } from '../siteLinks.js';
import { Icon } from '../components/icons.jsx';
import { useWorkspace } from '../app/StoreProvider.jsx';
import { formatStarCount, useGithubStars } from './useGithubStars.js';

const NAV = [
  { id: 'workspace', label: 'Workspace', section: 'dashboard' },
  { id: 'about', label: 'About', section: 'about' },
  { id: 'changelog', label: 'Changelog', section: 'changelog' },
  { id: 'guide', label: 'Guide', section: 'guide' },
];

function MenuIcon() {
  return (
    <span className="flex w-3.5 flex-col gap-0.5" aria-hidden>
      <span className="block h-0.5 w-full rounded bg-foreground" />
      <span className="block h-0.5 w-full rounded bg-foreground" />
      <span className="block h-0.5 w-full rounded bg-foreground" />
    </span>
  );
}

/**
 * Website marketing navbar — brand + links; right side is GitHub (with live
 * star count) and theme toggle. Height stays h-12.
 */
export function MarketingHeader({ onNavigate }) {
  const [open, setOpen] = useState(false);
  const { state, actions } = useWorkspace();
  const stars = useGithubStars();
  const starLabel = formatStarCount(stars);
  const theme = state.settings.theme;
  const nextTheme = theme === 'dark' ? 'light' : 'dark';
  const themeIcon = theme === 'dark' ? 'sun' : 'moon';

  const go = (section) => {
    setOpen(false);
    onNavigate?.(section);
  };

  const addToChrome = () => {
    setOpen(false);
    if (!CHROME_STORE_URL || CHROME_STORE_URL === '#') {
      go('dashboard');
      return;
    }
    window.open(CHROME_STORE_URL, '_blank', 'noopener,noreferrer');
  };

  const toggleTheme = () => {
    actions.setSetting('theme', nextTheme);
  };

  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/70 backdrop-blur-xl">
      <div className="relative mx-auto flex h-12 w-full max-w-6xl items-center gap-2.5 px-4 sm:gap-3 sm:px-6">
        <div className="md:hidden">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger>
              <Button variant="outline" size="icon-sm" type="button" aria-label="Open menu">
                <MenuIcon />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="gap-0 p-0">
              <SheetHeader className="border-b border-border px-4 py-4">
                <SheetTitle className="flex items-center gap-2.5">
                  <BrandMark className="size-7" width={28} height={28} alt="" />
                  <span className="flex flex-col leading-tight">
                    <span className="chestha-display text-sm">Chestha</span>
                    <span className="text-[11px] font-normal text-muted-foreground">
                      Local-first workspace
                    </span>
                  </span>
                </SheetTitle>
                <SheetDescription className="sr-only">Marketing navigation</SheetDescription>
              </SheetHeader>
              <nav className="flex flex-col gap-1 p-3" aria-label="Mobile">
                {NAV.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => go(item.section)}
                    className="rounded-lg px-3 py-2.5 text-left text-[13px] font-medium text-foreground transition-colors duration-150 hover:bg-foreground/5"
                  >
                    {item.label}
                  </button>
                ))}
                <a
                  href={GITHUB_REPO.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg px-3 py-2.5 text-left text-[13px] font-medium text-foreground transition-colors duration-150 hover:bg-foreground/5"
                  onClick={() => setOpen(false)}
                >
                  GitHub{starLabel ? ` · ★ ${starLabel}` : ''}
                </a>
                <button
                  type="button"
                  onClick={() => { toggleTheme(); setOpen(false); }}
                  className="rounded-lg px-3 py-2.5 text-left text-[13px] font-medium text-foreground transition-colors duration-150 hover:bg-foreground/5"
                >
                  Switch to {nextTheme} theme
                </button>
                <button
                  type="button"
                  onClick={addToChrome}
                  className="rounded-lg px-3 py-2.5 text-left text-[13px] font-medium text-foreground transition-colors duration-150 hover:bg-foreground/5"
                >
                  Add to Chrome
                </button>
              </nav>
            </SheetContent>
          </Sheet>
        </div>

        <button
          type="button"
          onClick={() => go('home')}
          className="group flex min-w-0 shrink-0 items-center gap-2 sm:gap-2.5"
          aria-label="Chestha home"
        >
          <BrandMark className="size-7" width={28} height={28} />
          <span className="chestha-display text-sm text-foreground">Chestha</span>
        </button>

        <nav className="ml-1 hidden items-center gap-0.5 md:flex" aria-label="Main">
          {NAV.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => go(item.section)}
              className="inline-flex h-auto items-center rounded-lg bg-transparent px-2 py-1 text-[13px] font-medium text-muted-foreground transition-colors duration-150 hover:bg-foreground/5 hover:text-foreground"
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1 sm:gap-1.5">
          <a
            href={GITHUB_REPO.href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[13px] font-medium text-muted-foreground transition-colors duration-150 hover:bg-foreground/5 hover:text-foreground"
            aria-label={starLabel ? `Chestha on GitHub, ${starLabel} stars` : 'Chestha on GitHub'}
          >
            <Icon name="github" className="size-4" />
            {starLabel ? (
              <span className="tabular-nums text-xs">{starLabel}</span>
            ) : null}
          </a>

          <Button
            variant="ghost"
            size="icon-sm"
            type="button"
            onClick={toggleTheme}
            aria-label={`Switch to ${nextTheme} theme`}
            title={`Switch to ${nextTheme} theme`}
          >
            <Icon name={themeIcon} className="size-4" />
          </Button>
        </div>
      </div>
    </header>
  );
}
