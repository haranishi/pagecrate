"use client";

import { useEffect, useRef } from "react";
import { Icon } from "@/components/icons";
import { MAX_SELECTED } from "@/lib/asset-selection";
import type { DownloadReport } from "@/lib/download-report";
import type { ExpiryCause } from "@/lib/status-band";

interface SelectionBarProps {
  readonly count: number;
  /** Selected candidates the current filters hide. */
  readonly hidden: number;
  readonly report: DownloadReport | null;
  /** The result has expired, and why: when only the clock ran out, this bar is where the visitor learns it. */
  readonly expiry: ExpiryCause | null;
  readonly busy: boolean;
  readonly downloading: boolean;
  readonly onClear: () => void;
  readonly onDownload: () => void;
  readonly onRescan: () => void;
}

/** The CSS variable with the height the bar covers at the bottom of the screen (globals.css uses it). */
const BAR_SPACE = "--selection-bar-space";

/**
 * Fixed at the bottom while something is selected: count and cap, the save button, and the result of the last save
 * (design-ux.md). Once the result has expired, saving is off and "もう一度取得" takes the save button's place; when
 * only the clock ran out, its line says so, since the page is not moved to the band (UI scoring round 2).
 * While it is shown, it publishes the space it covers, so the page can end above it and anything scrolled into view
 * (a new status band, a focused card) stops above it.
 */
export function SelectionBar({ count, hidden, report, expiry, busy, downloading, onClear, onDownload, onRescan }: SelectionBarProps) {
  const expired = expiry !== null;
  const bar = useRef<HTMLElement>(null);
  useEffect(() => {
    const element = bar.current;
    if (!element) return;
    const root = document.documentElement;
    const update = () => root.style.setProperty(BAR_SPACE, `${Math.max(0, Math.ceil(window.innerHeight - element.getBoundingClientRect().top))}px`);
    update();
    const resized = typeof ResizeObserver === "function" ? new ResizeObserver(update) : null;
    resized?.observe(element);
    window.addEventListener("resize", update);
    return () => {
      resized?.disconnect();
      window.removeEventListener("resize", update);
      root.style.removeProperty(BAR_SPACE);
    };
  }, []);
  const hiddenNote = hidden > 0 ? <span className="hidden-selection-count">うち{hidden}点は絞り込みで非表示</span> : null;
  return <aside ref={bar} className={`selection-bar${expired ? " is-expired" : ""}`} aria-label="選択した素材を保存">
    <div className="selection-summary">
      <span className="selection-count">{count}</span>
      <div>
        <strong>点を選択中 <span>/ {MAX_SELECTED}</span></strong>
        <p>{expiry === "clock" ? <>取得から30分が過ぎました。もう一度取得してください。{hiddenNote}</>
          : expired ? <>保存期限が切れました。もう一度取得すると保存できます。{hiddenNote}</>
          : report ? <>{report.saved}/{report.requested}点をZIPに保存{report.saved < report.requested && <a className="download-report-link" href="#download-report">未取得の詳細</a>}{hiddenNote}</>
          : hidden > 0 ? `うち${hidden}点は絞り込みで非表示`
          : count >= MAX_SELECTED ? "一度に保存できる上限に達しました"
          : "原本 + 出典の記録をまとめて保存"}</p>
      </div>
    </div>
    <div className="selection-actions">
      <button className="clear-selection" type="button" disabled={downloading} onClick={onClear}>すべて解除</button>
      {expired
        ? <button className="button button-primary download-button" type="button" disabled={busy} onClick={onRescan}><Icon name="refresh" /><span>もう一度取得</span></button>
        // While the ZIP is prepared the button keeps its colour and shows the spinner; download() ignores a press.
        : <button className="button button-primary download-button" type="button" disabled={busy && !downloading} aria-disabled={downloading || undefined} onClick={onDownload}>{downloading
          ? <><span className="spinner" />ZIPを準備しています</>
          : <><Icon name="download" /><span>ZIPで保存</span><span className="download-count">{count}</span></>}</button>}
    </div>
    <span className="sr-only" role="status">{downloading ? "選択した素材を取得してZIPにまとめています。" : ""}</span>
  </aside>;
}
