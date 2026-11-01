import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { OG_IMAGE, SHARE_CARD_TITLE, SITE_DESCRIPTION, siteMetadata } from "../src/lib/site-metadata";

const root = new URL("..", import.meta.url);

test("site metadata: with a public origin, OGP, the X card and canonical point at absolute URLs of that origin", () => {
  const metadata = siteMetadata("https://pagecrate.example");
  assert.equal(String(metadata.metadataBase), "https://pagecrate.example/");
  assert.deepEqual(metadata.alternates, { canonical: "./" }, "each page's own path");
  assert.deepEqual(metadata.openGraph, {
    title: SHARE_CARD_TITLE, description: SITE_DESCRIPTION, siteName: "PageCrate", locale: "ja_JP", type: "website",
    url: "./", images: [{ url: "/og.png", width: 1200, height: 630, type: "image/png", alt: OG_IMAGE.alt }],
  });
  assert.deepEqual(metadata.twitter, { card: "summary_large_image", title: SHARE_CARD_TITLE, description: SITE_DESCRIPTION, images: [{ url: "/og.png", alt: OG_IMAGE.alt }] });
  assert.deepEqual(metadata.robots, { index: false, follow: false }, "indexing stays off until the operator decides");
});

test("site metadata: without a usable origin, no URL field is set (Next.js would make it point at localhost)", () => {
  const metadata = siteMetadata(null);
  assert.equal(metadata.metadataBase, undefined);
  assert.equal(metadata.alternates, undefined);
  assert.deepEqual(metadata.openGraph, { title: SHARE_CARD_TITLE, description: SITE_DESCRIPTION, siteName: "PageCrate", locale: "ja_JP", type: "website" });
  assert.deepEqual(metadata.twitter, { card: "summary", title: SHARE_CARD_TITLE, description: SITE_DESCRIPTION });
  assert.deepEqual(metadata.robots, { index: false, follow: false });
});

test("site metadata: the words carry no old pilot wording, and the image file is the stated 1200×630 PNG", () => {
  const words = JSON.stringify(siteMetadata("https://pagecrate.example"));
  for (const old of ["個人用", "限定テスト", "ログインして", "草案"]) assert.equal(words.includes(old), false, old);
  const file = new URL("public/og.png", root);
  assert.ok(existsSync(file), "public/og.png");
  const png = readFileSync(file);
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], "a PNG");
  assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [OG_IMAGE.width, OG_IMAGE.height]);
});
