"use client";

import { useEffect, useRef, useState } from "react";
import { AssetCard, publicSourceUrl } from "@/components/asset-card";
import { Icon } from "@/components/icons";
import { fetchPreview } from "@/lib/api-client";
import { allVisibleSelected, hasFilters, isSelectable, KIND_FILTERS, MAX_SELECTED, NO_FILTERS, WIDTH_OPTIONS, type AssetFilters, type KindFilter } from "@/lib/asset-selection";
import { createPreviewStore } from "@/lib/preview-store";
import type { AssetItem, ScanResponse } from "@/lib/types";

/** The scan answer as the API sent it, plus what the screen keeps beside it. */
export interface ScanView {
  readonly response: ScanResponse;
  /** The built-in demo: the screen knows, the answer does not say. */
  readonly demo: boolean;
  /** The URL that was entered, used by "もう一度取得" (the answer's pageUrl is the page after redirects). */
  readonly sourceUrl: string | null;
  /** Counts results, so a new one remounts the list and its previews. */
  readonly serial: number;
}

interface ResultsPanelProps {
  readonly view: ScanView;
  readonly visible: readonly AssetItem[];
  readonly counts: Readonly<Record<KindFilter, number>>;
  readonly filters: AssetFilters;
  readonly selected: ReadonlySet<string>;
  readonly busy: boolean;
  readonly scanning: boolean;
  readonly expired: boolean;
  readonly onFilters: (filters: AssetFilters) => void;
  readonly onToggle: (asset: AssetItem) => void;
  readonly onSelectVisible: () => void;
  readonly onRescan: () => void;
  readonly onDemo: () => void;
  /** A preview answer showed that the result's tickets have expired. */
  readonly onExpired: () => void;
  /** Previews wait for the per-minute limit until this time; null once they continue (or the list goes away). */
  readonly onPreviewWait: (untilMs: number | null) => void;
}

const DEMO_NOTE = "これは内蔵サンプルです。画像・動画はこのアプリ用に作成したデモ素材で、実サイトからの取得結果ではありません。";
const TRUNCATED_NOTE = "候補が多いか、解析が40秒を超えたため、見つかった範囲だけを表示しています。";

function pageHostname(value: string) {
  try { return new URL(value).hostname; } catch { return value; }
}

function shortTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "30分間" : new Intl.DateTimeFormat("ja-JP", { hour: "2-digit", minute: "2-digit" }).format(date);
}

