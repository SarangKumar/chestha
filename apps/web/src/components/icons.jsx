const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

export function Icon({ name, className = 'size-5' }) {
  const paths = {
    dashboard: <><rect x="3" y="3" width="7.5" height="7.5" rx="1.5" /><rect x="13.5" y="3" width="7.5" height="4.5" rx="1.5" /><rect x="13.5" y="10.5" width="7.5" height="10.5" rx="1.5" /><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" /></>,
    tasks: <><path d="M4 7.5 6 9.5 9.5 6" /><path d="M4 17.5 6 19.5 9.5 16" /><path d="M13 8h7M13 18h7" /></>,
    calendar: <><rect x="3.5" y="5" width="17" height="15.5" rx="2" /><path d="M3.5 10h17M8 3.5v3M16 3.5v3" /></>,
    sounds: <><path d="M4 9v6h3l5 4V5L7 9H4Z" /><path d="M16 9.5a3.5 3.5 0 0 1 0 5M18.5 7a7 7 0 0 1 0 10" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M12 3v2.5M12 18.5V21M4.2 7.5l2.2 1.3M17.6 15.2l2.2 1.3M4.2 16.5l2.2-1.3M17.6 8.8l2.2-1.3" /></>,
    dsa: <><path d="M9 7.5 5.5 11 9 14.5" /><path d="m15 7.5 3.5 3.5L15 14.5" /><path d="M12.8 5.5 11.2 18" /></>,
    target: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3.5" /></>,
    repeat: <><path d="M4.5 9.5A4 4 0 0 1 8.5 6H18" /><path d="m15.5 3.5 3 2.5-3 2.5" /><path d="M19.5 14.5A4 4 0 0 1 15.5 18H6" /><path d="m8.5 20.5-3-2.5 3-2.5" /></>,
    search: <><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></>,
    plus: <path d="M12 5v14M5 12h14" />,
    sidebar: <><rect x="3.5" y="4.5" width="17" height="15" rx="2" /><path d="M14.5 4.5v15" /></>,
    clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
    note: <><path d="M5.5 4.5h13v15h-13z" /><path d="M8.5 9h7M8.5 12.5h7M8.5 16h4" /></>,
    alert: <><path d="M12 4.5 20.5 19.5h-17L12 4.5Z" /><path d="M12 10v4M12 16.8v.2" /></>,
    chevronLeft: <path d="m14 7-5 5 5 5" />,
    chevronRight: <path d="m10 7 5 5-5 5" />,
    download: <><path d="M12 4v11M8 11.5l4 4 4-4" /><path d="M4.5 19.5h15" /></>,
    upload: <><path d="M12 15.5V4.5M8 8.5l4-4 4 4" /><path d="M4.5 19.5h15" /></>,
    check: <path d="m5 12.5 4.5 4.5L19 7" />,
  };
  return <svg {...base} className={className} aria-hidden="true">{paths[name] ?? null}</svg>;
}
