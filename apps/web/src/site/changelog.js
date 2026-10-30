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
      'Product rename to Chestha, a marketing website shell, a centred New Tab layout, richer curated DSA sheets (including Grind 75/169 and NeetCode 75), and a landing preview that shows the left page rail.',
    sections: [
      {
        kind: 'Changed',
        items: [
          'Renamed the product from Kalpvan to Chestha across the app, extension, and docs.',
          'Website marketing shell: landing hero, sticky navbar, and footer inspired by a calm product homepage.',
          'Marketing content width uses max-w-6xl; the extension dashboard stays full-bleed beside the nav rail.',
          'Default New Tab layout: clock and search sit as a centred stack; each is one column wider (clock 9, search 11) so the pair reads as the middle of the board.',
          'Landing workspace preview keeps the left page rail in the embed so the shot looks like a real workspace.',
          'Guide and LLM-facing docs list the curated DSA sheets the pack actually ships.',
          'Removed LinkedIn from marketing footer and About maker links; dropped unused SiteFooter component.',
        ],
      },
      {
        kind: 'Added',
        items: [
          'About page with privacy notes and maker links (GitHub, portfolio).',
          'Changelog page on the website, with a calmer version picker.',
          'Guide page plus SEO bits: robots, sitemap, llms, Open Graph / meta.',
          'Buy me a coffee control in the hero and chrome, with the mug mark.',
          'Chrome Web Store and GitHub (with stars) in the marketing navbar.',
          'Curated DSA pack now includes Grind 75, Grind 169, and NeetCode 75 alongside Blind 75, NeetCode 150/250, LeetCode 75, and Top Interview 150 (facts only — no problem statements).',
          'Workspace preview loading layer so the iframe does not flash empty.',
        ],
      },
      {
        kind: 'Fixed',
        items: [
          'Default dashboard sketch re-anchors to the live column count so corner widgets reach the edges on a wide New Tab instead of sitting in a narrow band.',
          'Site footer no longer appears under the website workspace shell.',
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
