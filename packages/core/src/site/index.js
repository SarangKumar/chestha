/**
 * Material the public website renders about the product itself.
 *
 * It lives in `core` rather than in either app because both render it: the
 * extension's About page and command palette, and the website's landing,
 * Changelog and Guide. Nothing here is workspace data — it is prose and links
 * that must not say two different things in two places.
 */
export * from './links.js';
export * from './changelog.js';
export * from './guide.js';
export * from './widgets.js';
