import { AREAS, STATE_VERSION, coerceArea } from './schema.js';

export const EXPORT_FORMAT = 'vistaar.workspace';
export const EXPORT_VERSION = STATE_VERSION;

export function buildExport(state) {
  const payload = {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    data: {},
  };
  for (const area of AREAS) payload.data[area] = state[area];
  return payload;
}

export function exportFilename(now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `vistaar-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`;
}

/**
 * Import validates everything before any data is touched, and refuses with a
 * specific reason. A vague "invalid file" is not an acceptable answer here.
 * @returns {{ ok: true, data: object, summary: object, notes: string[] } | { ok: false, error: string }}
 */
export function parseImport(text) {
  if (typeof text !== 'string' || text.trim() === '') {
    return { ok: false, error: 'That file is empty.' };
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return {
      ok: false,
      error: `That file is not valid JSON, so it may be truncated or not a Vistaar export (${error.message}).`,
    };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, error: 'That file does not contain a Vistaar export object.' };
  }
  if (parsed.format !== EXPORT_FORMAT) {
    return {
      ok: false,
      error: parsed.format
        ? `That file reports its format as "${String(parsed.format).slice(0, 40)}", not a Vistaar export.`
        : 'That file is missing its format marker, so it was not produced by Vistaar.',
    };
  }
  if (!Number.isInteger(parsed.version)) {
    return { ok: false, error: 'That export is missing a version number, so it cannot be read safely.' };
  }
  // A version 1 file predates the DSA areas; coerceArea fills them with
  // defaults, so older backups still restore cleanly.
  if (parsed.version > EXPORT_VERSION) {
    return {
      ok: false,
      error: `That export was written by a newer version of Vistaar (format ${parsed.version}; this version reads up to ${EXPORT_VERSION}).`,
    };
  }
  if (!parsed.data || typeof parsed.data !== 'object') {
    return { ok: false, error: 'That export has no data section.' };
  }

  const data = {};
  const notes = [];
  for (const area of AREAS) {
    const { value, issues } = coerceArea(area, parsed.data[area]);
    data[area] = value;
    notes.push(...issues);
  }

  return {
    ok: true,
    data,
    notes,
    summary: {
      exportedAt: typeof parsed.exportedAt === 'string' ? parsed.exportedAt : null,
      version: parsed.version,
      tasks: data.tasks.length,
      openTasks: data.tasks.filter((t) => !t.completedAt).length,
      presets: data.sound.presets.length,
      widgets: data.dashboard.widgets.length,
      notesCharacters: data.notes.text.length,
      dsaQuestions: data['dsa.library'].questions.length,
      dsaEvents: data['dsa.progress'].events.length,
      dsaLists: data['dsa.lists'].lists.length,
    },
  };
}
