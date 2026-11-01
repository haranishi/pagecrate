import { Icon } from "@/components/icons";
import { LegalLinks } from "@/components/legal-links";
import { ShareBar } from "@/components/share-bar";

/** Footer of /app and /demo: what can be collected, the limits, sharing, and the documents. */
export function WorkspaceFooter() {
  return <footer className="site-footer shell">
    <div className="footer-top"><span className="footer-wordmark">A little less searching.<br /><em>A little more creating.</em></span><div className="supported-types"><span><Icon name="image" />画像・背景画像</span><span><Icon name="video" />通常の動画ファイル</span></div></div>
    <div className="footer-bottom"><p>素材の再利用は、配布元の利用条件をご確認ください。</p><details className="limitations"><summary>対応範囲について<Icon name="chevron" /></summary><p>画像、CSS背景、video要素などから素材を検出します。すべての取得を保証するものではありません。ログインが必要なページ、DRM、HLS・DASH配信、blob形式は対象外です。1素材25MiB、ZIP合計100MiB、1回50点まで保存できます。</p></details></div>
    <ShareBar className="footer-share" />
    <div className="footer-legal"><LegalLinks /></div>
  </footer>;
}
