import Link from "next/link";

/** Links to the three documents, shown in the workspace footer. */
export function LegalLinks({ newTab = false, ariaLabel = "利用条件とデータの取り扱い" }: { newTab?: boolean; ariaLabel?: string }) {
  const target = newTab ? "_blank" : undefined;
  const rel = newTab ? "noopener noreferrer" : undefined;
  return <nav className="legal-links" aria-label={ariaLabel}>
    <Link href="/terms" target={target} rel={rel}>利用規約</Link>
    <Link href="/privacy" target={target} rel={rel}>プライバシーポリシー</Link>
    <Link href="/cookies" target={target} rel={rel}>Cookieについて</Link>
  </nav>;
}
