import type { SVGProps } from "react";

const paths = {
  video: "M4 4h16a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1 M9 8l7 4-7 4V8",
  logout: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9",
  eye: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12 M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
  eyeOff: "M3 3l18 18 M10.6 5.1A12 12 0 0 1 12 5c6.5 0 10 7 10 7a18 18 0 0 1-3.2 4.2 M6.2 6.2A20 20 0 0 0 2 12s3.5 7 10 7a13 13 0 0 0 5.8-1.4 M9.9 9.9a3 3 0 0 0 4.2 4.2",
  voice: "M9 5a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0V5 M5 10v2a7 7 0 0 0 14 0v-2 M12 19v3 M8 22h8",
  overview: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  characters:
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M17 4a4 4 0 0 1 0 8 M22 21v-2a4 4 0 0 0-3-3.87",
  content:
    "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M8 13h8 M8 17h5",
  media:
    "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2 M3 16l5-5 5 5 3-3 5 5 M15 7h.01",
  analytics: "M4 20h16 M7 16v-5 M12 16V4 M17 16V8",
  settings: "M4 7h16 M4 17h16 M8 4v6 M16 14v6",
  cog: "M10 2h4l.5 3 2 1.2 2.8-1 2 3.5-2.3 2v2.6l2.3 2-2 3.5-2.8-1-2 1.2L14 22h-4l-.5-3-2-1.2-2.8 1-2-3.5 2.3-2v-2.6l-2.3-2 2-3.5 2.8 1 2-1.2L10 2 M15.5 12a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0",
  plus: "M12 5v14 M5 12h14",
  arrow: "M5 12h14 M13 6l6 6-6 6",
  chevron: "M9 5l7 7-7 7",
  menu: "M4 6h16 M4 12h16 M4 18h16",
  close: "M6 6l12 12 M6 18 18 6",
  identity: "M20 21v-2a7 7 0 0 0-14 0v2 M13 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8",
  appearance:
    "M12 3a9 9 0 1 0 9 9c0-1.2-.8-2-2-2h-2a2 2 0 0 1-2-2V6c0-1.6-1.4-3-3-3 M7 10h.01 M9 6h.01 M7 15h.01 M12 18h.01",
  personality:
    "M8 3a3 3 0 0 0-3 3v1a3 3 0 0 0-2 5 3 3 0 0 0 2 5v1a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3 M16 3a3 3 0 0 1 3 3v1a3 3 0 0 1 2 5 3 3 0 0 1-2 5v1a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3 M5 7h3 M16 7h3 M5 17h3 M16 17h3",
  memory: "M3 12a9 9 0 1 0 3-6.7 M3 3v6h6 M12 7v5l3 2",
  history:
    "M8 2v4 M16 2v4 M3 10h18 M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2 M8 14h2 M14 14h2 M8 18h2",
  layers: "M12 3l10 6-10 6L2 9z M2 14l10 6 10-6",
  lock: "M7 10V7a5 5 0 0 1 10 0v3 M6 10h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2 M12 14v4",
} as const;

export type IconName = keyof typeof paths;

export function Icon({
  name,
  size = 20,
  ...props
}: SVGProps<SVGSVGElement> & { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d={paths[name]} />
    </svg>
  );
}
