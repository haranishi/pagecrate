import { test } from "node:test";
import assert from "node:assert/strict";
import {
  allVisibleSelected, countByKind, filterAssets, hasFilters, isSelectable, MAX_SELECTED, NO_FILTERS, selectedTickets,
  toggleSelection, toggleVisibleSelection,
} from "../src/lib/asset-selection";
import { MAX_DOWNLOAD_TICKETS } from "../src/lib/guard";
import type { AssetItem } from "../src/lib/types";

const image = (id: string, width?: number, extra: Partial<AssetItem> = {}): AssetItem => ({
  id, kind: "image", name: `${id}.png`, url: `https://example.com/img/${id}.png`, ticket: `ticket-${id}`, ...(width === undefined ? {} : { width }), ...extra,
});
const assets: AssetItem[] = [
  image("poster", 1920),
  image("thumb", 320),
  image("nosize"),
  { id: "clip", kind: "video", name: "clip.mp4", url: "https://example.com/v/clip.mp4", ticket: "ticket-clip", width: 1280 },
  { id: "live", kind: "unsupported", name: "live.m3u8", url: "https://example.com/live.m3u8", reason: "HLS" },
  image("blocked", 800, { ticket: undefined, reason: "このサイトは、運営者の設定により取得できません。" }),
];

test("selection: only a candidate with a ticket can be selected, up to the 50 one ZIP may carry", () => {
  assert.equal(MAX_SELECTED, MAX_DOWNLOAD_TICKETS);
  assert.deepEqual(assets.map(isSelectable), [true, true, true, true, false, false]);
  assert.equal(isSelectable({ ticket: "" }), false);
  const none: ReadonlySet<string> = new Set();
  assert.equal(toggleSelection(none, assets[4]), none, "a stream without a ticket is not selected");
  assert.equal(toggleSelection(none, assets[5]), none, "nor is a candidate the server refused");
  const one = toggleSelection(none, assets[0]);
  assert.deepEqual([...one], ["poster"]);
  assert.deepEqual([...toggleSelection(one, assets[0])], [], "a second toggle removes it");
  const full = new Set(Array.from({ length: MAX_SELECTED }, (_, index) => `x${index}`));
  assert.equal(toggleSelection(full, assets[1]), full, "the 51st is not added");
  assert.equal(toggleSelection(full, { ...assets[1], id: "x7" }).size, MAX_SELECTED - 1, "removing still works at the cap");
});

test("filters: kind, name or address, and minimum width; '未対応' lists everything that cannot be saved", () => {
  assert.equal(hasFilters(NO_FILTERS), false);
  assert.deepEqual(filterAssets(assets, NO_FILTERS).map(asset => asset.id), assets.map(asset => asset.id));
  assert.deepEqual(filterAssets(assets, { ...NO_FILTERS, kind: "image" }).map(asset => asset.id), ["poster", "thumb", "nosize", "blocked"]);
  assert.deepEqual(filterAssets(assets, { ...NO_FILTERS, kind: "video" }).map(asset => asset.id), ["clip"]);
  assert.deepEqual(filterAssets(assets, { ...NO_FILTERS, kind: "unsupported" }).map(asset => asset.id), ["live", "blocked"]);
  assert.deepEqual(filterAssets(assets, { ...NO_FILTERS, query: "  POSTER " }).map(asset => asset.id), ["poster"]);
  assert.deepEqual(filterAssets(assets, { ...NO_FILTERS, query: "/v/" }).map(asset => asset.id), ["clip"], "the source address is searched too");
  assert.deepEqual(filterAssets(assets, { ...NO_FILTERS, minWidth: 1000 }).map(asset => asset.id), ["poster", "clip"], "no known width means left out");
  assert.deepEqual(filterAssets(assets, { kind: "image", query: "b", minWidth: 300 }).map(asset => asset.id), ["thumb", "blocked"]);
  assert.equal(hasFilters({ ...NO_FILTERS, minWidth: 300 }), true);
  assert.deepEqual(countByKind(assets), { all: 6, image: 4, video: 1, unsupported: 2 });
});

test("select visible: the selectable ones in view, in order and up to the cap; clears them when all are selected", () => {
  const visible = filterAssets(assets, { ...NO_FILTERS, kind: "image" });
  const kept: ReadonlySet<string> = new Set(["clip"]);
  const selected = toggleVisibleSelection(kept, visible);
  assert.deepEqual([...selected], ["clip", "poster", "thumb", "nosize"], "the refused candidate is skipped; the hidden selection stays");
  assert.equal(allVisibleSelected(selected, visible), true);
  assert.deepEqual([...toggleVisibleSelection(selected, visible)], ["clip"], "a second press clears only the visible ones");
  assert.equal(allVisibleSelected(new Set(), [assets[4]]), false, "nothing selectable is never 'all selected'");
  const nearlyFull = new Set(Array.from({ length: MAX_SELECTED - 1 }, (_, index) => `x${index}`));
  assert.equal(toggleVisibleSelection(nearlyFull, visible).size, MAX_SELECTED);
});

test("save: the tickets of the selected candidates that carry one, in list order", () => {
  assert.deepEqual(selectedTickets(assets, new Set(["clip", "poster", "live", "blocked", "gone"])), ["ticket-poster", "ticket-clip"]);
  assert.deepEqual(selectedTickets(assets, new Set()), []);
});
