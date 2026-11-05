import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BODY_MAX, EXCERPT_MAX, MAX_CATEGORIES, MAX_TAGS, POST_STATUS_LABELS, TITLE_MAX,
  derivedExcerpt, interestLabel, nextStatuses, normalizePostTags, postPageUrl,
  readingMinutes,
} from '@chestha/core';
import {
  createDraft, deletePost, listOwnPosts, savePost,
} from '../app/ownPosts.js';
import { useWorkspace } from '../app/StoreProvider.jsx';
import {
  Badge, Button, EmptyState, Field, Panel, TextArea, TextInput, cx,
} from '../components/ui.jsx';
import { Icon } from '../components/icons.jsx';
import { isExtensionRuntime } from '../app/platform.js';
import { SITE_URL } from '../siteLinks.js';

/**
 * Writing and publishing, from the New Tab.
 *
 * **Nothing here is stored locally.** Every other section in this app is
 * local-first and syncs afterwards; posts are the opposite, because a post is
 * a *published* artefact whose canonical copy is the website's database. A
 * draft cached in IndexedDB and edited on two devices would need the same
 * merge machinery as the workspace for far less benefit — and worse, an author
 * could edit a stale copy and overwrite the published version. So the list is
 * fetched on open and every save is a round trip, and the section says plainly
 * when it cannot reach the server rather than pretending to have saved.
 *
 * **Bodies are Markdown and are never rendered as HTML here.** The extension
 * has no sanitiser — the same reason Read mode carries no bodies — so the
 * editor is a plain textarea and the preview is the excerpt. Reading a post
 * happens on the website.
 */
