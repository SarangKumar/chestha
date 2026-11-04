/**
 * The dashboard widget catalogue — type, name and one-line description.
 *
 * The website's Guide page lists every widget, but the registry that defines
 * them (`apps/extension/src/widgets/registry.jsx`) is JSX bound to the
 * workspace and cannot be imported into a server-rendered Next page. So the
 * prose lives here, and `apps/extension/test/widgetCatalogue.test.js` asserts
 * it still matches the registry exactly.
 *
 * That test is the point. The Guide used to read `WIDGETS` live so names could
 * not drift; a plain copy would have given that up silently. A failing test is
 * the replacement for an import that is no longer possible.
 */
export const WIDGET_CATALOGUE = [
  { type: 'profile', name: 'Your card', description: 'Your profile: handle, what you write about, posts, followers and your reading streak. Needs an account.' },
  { type: 'today', name: "Today's tasks", description: 'Due today, plus everything overdue.' },
  { type: 'upcoming', name: 'Upcoming', description: 'What is due within a horizon you choose.' },
  { type: 'overdue', name: 'Overdue', description: 'A count, and the oldest few.' },
  { type: 'clock', name: 'Clock and date', description: 'Local time and today’s date.' },
  { type: 'weather', name: 'Weather', description: 'Current weather for a place you choose. Contacts the internet once you set one.' },
  { type: 'notes', name: 'Scratchpad', description: 'One plain note, saved as you type.' },
  { type: 'search', name: 'Web search', description: 'A search box that opens results in the current tab.' },
  { type: 'daily', name: 'Question of the day', description: 'LeetCode’s Problem of the Day (title and link). Falls back to your library if the feed is offline.' },
  { type: 'shortcuts', name: 'Shortcuts', description: 'Your own links, as a grid of tiles.' },
  { type: 'dsaToday', name: 'DSA today', description: 'Both daily targets as two compact figures. Reads well at any size.' },
  { type: 'inspiration', name: 'Daily intention', description: 'A line of your own, optionally rotating each day.' },
  { type: 'github', name: 'GitHub', description: 'Public activity for a GitHub user: summary, a year contribution calendar, or repositories. Contacts the internet once you set a username.' },
  { type: 'sounds', name: 'Ambient mixes', description: 'Start a saved sound mix without leaving the dashboard.' },
  { type: 'grove', name: 'Focus Garden', description: 'Focus Garden on the dashboard — plant, timer, and a way to start a session.' },
  { type: 'xpSummary', name: 'XP today', description: 'What you have earned today, and from which of the three sources.' },
  { type: 'undated', name: 'No due date', description: 'Open tasks that are not on the calendar.' },
  { type: 'websiteTime', name: 'Website time', description: 'Time spent on the sites you chose to track, with sparklines. Needs the Chrome extension.' },
];
