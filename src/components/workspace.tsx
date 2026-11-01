"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HeroArt } from "@/components/hero-art";
import { needsPolicyAck, PolicyGate } from "@/components/policy-gate";
import { ResultsPanel, type ScanView } from "@/components/results-panel";
import { HowItWorks, ScanEntry } from "@/components/scan-entry";
import { SelectionBar } from "@/components/selection-bar";
import { SiteHeader } from "@/components/site-header";
import { StatusBand, type BandError, type BandNotice, type PreviewWait } from "@/components/status-band";
import { TurnstileWidget, type TurnstileWidgetHandle } from "@/components/turnstile-widget";
import { WorkspaceFooter } from "@/components/workspace-footer";
import { postDownload, postScan, type ClientError, type ScanInput } from "@/lib/api-client";
import { countByKind, filterAssets, NO_FILTERS, selectedTickets, toggleSelection, toggleVisibleSelection, type AssetFilters } from "@/lib/asset-selection";
import { readDownloadReport, type DownloadReport } from "@/lib/download-report";
import type { LiveFetchState } from "@/lib/ops-config";
import { IDLE_START_FLOW, startFlowStep, type StartFlowEvent, type StartFlowState } from "@/lib/start-flow";
import { LIVE_PAUSED, LIVE_UNAVAILABLE, type ExpiryCause, type StatusSubject } from "@/lib/status-band";
import { parseTurnstileSiteKey, type TurnstileStatus } from "@/lib/turnstile-client";
import type { AssetItem } from "@/lib/types";

type Phase = "idle" | "scanning" | "downloading";
/** setTimeout runs at once beyond this delay. */
const MAX_TIMER_MS = 2_147_483_647;

function saveFile(blob: Blob, filename: string) {
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(href), 30_000);
}

export interface WorkspaceProps {
  /** /demo: the built-in demo only. */
  readonly demoOnly?: boolean;
  /**
   * Whether a page scan can start, as the server read it at request time (ops-config.ts). /app starts by it; /demo
   * only uses a pause, for its line beside "自分のURLで使う".
   */
  readonly liveFetch?: LiveFetchState;
  /** /app: the bot-check site key the server read at request time; null unless page scans are open. */
  readonly turnstileSiteKey?: string | null;
}

/**
 * /app (a page URL) and /demo (the built-in demo) share these parts; only the start differs. The flow is URL → scan →
 * filter → preview → select → ZIP (design-ux.md). Every start goes through lib/start-flow.ts: the policy check before
 * the first start, then (page scans only) the bot check, whose script loads no earlier than that. While page scans are
 * paused, /app says so above the URL field and a page scan goes straight to the band, with neither check. Nothing is
 * kept outside this page: the scan answer and its tickets stay in memory, and the server stops accepting them 30
 * minutes after the scan.
 */
