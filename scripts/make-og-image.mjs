// Makes public/og.png (1200×630), the image of shared links, from the app's own mark (CrateMark) and hero art
// (HeroArt) with the app's stylesheet. Every text node is removed before the shot, so the image carries no lettering
// and no font licence has to be checked. Re-run after changing the mark or the art:
//   node --import tsx scripts/make-og-image.mjs
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium } from "playwright";
import { HeroArt } from "../src/components/hero-art.tsx";
import { CrateMark } from "../src/components/icons.tsx";

const WIDTH = 1200;
const HEIGHT = 630;
const root = new URL("..", import.meta.url);
const output = fileURLToPath(new URL("public/og.png", root));
const css = await readFile(new URL("src/app/globals.css", root), "utf8");
const mark = renderToStaticMarkup(createElement(CrateMark, { className: "og-mark" }));
const art = renderToStaticMarkup(createElement(HeroArt));

const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><style>${css}
html, body { width: ${WIDTH}px; height: ${HEIGHT}px; margin: 0; overflow: hidden; background: var(--paper); }
.og { position: relative; width: ${WIDTH}px; height: ${HEIGHT}px; }
.og::before { content: ""; position: absolute; inset: 34px; border: 1px solid var(--line); border-radius: 28px; }
.og-badge { position: absolute; top: 165px; left: 150px; display: flex; align-items: center; justify-content: center; width: 300px; height: 300px; border-radius: 50%; background: var(--teal-pale); }
.og-mark { width: 178px; height: 194px; color: var(--teal); }
.og-art .hero-art { position: absolute; top: 140px; left: 560px; margin: 0; transform: scale(1.3); transform-origin: top left; }
.og-art .art-annotation { display: none; }
</style></head><body><div class="og"><div class="og-badge">${mark}</div><div class="og-art">${art}</div></div></body></html>`;

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: "load" });
  const lettering = await page.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) node.textContent = "";
    return document.body.innerText.trim().length;
  });
  if (lettering !== 0) throw new Error("text is left in the image");
  await page.screenshot({ path: output, clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT } });
  console.log(`wrote ${WIDTH}×${HEIGHT} public/og.png`);
} finally {
  await browser.close();
}
