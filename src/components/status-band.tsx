"use client";

import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from "react";
import { Icon } from "@/components/icons";
import type { DownloadReport } from "@/lib/download-report";
import { describeStatus, LOCAL_EXPIRED, waitEstimate, waitPhrase, type ExpiryCause, type StatusAction, type StatusDescription, type StatusError } from "@/lib/status-band";
import type { TurnstileStatus } from "@/lib/turnstile-client";

/** An error in the band. A new id starts a new wait and takes the focus again. */
export interface BandError extends StatusError { readonly id: number }

/** A short notice. `announce` is false when the focus already moves to what the notice says (a new result). */
export interface BandNotice { readonly text: string; readonly announce: boolean }

/**
 * Previews wait for the per-minute limit (until `untilMs`; `seconds` as counted when the wait began), or have just
 * started again after such a wait.
 */
export type PreviewWait = { readonly state: "waiting"; readonly untilMs: number; readonly seconds: number } | { readonly state: "resumed" } | null;

export interface StatusBandProps {
  /** Set while a scan runs. */
  readonly scanning: { readonly demo: boolean } | null;
  /** Set while a page scan waits for its bot check: the widget's status and the widget itself. */
  readonly botCheck: { readonly status: TurnstileStatus; readonly widget: ReactNode } | null;
  /** A previous result stays on screen below the band. */
  readonly keepsResult: boolean;
  readonly error: BandError | null;
  /** The result has expired, and why: the clock alone does not move the page to the band. */
  readonly expiry: ExpiryCause | null;
  readonly report: DownloadReport | null;
  readonly notice: BandNotice | null;
  readonly previewWait: PreviewWait;
  readonly busy: boolean;
  readonly assetName: (id: string) => string;
  readonly onCancelScan: () => void;
  readonly onRetry: () => void;
  readonly onRescan: () => void;
  readonly onDemo: () => void;
  readonly onEditUrl: () => void;
  readonly onRetryBotCheck: () => void;
}

/**
 * The one place for progress, errors and notices (design-ux.md: 状態帯). One thing shows at a time: a running scan,
 * else the bot check, else an error, else an expired result, else a partly failed ZIP, else the last notice.
 *
 * What a screen reader hears is decided per kind, so nothing is read twice (the band itself is not a live region):
 * - an error that needs an action (a retry, getting the page again) takes the focus and is not announced;
 * - information only (progress, counts, an expired result, waits) is announced politely and leaves the focus alone.
 * A wait is announced at its start and its end only; the visible seconds are hidden from screen readers.
 */
export function StatusBand(props: StatusBandProps) {
  return <div className="status-band">
    <p className="sr-only" role="status">{announcement(props)}</p>
    {content(props)}
    {props.previewWait?.state === "waiting" && <PreviewWaitLine key={props.previewWait.untilMs} seconds={props.previewWait.seconds} />}
    <p className="sr-only" role="status">{previewAnnouncement(props.previewWait)}</p>
  </div>;
}

function content({ scanning, botCheck, keepsResult, error, expiry, report, notice, busy, assetName, onCancelScan, onRetry, onRescan, onDemo, onEditUrl, onRetryBotCheck }: StatusBandProps) {
  if (scanning) return <ScanProgress demo={scanning.demo} keepsResult={keepsResult} onCancel={onCancelScan} />;
  if (botCheck) return <BotCheck status={botCheck.status} widget={botCheck.widget} onRetry={onRetryBotCheck} onCancel={onCancelScan} />;
  const handlers = { retry: onRetry, rescan: onRescan, demo: onDemo, url: onEditUrl };
  if (error) return <ErrorBox key={error.id} error={error} keepsResult={keepsResult} busy={busy} handlers={handlers} />;
  if (expiry) return <ExpiredBox busy={busy} quiet={expiry === "clock"} onRescan={onRescan} />;
  if (report && report.saved < report.requested) return <ReportBox report={report} assetName={assetName} />;
  if (notice) return <p className="notice status-box"><Icon name="check" />{notice.text}</p>;
  return null;
}

/** The polite announcement for what the band shows; empty for errors, which take the focus instead. */
function announcement({ scanning, botCheck, error, expiry, report, notice }: StatusBandProps): string {
  if (scanning) return scanning.demo ? "自作のデモ素材を準備しています。" : "ページを開いて、素材を探しています。最大40秒ほどかかります。";
  if (botCheck) return botCheck.status === "error" ? "" : "ボット確認をしています。";
  if (error) return "";
  if (expiry) {
    const description = describeStatus({ subject: "scan", error: LOCAL_EXPIRED });
    return `${description.title}。${description.estimate}`;
  }
  if (report && report.saved < report.requested) return `${reportTitle(report)}。${report.requested - report.saved}点は取得できませんでした。`;
  return notice?.announce ? notice.text : "";
}

function previewAnnouncement(wait: PreviewWait): string {
  if (wait?.state === "waiting") return `プレビューは1分あたりの回数に上限があります。${waitPhrase(wait.seconds)}で続きを表示します。`;
  return wait?.state === "resumed" ? "プレビューの続きを表示しています。" : "";
}

