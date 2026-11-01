/**
 * Filtering and selection of the scan result (requirement 3.2, design-ux.md U4). Only a candidate with a ticket can
 * be selected and saved; detected-only streams and candidates the server refused carry none. Selection is kept
 * across filter changes and is capped at the 50 tickets one ZIP request may carry.
 */
import type { AssetItem } from "./types";

export const MAX_SELECTED = 50;
export type KindFilter = "all" | "image" | "video" | "unsupported";
export const KIND_FILTERS: readonly { readonly value: KindFilter; readonly label: string }[] = [
  { value: "all", label: "すべて" },
  { value: "image", label: "画像" },
  { value: "video", label: "動画" },
  { value: "unsupported", label: "未対応" },
];
export interface AssetFilters {
  readonly kind: KindFilter;
  /** Matched against the name and the source URL, ignoring case. */
  readonly query: string;
  /** 0 means no minimum. Candidates without a known width are left out when a minimum is set. */
  readonly minWidth: number;
}
export const NO_FILTERS: AssetFilters = Object.freeze({ kind: "all", query: "", minWidth: 0 });
export const WIDTH_OPTIONS: readonly number[] = [300, 600, 1000, 1920];
type Selection = ReadonlySet<string>;

/** A candidate can be selected and saved only when the scan gave it a ticket. */
export function isSelectable(asset: Pick<AssetItem, "ticket">): boolean {
  return typeof asset.ticket === "string" && asset.ticket.length > 0;
}

/** "未対応" lists everything that cannot be saved, whatever its kind. */
export function matchesKind(asset: AssetItem, kind: KindFilter): boolean {
  if (kind === "all") return true;
  return kind === "unsupported" ? !isSelectable(asset) : asset.kind === kind;
}

export function hasFilters(filters: AssetFilters): boolean {
  return filters.kind !== "all" || filters.query !== "" || filters.minWidth > 0;
}

export function filterAssets(assets: readonly AssetItem[], filters: AssetFilters): AssetItem[] {
  const search = filters.query.trim().toLocaleLowerCase();
  return assets.filter(asset => matchesKind(asset, filters.kind)
    && (!search || `${asset.name} ${asset.url}`.toLocaleLowerCase().includes(search))
    && (filters.minWidth <= 0 || (asset.width !== undefined && asset.width >= filters.minWidth)));
}

export function countByKind(assets: readonly AssetItem[]): Record<KindFilter, number> {
  const counts: Record<KindFilter, number> = { all: 0, image: 0, video: 0, unsupported: 0 };
  for (const asset of assets) {
    for (const { value } of KIND_FILTERS) if (matchesKind(asset, value)) counts[value] += 1;
  }
  return counts;
}

/** Adds or removes one candidate. A candidate without a ticket, or one past the cap, leaves the selection as it was. */
export function toggleSelection(selected: Selection, asset: AssetItem, max: number = MAX_SELECTED): Selection {
  if (selected.has(asset.id)) {
    const next = new Set(selected);
    next.delete(asset.id);
    return next;
  }
  if (!isSelectable(asset) || selected.size >= max) return selected;
  return new Set(selected).add(asset.id);
}

/** True when every selectable candidate in view is selected (and there is at least one). */
export function allVisibleSelected(selected: Selection, visible: readonly AssetItem[]): boolean {
  const selectable = visible.filter(isSelectable);
  return selectable.length > 0 && selectable.every(asset => selected.has(asset.id));
}

/** "表示中を選択": selects the selectable candidates in view, in order, up to the cap; if all are selected, clears them. */
export function toggleVisibleSelection(selected: Selection, visible: readonly AssetItem[], max: number = MAX_SELECTED): Selection {
  const selectable = visible.filter(isSelectable);
  const next = new Set(selected);
  if (allVisibleSelected(selected, visible)) {
    for (const asset of selectable) next.delete(asset.id);
    return next;
  }
  for (const asset of selectable) {
    if (next.size >= max) break;
    next.add(asset.id);
  }
  return next;
}

/** The tickets to save: selected candidates that carry one, in list order. */
export function selectedTickets(assets: readonly AssetItem[], selected: Selection): string[] {
  return assets.flatMap(asset => selected.has(asset.id) && isSelectable(asset) && asset.ticket ? [asset.ticket] : []);
}
