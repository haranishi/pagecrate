import type { SVGProps } from "react";

export type IconName =
  | "arrow"
  | "check"
  | "chevron"
  | "close"
  | "download"
  | "external"
  | "image"
  | "info"
  | "link"
  | "lock"
  | "refresh"
  | "search"
  | "sliders"
  | "video"
  | "warning";

export function Icon({ name, ...props }: SVGProps<SVGSVGElement> & { name: IconName }) {
  const paths: Record<IconName, React.ReactNode> = {
    arrow: <><path d="M4 12h15M13 6l6 6-6 6" /></>,
    check: <path d="m5 12 4.5 4.5L19 7" />,
    chevron: <path d="m8 5 7 7-7 7" />,
    close: <><path d="m6 6 12 12M18 6 6 18" /></>,
    download: <><path d="M12 3v12m-5-5 5 5 5-5M5 16v4h14v-4" /></>,
    external: <><path d="M14 4h6v6m0-6L10 14M10 5H5v14h14v-5" /></>,
    image: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8" cy="9" r="1.5" /><path d="m4 17 5-5 4 4 3-3 5 5" /></>,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7v.01" /></>,
    link: <><path d="m9 15 6-6M9 6l1-1a5 5 0 0 1 7 7l-1 1M8 11l-1 1a5 5 0 0 0 7 7l1-1" /></>,
    lock: <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" /></>,
    refresh: <><path d="M20 4v6h-6M4 20v-6h6" /><path d="M5 9a7 7 0 0 1 12-4l3 5M4 14l3 5a7 7 0 0 0 12-4" /></>,
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></>,
    sliders: <><path d="M4 7h7m6 0h3M4 17h3m6 0h7" /><circle cx="14" cy="7" r="3" /><circle cx="10" cy="17" r="3" /></>,
    video: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m10 9 5 3-5 3Z" /></>,
    warning: <><path d="M10.3 4.3 2.9 17a2 2 0 0 0 1.7 3h14.8a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4m0 3v.01" /></>,
  };

  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name]}</svg>;
}

export function CrateMark({ className }: { className?: string }) {
  return <svg className={className} width="33" height="36" viewBox="0 0 33 36" fill="none" aria-hidden="true">
    <path d="m16.5 1 15 8.5v17l-15 8.5-15-8.5v-17L16.5 1Z" fill="currentColor" />
    <path d="m8 11 8.5 4.8L25 11M16.5 15.8v10.7M8 16.5l4.8 2.7M25 16.5l-4.8 2.7" stroke="#F7F7EE" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}
