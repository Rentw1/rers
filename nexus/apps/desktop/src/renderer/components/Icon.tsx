const PATHS: Record<string, string> = {
  menu: 'M4 6h16M4 12h16M4 18h16',
  plus: 'M12 5v14M5 12h14',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-4.3-4.3',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  up: 'M12 19V5M5 12l7-7 7 7',
  stop: 'M7 7h10v10H7z',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  refresh: 'M21 12a9 9 0 1 1-2.6-6.4L21 8M21 3v5h-5',
  download: 'M12 3v12M7 10l5 5 5-5M5 21h14',
  trash: 'M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6',
  left: 'M15 18l-6-6 6-6',
  right: 'M9 18l6-6-6-6',
  down: 'M6 9l6 6 6-6',
  check: 'M20 6L9 17l-5-5',
  x: 'M18 6L6 18M6 6l12 12',
  clip: 'M21.4 11.1l-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5',
  pin: 'M12 17v5M8 3h8l-1 7 3 3H6l3-3z',
  phone: 'M7 2h10v20H7zM11 18h2',
  server: 'M3 4h18v6H3zM3 14h18v6H3zM7 7h.01M7 17h.01',
  chart: 'M4 20V10M10 20V4M16 20v-8M22 20H2',
  key: 'M15 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0zM11 11v10M11 16h4M11 20h3',
  wrench: 'M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z',
  monitor: 'M3 4h18v12H3zM8 20h8M12 16v4',
  edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  bulb: 'M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z',
  info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01',
  alert: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 8v4M12 16h.01',
  wallet: 'M3 7h18v13H3zM3 7l3-4h12l3 4M16 14h.01',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  sidebar: 'M3 4h18v16H3zM9 4v16',
  folder: 'M3 6h6l2 2h10v12H3z',
  external: 'M14 3h7v7M10 14L21 3M19 14v7H3V5h7',
  more: 'M12 6h.01M12 12h.01M12 18h.01',
};

export function Icon({ name, size = 18, className }: { name: keyof typeof PATHS | string; size?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={PATHS[name] ?? PATHS.info} />
    </svg>
  );
}