/** One scan result: heading (source, count, deadline), filters and the cards. Keyed by the result's serial. */
export function ResultsPanel({ view, visible, counts, filters, selected, busy, scanning, expired, onFilters, onToggle, onSelectVisible, onRescan, onDemo, onExpired, onPreviewWait }: ResultsPanelProps) {
  const { response, demo } = view;
  const heading = useRef<HTMLHeadingElement>(null);
  const [previews] = useState(() => createPreviewStore<Blob>({
    expiresAtMs: Date.parse(response.expiresAt),
    fetchPreview: (path, signal) => fetchPreview(path, signal),
    createUrl: blob => URL.createObjectURL(blob),
    revokeUrl: url => URL.revokeObjectURL(url),
    onExpired,
    onRateLimitWait: onPreviewWait,
  }));
  useEffect(() => () => previews.reset(), [previews]);
  useEffect(() => { if (expired) previews.expire(); }, [expired, previews]);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => heading.current?.focus({ preventScroll: true }));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const pageHref = demo ? null : publicSourceUrl(response.pageUrl);
  const notes = [...(demo ? [DEMO_NOTE] : []), ...(response.truncated ? [TRUNCATED_NOTE] : [])];
  const selectable = visible.filter(isSelectable);
  const allSelected = allVisibleSelected(selected, visible);
  const total = response.assets.length;
  const locked = busy || expired;

  return <section className="results-section" aria-labelledby="results-heading" aria-busy={scanning}>
    <div className="results-heading-row">
      <div>
        <p className="eyebrow results-eyebrow">集めた素材{demo && <span className="demo-badge">デモ</span>}</p>
        <h2 id="results-heading" ref={heading} tabIndex={-1}>見つかった素材<span className="total-count">{total}<small>点</small></span></h2>
        <div className="collection-source">{pageHref
          ? <a href={pageHref} target="_blank" rel="noopener noreferrer" title={response.pageUrl}>取得元：{pageHostname(response.pageUrl)}<Icon name="external" /></a>
          : <span>取得元：PageCrate デモ（内蔵サンプル）</span>}</div>
      </div>
      <div className="collection-actions">
        <span className={`expires-label${expired ? " is-expired" : ""}`}>{expired ? "保存期限が切れました" : `${shortTime(response.expiresAt)} まで保存できます`}</span>
        <button className="button button-small button-outline" type="button" disabled={busy} onClick={onRescan}><Icon name="refresh" />もう一度取得</button>
      </div>
    </div>

    {notes.length > 0 && <div className={`message-box ${demo ? "info-box" : ""}`}><Icon name="info" /><div><strong>{demo ? "デモの素材について" : "取得結果について"}</strong><ul>{notes.map(note => <li key={note}>{note}</li>)}</ul></div></div>}

    {total > 0 && <>
      <div className="filter-toolbar">
        <div className="kind-filters" role="group" aria-label="素材の種類">{KIND_FILTERS.map(({ value, label }) => <button type="button" className={`filter-tab${filters.kind === value ? " is-active" : ""}`} key={value} aria-pressed={filters.kind === value} onClick={() => onFilters({ ...filters, kind: value })}>{label}<span>{counts[value]}</span></button>)}</div>
        <div className="filter-fields">
          <label className="filter-search"><Icon name="search" /><span className="sr-only">素材名・取得元で絞り込む</span><input type="search" value={filters.query} onChange={event => onFilters({ ...filters, query: event.target.value })} placeholder="素材名・取得元で検索" /></label>
          <label className="width-filter"><Icon name="sliders" /><span className="sr-only">最小幅で絞り込む</span><select value={filters.minWidth || ""} onChange={event => onFilters({ ...filters, minWidth: Number(event.target.value) || 0 })}><option value="">最小の幅：指定なし</option>{WIDTH_OPTIONS.map(width => <option key={width} value={width}>最小の幅：{width.toLocaleString()}px 以上</option>)}</select></label>
        </div>
      </div>
      <div className="gallery-topline">
        <p aria-live="polite">{visible.length}<span> / {total}点を表示</span>{hasFilters(filters) && <button className="clear-filters" type="button" onClick={() => onFilters(NO_FILTERS)}>絞り込みを解除<Icon name="close" /></button>}</p>
        <button className="text-button select-visible" type="button" disabled={locked || selectable.length === 0 || (!allSelected && selected.size >= MAX_SELECTED)} onClick={onSelectVisible}><Icon name={allSelected ? "close" : "check"} />{allSelected ? "表示中の選択を解除" : "表示中を選択"}</button>
      </div>
    </>}

    {visible.length > 0 ? <div className="asset-grid">{visible.map(asset => <AssetCard key={asset.id} asset={asset} idPrefix={`r${view.serial}`} previews={previews} selected={selected.has(asset.id)} disabled={locked || (!selected.has(asset.id) && selected.size >= MAX_SELECTED)} onToggle={onToggle} />)}</div>
      : <div className="empty-state">
        <span className="empty-icon"><Icon name={total ? "search" : "image"} /></span>
        <h3>{total ? "条件に合う素材がありません" : "素材が見つかりませんでした"}</h3>
        <p>{total ? "検索する言葉や幅の条件を変えてみてください。選択済みの素材はそのまま残っています。" : "このページには対応する素材がないか、アクセス制限などで取得できなかった可能性があります。"}</p>
        <button className="button button-outline" type="button" disabled={busy} onClick={total ? () => onFilters(NO_FILTERS) : onRescan}>{total ? "絞り込みを解除" : "もう一度取得"}<Icon name={total ? "close" : "refresh"} /></button>
        {!total && !demo && <button className="text-button" type="button" disabled={busy} onClick={onDemo}>デモの素材を見る<Icon name="arrow" /></button>}
      </div>}

    <p className="collection-footnote">この結果は運営者側に保存されません。取得から30分で、保存とプレビューができなくなります。<span>ダウンロードしたZIPは端末に残ります。1回の保存は50点まで。取得できなかった素材はZIP内の記録に残ります。</span><span>ZIPに残す出典はドメインだけです。正確なURLは各素材の「出典と詳細」で確認できます。</span></p>
  </section>;
}
