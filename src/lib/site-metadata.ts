/**
 * The site-wide metadata of the root layout, including OGP, the X card and canonical (design-ux.md, "変わった実装"
 * 6). The public origin is a runtime value of the Worker: with it, the image, og:url and canonical become absolute
 * URLs; without it (unset, invalid, or no Cloudflare context) they are left out, since Next.js would otherwise make
 * them absolute against localhost. `"./"` resolves against each page's own path, so every page gets its own
 * canonical and og:url. Indexing stays off (`noindex`): whether to open the site to search is the operator's call.
 */
import type { Metadata } from "next";

export const SITE_NAME = "PageCrate";
export const SITE_TITLE = "PageCrate — ページの素材を、ひとつに。";
export const SITE_DESCRIPTION = "公開ページの画像と動画を一覧にして、必要な素材を出典と一緒にZIPで保存するツール。ログインも登録も要りません。";
/** The card shared on X, LINE and elsewhere: the top page, which the share buttons point to. */
export const SHARE_CARD_TITLE = "PageCrate — ページの画像と動画を、ひとつの ZIP に。";
/** public/og.png, made by scripts/make-og-image.mjs. It carries no lettering. */
export const OG_IMAGE = Object.freeze({
  url: "/og.png",
  width: 1200,
  height: 630,
  type: "image/png",
  alt: "PageCrate のマークと、画像と動画の札を並べた図",
});

export function siteMetadata(publicOrigin: string | null): Metadata {
  const openGraph = { title: SHARE_CARD_TITLE, description: SITE_DESCRIPTION, siteName: SITE_NAME, locale: "ja_JP", type: "website" } as const;
  const base: Metadata = {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    robots: { index: false, follow: false },
    referrer: "no-referrer",
    openGraph,
    twitter: { card: "summary", title: SHARE_CARD_TITLE, description: SITE_DESCRIPTION },
  };
  if (publicOrigin === null) return base;
  return {
    ...base,
    metadataBase: new URL(publicOrigin),
    alternates: { canonical: "./" },
    openGraph: { ...openGraph, url: "./", images: [{ ...OG_IMAGE }] },
    twitter: { card: "summary_large_image", title: SHARE_CARD_TITLE, description: SITE_DESCRIPTION, images: [{ url: OG_IMAGE.url, alt: OG_IMAGE.alt }] },
  };
}
