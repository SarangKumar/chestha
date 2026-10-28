/**
 * Keep-a-Changelog style entries for the website Changelog page.
 * Dates are release days only where known; undated notes use the version span.
 * `summary` feeds the intro under the version heading; section `kind`s drive
 * the "On this page" TOC.
 */
export const CHANGELOG = [
  {
    version: '0.1.1',
    date: '2026-10-28',
    title: 'Chestha',
    summary:
      'Product rename to Chestha, a marketing website shell, and a New Tab default layout that re-anchors to the live grid so corner widgets reach the edges.',
    sections: [
      {
        kind: 'Changed',
        items: [
          'Renamed the product from Kalpvan to Chestha across the app, extension, and docs.',
          'Website marketing shell: landing hero, sticky navbar, and footer inspired by a calm product homepage.',
          'Marketing content width uses max-w-6xl; the extension dashboard stays full-bleed beside the nav rail.',
        ],
      },
      {
        kind: 'Added',
        items: [
          'About page with privacy notes and maker links (GitHub, portfolio, LinkedIn).',
          'Changelog page on the website.',
          'Buy me a coffee control with the mug mark.',
          'Chrome Web Store link on Add to Chrome.',
        ],
      },
      {
        kind: 'Fixed',
        items: [
          'Default dashboard sketch re-anchors to the live column count so corner widgets reach the edges on a wide New Tab instead of sitting in a narrow band.',
          'Button hover styles keep readable contrast (label never matches the fill).',
        ],
      },
    ],
  },
  {
    version: '0.1.0',
    date: '2026-10',
    title: 'First store cut',
    summary:
      'First Chrome Web Store cut: a local-first workspace with tasks, calendar, Grove, DSA practice, ambient sound, and a New Tab extension.',
    sections: [
      {
        kind: 'Added',
        items: [
          'Local-first workspace: tasks, calendar, dashboard widgets, Grove focus garden, DSA practice, ambient sounds, productive-time tracker.',
          'Chrome New Tab extension and standalone web app (separate origins; export/import to move data).',
          'No account — data stays in this browser on this device.',
        ],
      },
    ],
  },
];
