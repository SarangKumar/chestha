const isApple = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform ?? '');
export const MOD = isApple ? '⌘' : 'Ctrl';

export const SHORTCUTS = [
  { keys: `${MOD}K`, description: 'Open the command palette' },
  { keys: 'N', description: 'Quick capture a task' },
  { keys: 'G then D', description: 'Go to the dashboard' },
  { keys: 'G then T', description: 'Go to tasks' },
  { keys: 'G then C', description: 'Go to the calendar' },
  { keys: 'G then S', description: 'Go to settings' },
  { keys: '[', description: 'Show or hide the today panel' },
  { keys: 'Esc', description: 'Close whatever is open' },
  { keys: 'Alt + arrows', description: 'Move a widget while editing the dashboard' },
  { keys: 'Arrows', description: 'Move by day in the calendar' },
];
