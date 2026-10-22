import { useEffect } from 'react';
import { useWorkspace } from '../../app/StoreProvider.jsx';
import { Panel, SectionHeader, cx } from '../../components/ui.jsx';
import { DsaHome } from './DsaHome.jsx';
import { DsaLibrary } from './DsaLibrary.jsx';
import { DsaLists } from './DsaLists.jsx';

/**
 * Sub-navigation lives inside the section rather than in the rail: the rail has
 * five top-level items and adding six more would wreck it.
 *
 * Only the tabs backed by implemented functionality are shown. The rest arrive in
 * later increments and are deliberately absent rather than present-and-inert.
 */
const TABS = [
  { id: 'home', label: 'Today', render: DsaHome },
  { id: 'library', label: 'Library', render: DsaLibrary },
  { id: 'lists', label: 'My lists', render: DsaLists },
];

export function DsaSection({ tab, onChangeTab }) {
  const { store, status } = useWorkspace();
  const active = TABS.find((t) => t.id === tab) ?? TABS[0];
  const Render = active.render;
  const libraryReady = status.loadedAreas.includes('dsa.library');

  // The library is a lazy storage area; opening this section is what loads it.
  useEffect(() => {
    if (status.ready) store.ensureArea('dsa.library');
  }, [store, status.ready]);

  return (
    <div>
      <SectionHeader
        title="DSA"
        description="Track what you have actually solved, and what is due to come back."
      />

      <div role="tablist" aria-label="DSA views" className="mb-4 flex flex-wrap gap-1 rounded-card border border-line bg-surface p-1 shadow-card">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active.id === item.id}
            onClick={() => onChangeTab(item.id)}
            className={cx(
              'rounded-chip px-3 py-1.5 text-sm font-medium transition-colors duration-150',
              active.id === item.id ? 'bg-accent-soft text-ink' : 'text-ink-muted hover:bg-hover hover:text-ink',
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {libraryReady ? <Render onChangeTab={onChangeTab} /> : (
        <Panel className="p-5">
          <p className="text-sm text-ink-muted">Loading your question library…</p>
        </Panel>
      )}
    </div>
  );
}
