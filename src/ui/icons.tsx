// Stroke icons, 1.6 px, from the design (development-plan.md §3.1). No emoji in the interface.

const PATHS = {
  chevronRight: 'M9 6l6 6-6 6',
  chevronLeft: 'M15 6l-6 6 6 6',
  chevronDown: 'M6 9l6 6 6-6',
  chevronUp: 'M6 15l6-6 6 6',
  list: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01',
  grip: 'M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  fit: 'M4 9V5h4M20 9V5h-4M4 15v4h4M20 15v4h-4',
  close: 'M6 6l12 12M18 6L6 18',
  check: 'M5 12l4.5 4.5L19 7',
  edit: 'M4 20h4l11-11a1.5 1.5 0 0 0 0-2.1l-1.9-1.9a1.5 1.5 0 0 0-2.1 0L4 16v4zM13.5 6.5l4 4',
  trash: 'M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 11v5M14 11v5',
  expand: 'M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7',
  collapse: 'M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7',
  arrowRight: 'M5 12h14M13 6l6 6-6 6',
  pin: 'M9 4h6l-.8 6 2.8 2.5V14H7v-1.5L9.8 10zM12 14v6',
  eyeOff:
    'M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.1A9.8 9.8 0 0 1 12 4.9c4.5 0 8 3.4 9.5 7.1a10.6 10.6 0 0 1-2.9 4M6.6 6.6C4.7 7.9 3.3 9.8 2.5 12c1.5 3.7 5 7.1 9.5 7.1 1.6 0 3.1-.4 4.4-1.1',
  copy: 'M9 9.5a1.5 1.5 0 0 1 1.5-1.5h8a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5h-8A1.5 1.5 0 0 1 9 17.5zM15 8V5.5A1.5 1.5 0 0 0 13.5 4h-8A1.5 1.5 0 0 0 4 5.5v8A1.5 1.5 0 0 0 5.5 15H8',
  panelLeft:
    'M5.5 4.5h13a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-11a2 2 0 0 1 2-2zM9.5 4.5v15',
  panelRight:
    'M5.5 4.5h13a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-11a2 2 0 0 1 2-2zM14.5 4.5v15',
  repo: 'M7 8.2v7.6M17 10.2c0 3.6-4 4.3-9.4 6.4M9.2 6a2.2 2.2 0 1 1-4.4 0 2.2 2.2 0 0 1 4.4 0zM9.2 18a2.2 2.2 0 1 1-4.4 0 2.2 2.2 0 0 1 4.4 0zM19.2 8a2.2 2.2 0 1 1-4.4 0 2.2 2.2 0 0 1 4.4 0z',
  contrast: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 3v18M12 3a9 9 0 0 1 0 18',
  signOut: 'M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l-4-4 4-4M6 12h10',
  key: 'M8 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM11.5 12H20M17 12v3M20 12v2.5',
  menu: 'M4 7h16M4 12h16M4 17h10',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  external: 'M14 4h6v6M20 4l-9 9M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
  refresh: 'M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4h-4',
  save: 'M5.5 4.5h10l3 3v11a1 1 0 0 1-1 1h-12a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1zM8.5 4.5v4h6v-4M8 19.5v-5.5h8v5.5',
  folder: 'M3.5 7a2 2 0 0 1 2-2h4l2 2.5h7a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z',
  face: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM9 10h.01M15 10h.01M8.5 14.5a4.5 4.5 0 0 0 7 0',
  image:
    'M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM4 16l5-5 4 4 2-2 5 5M15.5 9.5a1 1 0 1 1 0-2 1 1 0 0 1 0 2z',
  template:
    'M6.5 3.5h7l4.5 4.5v11.5a1 1 0 0 1-1 1h-10.5a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1zM13.5 3.5V8H18M9 12h6M9 16h4',
} as const

type IconName = keyof typeof PATHS

export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={PATHS[name]} />
    </svg>
  )
}