export function Writing() {
  const { notify } = useWorkspace();
  const [posts, setPosts] = useState(null);
  // The categories this deployment actually has, straight from the server.
  // Never defaulted to core's seed list: offering a category the database has
  // not seeded would produce a save the author cannot fix.
  const [categories, setCategories] = useState([]);
  const [error, setError] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const result = await listOwnPosts();
    if (!result.ok) {
      setError(result.error);
      // The list is left as it was: an author mid-edit should not have their
      // work replaced by an error state.
      return;
    }
    setError(null);
    setPosts(result.posts ?? []);
    setCategories(result.categories ?? []);
  }, []);

  useEffect(() => { load(); }, [load]);

  const editing = useMemo(
    () => (posts ?? []).find((post) => post.id === editingId) ?? null,
    [posts, editingId],
  );

  const startDraft = async () => {
    setBusy(true);
    const result = await createDraft({ title: '', body: '' });
    setBusy(false);
    if (!result.ok) { notify(result.error, { tone: 'danger' }); return; }
    await load();
    setEditingId(result.post.id);
  };

  if (error && posts === null) {
    return (
      <EmptyState
        title="Could not reach your posts"
        description={error}
        action={<Button size="sm" onClick={load}>Try again</Button>}
      />
    );
  }

  if (posts === null) {
    return <Panel className="p-5"><p className="text-sm text-ink-muted">Loading your posts…</p></Panel>;
  }

  if (editing) {
    return (
      <PostEditor
        post={editing}
        categories={categories}
        onDone={async () => { setEditingId(null); await load(); }}
        onChanged={load}
      />
    );
  }

  return (
    <div className="space-y-4">
      {error ? (
        <Panel className="border-warn bg-warn-soft p-3">
          <p className="text-sm text-ink">{error} Showing what was last loaded.</p>
        </Panel>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-muted">
          {posts.length === 0
            ? 'Nothing written yet.'
            : `${posts.length} post${posts.length === 1 ? '' : 's'}`}
        </p>
        <Button size="sm" tone="primary" onClick={startDraft} disabled={busy}>
          {busy ? 'Creating…' : 'New draft'}
        </Button>
      </div>

      {posts.length === 0 ? (
        <EmptyState
          title="Write something"
          description="Drafts live on the website and are private until you publish them."
          action={<Button size="sm" tone="primary" onClick={startDraft}>New draft</Button>}
        />
      ) : (
        <Panel className="overflow-hidden">
          <ul className="divide-y divide-line">
            {posts.map((post) => (
              <li key={post.id} className="flex flex-wrap items-start gap-x-3 gap-y-2 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-sm font-medium text-ink">
                      {post.title || 'Untitled'}
                    </h3>
                    <Badge tone={post.status === 'published' ? 'ok' : 'neutral'}>
                      {POST_STATUS_LABELS[post.status]}
                    </Badge>
                  </div>
                  <p className="mt-0.5 line-clamp-1 text-meta text-ink-muted">
                    {derivedExcerpt(post, 120) || 'No body yet.'}
                  </p>
                  <PostStats post={post} />
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button size="sm" onClick={() => setEditingId(post.id)}>Edit</Button>
                  {post.status === 'published' ? (
                    <Button
                      as="a"
                      size="sm"
                      tone="quiet"
                      href={postPageUrl(SITE_URL, post.slug)}
                      target={isExtensionRuntime() ? '_blank' : '_self'}
                      rel="noopener noreferrer"
                    >
                      View
                      <Icon name="external" className="size-3.5" />
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}

/**
 * The numbers for one post.
 *
 * Views and readers are shown as two figures and never added together: views
 * counts everybody including anonymous readers and rises on a re-read, while
 * readers counts distinct signed-in people. A single "audience" number would
 * be wrong in one direction or the other depending on which it was.
 */
function PostStats({ post }) {
  const stats = post.stats ?? {};
  if (post.status !== 'published') {
    return (
      <p className="mt-1 text-meta text-ink-faint">
        {post.blocker ? post.blocker : 'Not published yet — no numbers until it is.'}
      </p>
    );
  }
  return (
    <dl className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-meta text-ink-faint">
      <Stat label="views" value={stats.views} />
      <Stat label="readers" value={stats.readers} />
      <Stat label="upvotes" value={stats.upvotes} />
      <Stat label="saves" value={stats.bookmarks} />
      <span className="tabular-nums">{readingMinutes(post.body)} min read</span>
    </dl>
  );
}

function Stat({ label, value }) {
  return (
    <span className="inline-flex items-baseline gap-1">
      <dt className="sr-only">{label}</dt>
      <dd className="font-medium tabular-nums text-ink-muted">
        {Number.isFinite(value) ? value : '—'}
      </dd>
      <span>{label}</span>
    </span>
  );
}

/**
 * The editor.
 *
 * Local state is the draft being typed; the server holds the truth. Nothing
 * auto-saves — an autosave against a remote store with no conflict handling is
 * how an author loses a paragraph to a dropped connection without being told.
 * Save is explicit and says what happened.
 */
function PostEditor({ post, categories, onDone, onChanged }) {
  const { notify } = useWorkspace();
  const [draft, setDraft] = useState({
    title: post.title ?? '',
    body: post.body ?? '',
    excerpt: post.excerpt ?? '',
    tags: (post.tags ?? []).join(', '),
    categories: post.categories ?? [],
  });
  const [saving, setSaving] = useState(false);

  const dirty = draft.title !== (post.title ?? '')
    || draft.body !== (post.body ?? '')
    || draft.excerpt !== (post.excerpt ?? '')
    || draft.tags !== (post.tags ?? []).join(', ')
    // Order is irrelevant to a set of categories, but the server stores them in
    // the catalogue's order, so comparing the joined strings is enough.
    || draft.categories.join(',') !== (post.categories ?? []).join(',');

  const patchFrom = () => ({
    title: draft.title,
    body: draft.body,
    excerpt: draft.excerpt,
    // Normalised here only so the chip preview matches what will be stored;
    // the server normalises again, and its answer is what wins.
    tags: normalizePostTags(draft.tags.split(',')),
    categories: draft.categories,
  });

  /**
   * At most `MAX_CATEGORIES`, and the limit is enforced by refusing the click
   * rather than by silently dropping the oldest pick — a chip that appears to
   * tick and then unticks itself reads as a bug.
   */
  const toggleCategory = (slug) => {
    setDraft((d) => {
      if (d.categories.includes(slug)) {
        return { ...d, categories: d.categories.filter((item) => item !== slug) };
      }
      if (d.categories.length >= MAX_CATEGORIES) return d;
      return { ...d, categories: [...d.categories, slug] };
    });
  };

  const save = async (status) => {
    setSaving(true);
    const result = await savePost(post.id, {
      ...patchFrom(),
      ...(status ? { status } : {}),
    });
    setSaving(false);

    if (!result.ok) { notify(result.error, { tone: 'danger' }); return; }
    notify(status ? `Post ${POST_STATUS_LABELS[status].toLowerCase()}` : 'Saved');
    await onChanged();
  };

  const remove = async () => {
    const result = await deletePost(post.id);
    if (!result.ok) { notify(result.error, { tone: 'danger' }); return; }
    notify('Post deleted', { tone: 'danger' });
    await onDone();
  };

  const previewTags = normalizePostTags(draft.tags.split(','));
  const transitions = nextStatuses(post);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button size="sm" tone="quiet" onClick={onDone}>← All posts</Button>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => save()} disabled={saving || !dirty}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
          {transitions.map((status) => (
            <Button
              key={status}
              size="sm"
              tone={status === 'published' ? 'primary' : 'default'}
              onClick={() => save(status)}
              disabled={saving}
            >
              {status === 'published' ? 'Publish' : POST_STATUS_LABELS[status]}
            </Button>
          ))}
          <Button size="sm" tone="danger" onClick={remove} disabled={saving}>Delete</Button>
        </div>
      </div>

      {post.blocker ? (
        <Panel className="border-warn bg-warn-soft p-3">
          <p className="text-sm text-ink">{post.blocker}</p>
        </Panel>
      ) : null}

      <Panel className="space-y-4 p-4">
        <Field label="Title" hint={`${draft.title.length}/${TITLE_MAX}`}>
          <TextInput
            value={draft.title}
            maxLength={TITLE_MAX}
            placeholder="What is this about?"
            onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
          />
        </Field>

        <Field
          label="Body"
          hint={`Markdown. ${readingMinutes(draft.body)} min read · ${draft.body.length}/${BODY_MAX}`}
        >
          <TextArea
            value={draft.body}
            rows={14}
            maxLength={BODY_MAX}
            placeholder="Write here. It is rendered on the website."
            onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
          />
        </Field>

        <Field
          label="Excerpt"
          hint={`Optional — the first lines are used if you leave it empty. ${draft.excerpt.length}/${EXCERPT_MAX}`}
        >
          <TextArea
            value={draft.excerpt}
            rows={2}
            maxLength={EXCERPT_MAX}
            onChange={(e) => setDraft((d) => ({ ...d, excerpt: e.target.value }))}
          />
        </Field>

        <Field
          label="Categories"
          hint={`Required to publish. Pick up to ${MAX_CATEGORIES} — ${draft.categories.length} chosen.`}
        >
          {categories.length === 0 ? (
            // Not an error and not a spinner: the list loaded and is genuinely
            // empty, which means the Category table was never seeded. Saying
            // which command fixes it beats an empty box.
            <p className="text-meta text-ink-faint">
              This site has no categories yet, so a post cannot be published.
              Run <code className="font-mono">npm run db:seed</code> to create them.
            </p>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {categories.map((category) => {
                const picked = draft.categories.includes(category.slug);
                // Only the unpicked ones are disabled at the limit — removing
                // one must always stay possible, or the author is stuck.
                const full = !picked && draft.categories.length >= MAX_CATEGORIES;
                return (
                  <li key={category.slug}>
                    <button
                      type="button"
                      aria-pressed={picked}
                      disabled={full}
                      onClick={() => toggleCategory(category.slug)}
                      title={full ? `Pick at most ${MAX_CATEGORIES}` : category.name}
                      className={cx(
                        'inline-flex items-center gap-1.5 rounded-chip border px-2.5 py-1 text-meta transition-colors duration-150',
                        picked
                          ? 'border-transparent bg-accent text-on-accent'
                          : 'border-line text-ink-muted hover:bg-hover hover:text-ink',
                        full && 'cursor-not-allowed opacity-40 hover:bg-transparent',
                      )}
                    >
                      {picked && <Icon name="check" className="size-3" />}
                      {category.name}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Field>

        <Field label="Tags" hint={`Comma separated, up to ${MAX_TAGS}. They are how readers find this.`}>
          <TextInput
            value={draft.tags}
            placeholder="react, performance, debugging"
            onChange={(e) => setDraft((d) => ({ ...d, tags: e.target.value }))}
          />
        </Field>

        {previewTags.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5">
            {previewTags.map((tag) => (
              <li
                key={tag}
                className="inline-flex rounded-chip border border-line px-2 py-0.5 text-meta text-ink-muted"
              >
                {interestLabel(tag)}
              </li>
            ))}
          </ul>
        ) : null}
      </Panel>

      {post.status === 'published' ? (
        <Panel className="p-4">
          <h3 className="text-card font-semibold text-ink">How it is doing</h3>
          <PostStats post={post} />
          {/* This used to say categories were "set on the website". They were
              not: no website editor exists, so publishing was impossible from
              anywhere. Categories are now picked above; the cover image is
              still the one field no surface can set. */}
          <p className="mt-2 text-meta text-ink-faint">
            The cover image cannot be set yet, from here or the website.
          </p>
        </Panel>
      ) : null}
    </div>
  );
}