export default function Workspace({ demoOnly = false, liveFetch = "unavailable", turnstileSiteKey = null }: WorkspaceProps) {
  const [view, setView] = useState<ScanView | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [scanningDemo, setScanningDemo] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const [filters, setFilters] = useState<AssetFilters>(NO_FILTERS);
  const [expiry, setExpiry] = useState<ExpiryCause | null>(null);
  const expired = expiry !== null;
  const [error, setError] = useState<BandError | null>(null);
  const [notice, setNotice] = useState<BandNotice | null>(null);
  const [previewWait, setPreviewWait] = useState<PreviewWait>(null);
  const [report, setReport] = useState<DownloadReport | null>(null);
  const [flow, setFlow] = useState<StartFlowState>(IDLE_START_FLOW);
  const [botStatus, setBotStatus] = useState<TurnstileStatus>("loading");
  const scanController = useRef<AbortController | null>(null);
  const downloadController = useRef<AbortController | null>(null);
  const lastScan = useRef<ScanInput | null>(null);
  /** The flow as of the last event; handlers read it here because state updates arrive on the next render. */
  const flowNow = useRef<StartFlowState>(IDLE_START_FLOW);
  const turnstile = useRef<TurnstileWidgetHandle>(null);
  const urlInput = useRef<HTMLInputElement>(null);
  /** Numbers results and errors; each only has to differ from the one before. */
  const counter = useRef(0);
  /** When the shown result arrived and when its tickets expire (ms), to tell the clock from an answer. */
  const resultTimes = useRef<{ readonly arrivedAt: number; readonly expiresAt: number } | null>(null);
  const siteKey = demoOnly ? null : parseTurnstileSiteKey(turnstileSiteKey);
  /** Open only with a usable site key; a pause stays a pause, so the screen can say why a page scan does not start. */
  const live: LiveFetchState = demoOnly || (liveFetch === "open" && siteKey === null) ? "unavailable" : liveFetch;

  /**
   * The result's tickets have expired (the clock, or a 410): no preview will continue, so no wait is shown. The
   * deadline passing on this device while the result was shown is the clock, whoever notices it first (the timer
   * below, or a preview asked for at that moment); anything else is an answer. The first cause stays.
   */
  const markExpired = useCallback(() => {
    const times = resultTimes.current;
    const now = Date.now();
    const cause: ExpiryCause = times !== null && now >= times.expiresAt && times.arrivedAt < times.expiresAt ? "clock" : "answer";
    setExpiry(current => current ?? cause);
    setPreviewWait(null);
  }, []);

  /** Previews wait for the per-minute limit until `untilMs`, or (null) continue again. */
  const onPreviewWait = useCallback((untilMs: number | null) => {
    if (untilMs === null) {
      setPreviewWait(current => current?.state === "waiting" ? { state: "resumed" } : current);
      return;
    }
    setPreviewWait({ state: "waiting", untilMs, seconds: Math.max(1, Math.ceil((untilMs - Date.now()) / 1000)) });
  }, []);

  useEffect(() => {
    if (!view) return;
    const delay = Math.min(MAX_TIMER_MS, Math.max(0, Date.parse(view.response.expiresAt) - Date.now()));
    const timer = window.setTimeout(markExpired, delay);
    return () => window.clearTimeout(timer);
  }, [view, markExpired]);

  useEffect(() => () => { scanController.current?.abort(); downloadController.current?.abort(); }, []);
  const assets = view?.response.assets;
  const visible = useMemo(() => assets ? filterAssets(assets, filters) : [], [assets, filters]);
  const counts = useMemo(() => countByKind(assets ?? []), [assets]);
  const hidden = selected.size - visible.filter(asset => selected.has(asset.id)).length;
  const checking = flow.step === "bot-check";
  const busy = phase !== "idle" || checking;

  function showError(subject: StatusSubject, failure: ClientError) {
    counter.current += 1;
    setError({ id: counter.current, subject, error: failure });
  }

  function dispatch(event: StartFlowEvent) {
    const before = flowNow.current;
    const { state, effect } = startFlowStep(before, event);
    flowNow.current = state;
    setFlow(state);
    if (state.step === "bot-check" && before.step !== "bot-check") {
      // A new widget is mounted for this check; what the band showed before belongs to the last attempt.
      setBotStatus("loading");
      setError(null);
      setNotice(null);
      setReport(null);
    }
    if (event.type === "cancel-wait" && before.step === "bot-check") setNotice({ text: "確認の待機をやめました。解析は始めていません。", announce: true });
    if (effect.type === "send") void sendScan(effect.input, effect.turnstileToken);
    else if (effect.type === "paused") showError("scan", LIVE_PAUSED);
    else if (effect.type === "unavailable") showError("scan", LIVE_UNAVAILABLE);
  }

  /** Every start (a page, the demo, "もう一度取得", a retry) comes here first. */
  function requestStart(request: ScanInput) {
    if (scanController.current || downloadController.current) return;
    dispatch({ type: "start", request, needsPolicy: needsPolicyAck(), live });
  }

  /** The widget is fresh for each check, so "ready" means a token it has not handed over yet. */
  function takeBotToken() {
    if (flowNow.current.step !== "bot-check") return;
    const token = turnstile.current?.takeToken();
    if (token) dispatch({ type: "token", token });
  }

  function onBotStatus(status: TurnstileStatus) {
    setBotStatus(status);
    // After the widget's own update has finished: taking the token changes the widget's state again.
    if (status === "ready") queueMicrotask(takeBotToken);
  }

  /** Sends one scan. Only the start flow calls this; a page scan carries a token that was never sent before. */
  async function sendScan(input: ScanInput, turnstileToken?: string) {
    if (scanController.current || downloadController.current) return;
    const controller = new AbortController();
    scanController.current = controller;
    lastScan.current = input;
    setPhase("scanning");
    setScanningDemo("demo" in input);
    setError(null);
    setNotice(null);
    setReport(null);
    const outcome = await postScan(input, { signal: controller.signal, turnstileToken });
    if (scanController.current !== controller) return;
    scanController.current = null;
    setPhase("idle");
    if (outcome.ok) {
      counter.current += 1;
      resultTimes.current = { arrivedAt: Date.now(), expiresAt: Date.parse(outcome.value.expiresAt) };
      setView({ response: outcome.value, demo: "demo" in input, sourceUrl: "url" in input ? input.url : null, serial: counter.current });
      setSelected(new Set());
      setFilters(NO_FILTERS);
      setExpiry(null);
      setPreviewWait(null);
      // The focus moves to the new result's heading, which says the count: the notice is not read out as well.
      setNotice({ text: `${outcome.value.assets.length}点の素材が見つかりました。`, announce: false });
    } else if (outcome.aborted) {
      setNotice({ text: "ブラウザー側の待機を終了しました。サーバー側の解析は続く場合があります。", announce: true });
    } else {
      showError("scan", outcome.error);
    }
  }

  async function download() {
    if (!view || expired || busy || scanController.current || downloadController.current) return;
    const tickets = selectedTickets(view.response.assets, selected);
    if (tickets.length === 0) return;
    const controller = new AbortController();
    downloadController.current = controller;
    setPhase("downloading");
    setError(null);
    setNotice(null);
    setReport(null);
    const outcome = await postDownload(tickets, { signal: controller.signal });
    const saved = outcome.ok ? await readDownloadReport(outcome.value) : null;
    if (downloadController.current !== controller) return;
    downloadController.current = null;
    setPhase("idle");
    if (!outcome.ok) {
      if (outcome.aborted) return;
      // 410: the tickets have expired. The list stays; saving and previews stop until the page is fetched again.
      if (outcome.error.code === "EXPIRED" || outcome.error.status === 410) setExpiry(current => current ?? "answer");
      showError("download", outcome.error);
      return;
    }
    setReport(saved);
    saveFile(outcome.value, view.demo ? "pagecrate-demo.zip" : "pagecrate-assets.zip");
    if (!saved || saved.saved === saved.requested) setNotice({ text: `${saved ? `${saved.saved}点をまとめた` : ""}ZIPのダウンロードを開始しました。出典と取得結果は、ZIP内のmanifest.jsonで確認できます。`, announce: true });
  }

  /** "もう一度取得": the same page (or the demo) again, right here. A page gets a new bot check. */
  function rescan() {
    if (view) requestStart(view.demo ? { demo: true } : { url: view.sourceUrl ?? view.response.pageUrl });
  }

  function retry() {
    if (error?.subject === "download") void download();
    else if (lastScan.current) requestStart(lastScan.current);
  }

  /** "URL欄へ戻る": the field gets the focus with its text selected, ready to be corrected. */
  function editUrl() {
    urlInput.current?.focus();
    urlInput.current?.select();
  }

  function cancelScan() {
    if (flowNow.current.step === "bot-check") dispatch({ type: "cancel-wait" });
    else scanController.current?.abort();
  }

  function toggle(asset: AssetItem) {
    if (busy || expired) return;
    setReport(null);
    setSelected(current => toggleSelection(current, asset));
  }

  function selectVisible() {
    if (busy || expired) return;
    setReport(null);
    setSelected(current => toggleVisibleSelection(current, visible));
  }

  function clearSelection() {
    setSelected(new Set());
    setReport(null);
  }

  const assetName = (id: string) => assets?.find(asset => asset.id === id)?.name ?? "素材";
  const startDemo = () => requestStart({ demo: true });

  return <div className={`workspace${view ? " has-results" : ""}${selected.size ? " has-selection" : ""}`}>
    <SiteHeader current={demoOnly ? "/demo" : "/app"} skipTo="main" />

    <main id="main" className="shell">
      <section className="hero" aria-labelledby="page-title">
        <div className="hero-copy">
          <p className="eyebrow"><span />{demoOnly ? "登録なしで体験" : "ページの素材集め"}</p>
          <h1 id="page-title">{demoOnly ? <>登録なしで、<br className="hero-line-break" /><span>素材集めを体験。</span></> : <>ページの素材を、<br className="hero-line-break" /><span>ひとつに集めよう。</span></>}</h1>
          <p className="hero-description">{demoOnly ? <>自作の画像と動画で、選択からZIP保存まで。<br />まずはデモの素材を開いてみましょう。</> : <>気になるページの画像と動画を一覧に。<br />必要な素材だけ、出典と一緒に持ち帰る。</>}</p>
        </div>
        {!view && <HeroArt />}
      </section>

      <ScanEntry demoOnly={demoOnly} paused={liveFetch === "paused"} busy={busy} scanning={phase === "scanning"} checking={checking} hasResult={view !== null} inputRef={urlInput} onScan={url => requestStart({ url })} onDemo={startDemo} />

      <StatusBand scanning={phase === "scanning" ? { demo: scanningDemo } : null}
        botCheck={checking && siteKey ? { status: botStatus, widget: <TurnstileWidget ref={turnstile} siteKey={siteKey} messages={false} onStatusChange={onBotStatus} /> } : null}
        keepsResult={view !== null} error={error} expiry={expiry} report={report} notice={notice} previewWait={expired ? null : previewWait} busy={busy} assetName={assetName}
        onCancelScan={cancelScan} onRetry={retry} onRescan={rescan} onDemo={startDemo} onEditUrl={editUrl} onRetryBotCheck={() => turnstile.current?.retry()} />

      {view ? <ResultsPanel key={view.serial} view={view} visible={visible} counts={counts} filters={filters} selected={selected} busy={busy} scanning={phase === "scanning"} expired={expired} onFilters={setFilters} onToggle={toggle} onSelectVisible={selectVisible} onRescan={rescan} onDemo={startDemo} onExpired={markExpired} onPreviewWait={onPreviewWait} />
        : <HowItWorks demoOnly={demoOnly} paused={liveFetch === "paused"} />}
    </main>

    <WorkspaceFooter />

    {selected.size > 0 && <SelectionBar count={selected.size} hidden={hidden} report={report} expiry={expiry} busy={busy} downloading={phase === "downloading"} onClear={clearSelection} onDownload={() => void download()} onRescan={rescan} />}

    <PolicyGate open={flow.step === "policy"} onProceed={() => dispatch({ type: "policy-proceed", live })} onCancel={() => dispatch({ type: "policy-cancel" })} />
  </div>;
}
