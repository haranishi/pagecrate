import Link from "next/link";
import { CrateMark, Icon } from "@/components/icons";

/** The pages that carry the header. */
export type SitePage = "/" | "/demo" | "/app" | "/terms" | "/privacy" | "/cookies";

interface SiteHeaderProps {
  /** The page being shown: its link in the header says so (aria-current="page"). */
  readonly current: SitePage;
  /** The id of the page's main content, for the skip link. */
  readonly skipTo: string;
  readonly skipLabel?: string;
}

/**
 * The one header of every page: the same width, logo, height and rule, and the same two links on the right. Before,
 * the top page, the documents and the workspace each drew their own, and the logo moved 40px between them (UI scoring
 * round 1, finding 8).
 */
export function SiteHeader({ current, skipTo, skipLabel = "メインコンテンツへ" }: SiteHeaderProps) {
  const here = (href: SitePage) => href === current ? "page" : undefined;
  return <header className="site-header shell">
    <a className="skip-link" href={`#${skipTo}`}>{skipLabel}</a>
    <Link className="brand" href="/" prefetch={false} aria-label="PageCrate ホーム" aria-current={here("/")}><CrateMark /><span>PageCrate<span className="brand-period">.</span></span></Link>
    <nav className="site-nav" aria-label="メイン">
      <Link className="site-nav-link" href="/demo" prefetch={false} aria-current={here("/demo")}>デモ</Link>
      <Link className="site-nav-button" href="/app" prefetch={false} aria-current={here("/app")}>素材を集める<Icon name="arrow" /></Link>
    </nav>
  </header>;
}
