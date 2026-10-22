import { extractSlug, problemUrl, titleGuessFromSlug } from './identity.js';

export const DIFFICULTIES = ['Easy', 'Medium', 'Hard'];

// Where a question's metadata came from, so unverified data can look unverified.
export const METADATA_SOURCES = ['verified', 'imported', 'manual'];

export function createQuestion(input = {}) {
  const found = extractSlug(input.slug ?? input.url ?? '');
  if (!found.ok) return null;
  const title = String(input.title ?? '').trim();
  return {
    slug: found.slug,
    title: title || titleGuessFromSlug(found.slug),
    titleIsGuess: !title,
    difficulty: DIFFICULTIES.includes(input.difficulty) ? input.difficulty : null,
    topics: normalizeTopics(input.topics),
    leetcodeId: Number.isInteger(input.leetcodeId) ? input.leetcodeId : null,
    metadataSource: METADATA_SOURCES.includes(input.metadataSource) ? input.metadataSource : 'manual',
    verifiedAt: typeof input.verifiedAt === 'string' ? input.verifiedAt : null,
    addedAt: new Date().toISOString(),
  };
}

export function normalizeTopics(topics) {
  if (!Array.isArray(topics)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of topics) {
    const topic = String(raw ?? '').trim().replace(/\s+/g, ' ');
    if (!topic) continue;
    const key = topic.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(topic);
  }
  return out;
}

export function topicKey(topic) {
  return String(topic ?? '').trim().toLowerCase();
}

/** Difficulty and topics present, from a source we did not make up. */
export function hasCompleteMetadata(question) {
  return Boolean(question.difficulty) && question.topics.length > 0;
}

export function questionUrl(question) {
  return problemUrl(question.slug);
}

export function matchesQuestionQuery(question, query) {
  const q = String(query ?? '').trim().toLowerCase();
  if (!q) return true;
  return (
    question.title.toLowerCase().includes(q) ||
    question.slug.includes(q.replace(/\s+/g, '-')) ||
    question.topics.some((topic) => topic.toLowerCase().includes(q)) ||
    String(question.leetcodeId ?? '').includes(q)
  );
}
