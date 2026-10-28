/**
 * Plain-language map of site pages and app sections for the Guide page.
 * Widget copy is read live from WIDGETS in the registry so names cannot drift.
 */

export const GUIDE_PAGES = [
  {
    id: 'home',
    title: 'Landing',
    route: '#/home',
    where: 'Website',
    blurb:
      'Marketing homepage: what Chestha is, Add to Chrome, Buy me a coffee, and a live workspace preview. Not shown in the extension New Tab.',
  },
  {
    id: 'dashboard',
    title: 'Workspace / Dashboard',
    route: '#/dashboard',
    where: 'Website & extension',
    blurb:
      'The board you arrange yourself. Widgets sit on a grid; Reset restores the shipped corner sketch. This is what the Chrome New Tab opens to.',
  },
  {
    id: 'tasks',
    title: 'Tasks',
    route: '#/tasks',
    where: 'Website & extension',
    blurb:
      'Open work by view: today, upcoming, overdue, no due date, completed, or all. Capture with N or the palette. Recurring tasks stay one record.',
  },
  {
    id: 'calendar',
    title: 'Calendar',
    route: '#/calendar',
    where: 'Website & extension',
    blurb:
      'A month grid of the same tasks — due dates are date-only strings, not timestamps. Creating on a day opens the task editor with that due date.',
  },
  {
    id: 'dsa',
    title: 'DSA',
    route: '#/dsa',
    where: 'Website & extension',
    blurb:
      'Practice tracker: curated packs, personal lists, revision ladder, and daily new/revise targets. The curated-core pack draws from Blind 75, Grind 75, Grind 169, NeetCode 150, NeetCode 250, LeetCode 75, and LeetCode Top Interview 150. Question metadata only — statements stay on LeetCode.',
  },
  {
    id: 'grove',
    title: 'Grove',
    route: '#/grove',
    where: 'Website & extension',
    blurb:
      'Focus sessions that grow a garden and earn XP. Time on sites you marked productive can contribute when the extension is installed.',
  },
  {
    id: 'websites',
    title: 'Productive time',
    route: '#/websites',
    where: 'Website & extension',
    blurb:
      'Domain-only time on rules you configure. Needs the Chrome extension to accumulate. Never stores page titles or full URLs.',
  },
  {
    id: 'sounds',
    title: 'Sounds',
    route: '#/sounds',
    where: 'Website & extension',
    blurb:
      'Synthesised ambient mixes in the browser (Web Audio). Save presets and start them from here or from the Ambient mixes widget.',
  },
  {
    id: 'settings',
    title: 'Settings',
    route: '#/settings',
    where: 'Website & extension',
    blurb:
      'Theme, background, glass, shortcuts, hidden sections, export/import, and storage status. Export is the durable copy of your data.',
  },
  {
    id: 'about',
    title: 'About',
    route: '#/about',
    where: 'Website only',
    blurb:
      'Privacy, where data lives, credits, and maker links. The extension New Tab does not host About — #/about remaps to the dashboard there.',
  },
  {
    id: 'changelog',
    title: 'Changelog',
    route: '#/changelog',
    where: 'Website (palette in extension)',
    blurb:
      'Keep a Changelog notes with a version combobox and an on-this-page outline. Linked from the marketing header and footer.',
  },
  {
    id: 'guide',
    title: 'Guide',
    route: '#/guide',
    where: 'Website only',
    blurb:
      'This page — a map of every section and every dashboard widget. Meant for humans and for tools that read the public site.',
  },
];

export const GUIDE_NOTES = [
  'The top-left Chestha mark in the app rail opens https://chestha.vercel.app/.',
  'Website and extension keep separate IndexedDB stores (different origins); use Export / Import to move data.',
  'Weather and GitHub widgets are the only surfaces that contact the network, and only after you configure them.',
];