/**
 * Scrolls a new box of the band fully into sight. The page's scroll padding (globals.css) includes the fixed selection
 * bar, so the box also ends above the bar. With reduced motion the jump is instant.
 */
function reveal(element: HTMLElement) {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  element.scrollIntoView({ block: "nearest", inline: "nearest", behavior: reduced ? "instant" : "smooth" });
}

/**
 * Brings a box into sight when it appears (design: a new state of the band must be seen), and again when it grows
 * while on screen, as the bot check does once its widget is drawn. A box the visitor has scrolled away from stays put.
 * Off (`enabled` false) for what the clock alone brings: it would pull the page away from what the visitor reads.
 */
function useReveal(box: RefObject<HTMLElement | null>, enabled = true) {
  useEffect(() => {
    const element = box.current;
    if (!element || !enabled) return;
    reveal(element);
    if (typeof ResizeObserver !== "function") return;
    let height = element.getBoundingClientRect().height;
    const resized = new ResizeObserver(() => {
      const rect = element.getBoundingClientRect();
      if (rect.height > height + 1 && rect.bottom > 0 && rect.top < window.innerHeight) reveal(element);
      height = rect.height;
    });
    resized.observe(element);
    return () => resized.disconnect();
  }, [box, enabled]);
}

/** Seconds left of a wait that started with `seconds`, updated as time passes (for the visible countdown only). */
function useSecondsLeft(seconds: number): number {
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    if (seconds <= 0) return;
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      const remaining = Math.max(0, seconds - Math.floor((Date.now() - startedAt) / 1000));
      setLeft(remaining);
      if (remaining === 0) window.clearInterval(timer);
    }, 250);
    return () => window.clearInterval(timer);
  }, [seconds]);
  return left;
}

