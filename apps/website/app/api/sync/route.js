import {
  AREA_MERGE, SYNC_AREAS, coerceArea, isSyncableArea, mergeArea,
} from '@chestha/core';
import { prisma } from '@chestha/db';
import { currentUserId } from '@/lib/session';

/**
 * Workspace sync. One area per request, merged server-side.
 *
 * The whole merge contract already lived in `packages/core/src/sync/areas.js`
 * and the `WorkspaceArea` table already existed — this route is the piece that
 * was missing, which is why solved questions had never reached the database
 * for any section. It adds **no** rules of its own: every decision about how
 * two versions of an area combine comes from `mergeArea`, so the client and
 * the server cannot disagree about what a merge means.
 *
 * Four things it is responsible for:
 *
 *  - **The owner comes from the session.** There is no user id in the body.
 *    The `userId_area` unique key is scoped to that id, so a request can only
 *    ever read and write its own rows.
 *  - **The revision is server-assigned.** A client sends the revision it last
 *    saw; the server decides the next one. Clients never set `rev`, because a
 *    client that could would be able to make its own stale copy look current.
 *  - **Every blob is re-validated.** `coerceArea` runs on whatever arrives,
 *    so a malformed or hostile payload becomes a well-formed area rather than
 *    being stored and handed to another device.
 *  - **A concurrent edit merges rather than losing.** If the stored revision
 *    has moved past the client's `baseRev`, the two are merged by the area's
 *    own strategy and the result is written at a new revision — which is the
 *    reason the `rev` integer exists at all.
 */

/**
 * Bodies are capped well under Vercel's 4.5 MB request limit. An area this
 * large is a bug or an attack, and a flat refusal is a better answer than a
 * platform-level truncation the client cannot interpret.
 */
const MAX_BODY_BYTES = 2_000_000;

function problem(status, message) {
  return Response.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } });
}

const noStore = { 'Cache-Control': 'no-store', Vary: 'Cookie' };

/**
 * The revision map — what each area is at, so a client can plan without
 * downloading anything. `planSync` in core turns this into per-area actions.
 */
export async function GET() {
  const userId = await currentUserId();
  if (!userId) return problem(401, 'Sign in to sync.');

  const rows = await prisma.workspaceArea.findMany({
    where: { userId },
    select: { area: true, rev: true, updatedAt: true },
  });

  const areas = {};
  for (const area of SYNC_AREAS) areas[area] = { rev: 0, updatedAt: null };
  for (const row of rows) {
    if (!isSyncableArea(row.area)) continue;
    areas[row.area] = { rev: row.rev, updatedAt: row.updatedAt };
  }

  return Response.json({ areas }, { headers: noStore });
}

/**
 * Push one area, and get back what the server now holds.
 *
 * The answer always carries the authoritative value, even on a clean
 * fast-forward, so a client never has to assume its push was stored verbatim —
 * `coerceArea` may well have changed it.
 */
export async function POST(request) {
  const userId = await currentUserId();
  if (!userId) return problem(401, 'Sign in to sync.');

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return problem(413, 'That area is too large to sync.');
  }

  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return problem(400, 'That request body is not valid JSON.');
  }

  const area = String(body?.area ?? '');
  if (!isSyncableArea(area)) return problem(400, `"${area.slice(0, 40)}" is not a syncable area.`);

  const baseRev = Number.isInteger(body?.baseRev) ? body.baseRev : 0;

  // Validated before anything is compared, so a hostile payload cannot reach
  // the merge functions in a shape they were not written for.
  const incoming = {
    value: coerceArea(area, body?.value),
    tombstones: Array.isArray(body?.tombstones) ? body.tombstones : [],
    updatedAt: new Date().toISOString(),
  };

  const existing = await prisma.workspaceArea.findUnique({
    where: { userId_area: { userId, area } },
    select: { rev: true, data: true, tombstones: true },
  });

  // Nothing stored yet: the first push for an area is always a clean create.
  if (!existing) {
    const created = await prisma.workspaceArea.create({
      data: { userId, area, rev: 1, data: incoming.value, tombstones: incoming.tombstones },
      select: { rev: true, data: true, tombstones: true },
    });
    return Response.json(
      { area, rev: created.rev, value: created.data, tombstones: created.tombstones, merged: false },
      { headers: noStore },
    );
  }

  // In step: a straight fast-forward, no merge needed.
  if (existing.rev === baseRev) {
    const updated = await prisma.workspaceArea.update({
      where: { userId_area: { userId, area } },
      data: { rev: existing.rev + 1, data: incoming.value, tombstones: incoming.tombstones },
      select: { rev: true, data: true, tombstones: true },
    });
    return Response.json(
      { area, rev: updated.rev, value: updated.data, tombstones: updated.tombstones, merged: false },
      { headers: noStore },
    );
  }

  // The stored revision moved since this client last looked, so both sides
  // changed. The area's own strategy decides; this route does not.
  const merged = mergeArea(
    area,
    incoming,
    {
      value: coerceArea(area, existing.data),
      tombstones: Array.isArray(existing.tombstones) ? existing.tombstones : [],
      // The stored side is older in wall-clock terms for `replace` areas,
      // where the merge is last-write-wins and needs a stamp to compare.
      updatedAt: null,
    },
  );

  const saved = await prisma.workspaceArea.update({
    where: { userId_area: { userId, area } },
    data: {
      rev: existing.rev + 1,
      data: merged.value,
      tombstones: merged.tombstones ?? incoming.tombstones,
    },
    select: { rev: true, data: true, tombstones: true },
  });

  return Response.json(
    {
      area,
      rev: saved.rev,
      value: saved.data,
      tombstones: saved.tombstones,
      merged: true,
      strategy: AREA_MERGE[area]?.kind ?? 'replace',
      // What the merge could not keep, handed back rather than dropped on the
      // floor: a `replace` area has exactly one loser and the client may want
      // to offer it.
      discarded: merged.discarded ?? null,
    },
    { headers: noStore },
  );
}