function ScanProgress({ demo, keepsResult, onCancel }: { demo: boolean; keepsResult: boolean; onCancel: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  useReveal(box);
  return <div ref={box} className="scan-progress status-box">
    <span className="scan-progress-icon"><span className="spinner" /></span>
    <div>
      <strong>{demo ? "自作のデモ素材を準備しています" : "ページを開いて、素材を探しています"}</strong>
      <p>{demo ? "画像・動画のサンプルを読み込んでいます。" : "画像・背景・動画を確認中です。最大40秒ほどかかります。"}</p>
      {keepsResult && <p>下には前回の取得結果を表示しています。</p>}
    </div>
    <button className="text-button" type="button" onClick={onCancel}>待機をやめる</button>
  </div>;
}

/** A page scan waits for its bot check. The widget stays in one place, so a retry does not draw it again. */
function BotCheck({ status, widget, onRetry, onCancel }: { status: TurnstileStatus; widget: ReactNode; onRetry: () => void; onCancel: () => void }) {
  const failed = status === "error";
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();
  useReveal(panel);
  // A failed check needs an action: it takes the focus (and is not announced), and is brought into sight.
  useEffect(() => {
    if (!failed || !panel.current) return;
    panel.current.focus({ preventScroll: true });
    reveal(panel.current);
  }, [failed]);
  return <div ref={panel} className={`bot-check status-box${failed ? " is-failed" : ""}`} role="group" tabIndex={-1} aria-labelledby={`${id}-title`} aria-describedby={`${id}-text`}>
    <div className="bot-check-head">
      <span className="scan-progress-icon">{failed ? <Icon name="warning" /> : <span className="spinner" />}</span>
      <div>
        <strong id={`${id}-title`}>{failed ? "ボット確認を完了できませんでした" : "ボット確認をしています"}</strong>
        <p id={`${id}-text`}>{failed ? "接続を確かめてから、もう一度確認してください。" : "人の操作であることを、Cloudflare の仕組みで確かめています。表示が出たら、指示に従ってください。"}</p>
      </div>
    </div>
    <div className="bot-check-widget">{widget}</div>
    <div className="bot-check-actions">
      {failed && <button className="button button-small button-outline" type="button" onClick={onRetry}><Icon name="refresh" />もう一度確認する</button>}
      <button className="text-button" type="button" onClick={onCancel}>待機をやめる</button>
    </div>
  </div>;
}

/**
 * The band's button. While a retry waits, it shows the seconds left and cannot be pressed (aria-disabled), but its
 * words stay dark: `disabled` would fade them out of reach (about 2.4:1). Its name stays the action's label, so a
 * screen reader hears nothing new each second; the start and the end of the wait are announced by the band.
 * `lead` (a calm band, the demo while paused): as tall as a main button, the band's full width on a phone, and its
 * arrow after the words like every other "→" button of the site.
 */
function ActionButton({ action, disabled, waitLeft = 0, lead = false, onClick }: { action: StatusAction; disabled: boolean; waitLeft?: number; lead?: boolean; onClick: () => void }) {
  const waiting = waitLeft > 0;
  const icon = <Icon name={action.kind === "rescan" || action.kind === "retry" ? "refresh" : "arrow"} />;
  return <button className={`button ${lead ? "status-lead" : "button-small"} ${action.primary ? "button-primary" : "button-outline"}`} type="button" disabled={disabled}
    aria-disabled={waiting || undefined} onClick={() => { if (!waiting) onClick(); }}>
    {!lead && icon}
    {waiting ? <><span className="button-wait" aria-hidden="true">{`あと${waitLeft}秒`}</span><span className="sr-only">{action.label}</span></> : action.label}
    {lead && icon}
  </button>;
}

/** The heading, the server's sentence, the estimate, and the next step in words when no button says it. */
function StatusText({ description, id, estimate }: { description: StatusDescription; id: string; estimate: ReactNode }) {
  return <>
    <strong id={`${id}-title`}>{description.title}</strong>
    <p id={`${id}-message`}>{description.message}</p>
    <p className="status-estimate"><span className="status-label">目安</span>{estimate}</p>
    {!description.action && <p className="status-next"><span className="status-label">次にすること</span>{description.nextStep}</p>}
  </>;
}

/**
 * An answer that needs an action takes the focus. A calm one (a pause the operator planned) looks like the always-on
 * note above the URL field, with the info mark and a full-size button; every other one keeps the warning look.
 */
function ErrorBox({ error, keepsResult, busy, handlers }: { error: BandError; keepsResult: boolean; busy: boolean; handlers: Readonly<Record<StatusAction["kind"], () => void>> }) {
  const description = describeStatus(error);
  const { waitSec, action } = description;
  const calm = description.tone === "calm";
  const id = useId();
  const box = useRef<HTMLDivElement>(null);
  const left = useSecondsLeft(waitSec ?? 0);
  // Focus first (without the browser's own scroll, which can leave the box under the selection bar), then reveal it.
  useEffect(() => { box.current?.focus({ preventScroll: true }); }, []);
  useReveal(box);
  const waiting = left > 0;
  return <div ref={box} className={`message-box ${calm ? "calm-box" : "error-box"} status-box`} role="group" tabIndex={-1} aria-labelledby={`${id}-title`} aria-describedby={`${id}-message ${id}-start`}>
    <Icon name={calm ? "info" : "warning"} />
    <div>
      <StatusText description={description} id={id} estimate={waitSec === undefined ? description.estimate : <span className="status-wait" aria-hidden="true">{waitEstimate(left)}</span>} />
      {/* Read with the focus: the estimate as it was at the start. The end of a wait is announced once, below. */}
      <p id={`${id}-start`} className="sr-only">{`目安：${description.estimate}${action ? "" : `次にすること：${description.nextStep}`}`}</p>
      {waitSec !== undefined && <p className="sr-only" role="status">{waiting ? "" : "もう一度試せます。"}</p>}
      {keepsResult && error.subject === "scan" && action?.kind !== "rescan" && <p>前回の取得結果と選択は、そのまま残しています。</p>}
    </div>
    {action && <ActionButton action={action} disabled={busy} waitLeft={left} lead={calm} onClick={handlers[action.kind]} />}
  </div>;
}

/**
 * The result's 30 minutes passed (on this device, or a preview said so): information, announced, not focused. An
 * answer to what the visitor did is brought into sight; the clock alone (`quiet`) leaves the page where it is, and the
 * selection bar says it where the visitor is looking (UI scoring round 2).
 */
function ExpiredBox({ busy, quiet, onRescan }: { busy: boolean; quiet: boolean; onRescan: () => void }) {
  const description = describeStatus({ subject: "scan", error: LOCAL_EXPIRED });
  const id = useId();
  const box = useRef<HTMLDivElement>(null);
  useReveal(box, !quiet);
  return <div ref={box} className="message-box status-box" role="group" aria-labelledby={`${id}-title`}>
    <Icon name="info" />
    <div><StatusText description={description} id={id} estimate={description.estimate} /></div>
    {description.action && <ActionButton action={description.action} disabled={busy} onClick={onRescan} />}
  </div>;
}

function reportTitle(report: DownloadReport): string {
  return report.saved === 0 ? "選択した素材を保存できませんでした" : `${report.requested}点中、${report.saved}点をZIPに保存しました`;
}

function ReportBox({ report, assetName }: { report: DownloadReport; assetName: (id: string) => string }) {
  return <div id="download-report" className="message-box status-box" role="group" tabIndex={-1} aria-labelledby="download-report-title">
    <Icon name="warning" />
    <div>
      <strong id="download-report-title">{reportTitle(report)}</strong>
      <p>{report.requested - report.saved}点は取得できませんでした。ダウンロードしたZIPのmanifest.jsonにも取得結果を記録しています。</p>
      {report.failures.length > 0 && <ul>{report.failures.map(failure => <li key={failure.id}>{assetName(failure.id)}：{failure.reason}</li>)}</ul>}
    </div>
  </div>;
}

/** Previews pause for the per-minute limit; the cards keep their frames and continue by themselves. */
function PreviewWaitLine({ seconds }: { seconds: number }) {
  const left = useSecondsLeft(seconds);
  return <p className="preview-wait-line" aria-hidden="true"><Icon name="info" />{`プレビューは1分あたりの回数に上限があります。${left > 0 ? `あと${waitPhrase(left)}で続きを表示します。` : "まもなく続きを表示します。"}`}</p>;
}
