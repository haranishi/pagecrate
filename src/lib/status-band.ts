/**
 * The status band's table (design-ux.md, "変わった実装" 2): one place that turns an error into a heading, the next
 * step, an estimate (目安) and a button. The body is the server's own sentence, shown as it is; the table adds what
 * the person needs to decide what to do and when. Pure, so a test can walk every code.
 */
import type { ClientError, ClientErrorCode } from "./api-client";
import { PAUSE_HEADING, PAUSE_NEXT } from "./pause-wording";

/** What the error is about. */
export type StatusSubject = "scan" | "download";
export interface StatusError { readonly subject: StatusSubject; readonly error: ClientError }
/**
 * retry: repeat what failed (a page scan gets a new bot check). rescan: get the page again, since the result's
 * tickets can no longer be used. demo: start the built-in demo, which works when page scans do not. url: go back to
 * the URL field.
 */
export type StatusActionKind = "retry" | "rescan" | "demo" | "url";
export interface StatusAction {
  readonly kind: StatusActionKind;
  readonly label: string;
  /** The most prominent button of the band (an expired result, and the demo when page scans are closed). */
  readonly primary: boolean;
}
export interface StatusDescription {
  readonly title: string;
  /** The server's sentence, shown as it is. */
  readonly message: string;
  /** What to do now, in words. Shown when there is no button to say it. */
  readonly nextStep: string;
  /** When it can be used again, or what to expect (目安). For a wait, the sentence at its start. */
  readonly estimate: string;
  readonly action: StatusAction | null;
  /** Whole seconds to wait before the action can be taken; the band counts them down. */
  readonly waitSec?: number;
  /**
   * How the band looks. "calm": a pause the operator planned, shown like the always-on note above the URL field (its
   * colours and the info mark) with its button as tall as a main button. "alert": everything else (the warning look).
   */
  readonly tone: StatusTone;
}

export type StatusTone = "calm" | "alert";

/**
 * Why a result counts as expired. "clock": its 30 minutes ran out while it was on screen and nothing was pressed, so
 * the page is not moved and the selection bar says it where the visitor is looking. "answer": a reply to what the
 * visitor did (a preview or a save the server answered EXPIRED, or a result that arrived already expired), so the
 * band is brought into sight like any other answer (UI scoring round 2).
 */
export type ExpiryCause = "clock" | "answer";

/** Shown when the result's 30 minutes pass on this device; the server answers EXPIRED (410) in the same case. */
export const LOCAL_EXPIRED: ClientError = Object.freeze({
  code: "EXPIRED",
  message: "取得から30分が過ぎたため、この結果では保存もプレビューもできません。もう一度取得してください。",
});

/** Shown when /app has no usable bot-check site key: a page scan cannot start, the demo still works. */
export const LIVE_UNAVAILABLE: ClientError = Object.freeze({
  code: "LIVE_UNAVAILABLE",
  message: "いまは実サイトの取得を準備できていません。デモは使えます。",
});

/**
 * Shown when /app knows from the start that the operator has paused page scans (the demo-only public site): the page
 * scan is not tried, so no bot check runs. The code is the server's PAUSED, so the heading, the estimate and the
 * button read the same whoever noticed the pause. The body is the next step, not the server's sentence: the heading
 * already says the pause (UI scoring of the paused screens, round 1). The demo still works.
 */
export const LIVE_PAUSED: ClientError = Object.freeze({
  code: "PAUSED",
  message: PAUSE_NEXT,
});

/** The wait when the server sends none: the per-minute window, and a crowded moment. */
export const DEFAULT_WAIT_SEC: Readonly<Partial<Record<ClientErrorCode, number>>> = { RATE_LIMITED: 60, BUSY: 30 };

const RETRY: StatusAction = { kind: "retry", label: "もう一度試す", primary: false };
const RESCAN: StatusAction = { kind: "rescan", label: "もう一度取得", primary: true };
const DEMO: StatusAction = { kind: "demo", label: "デモを試す", primary: true };
const URL_FIELD: StatusAction = { kind: "url", label: "URL欄へ戻る", primary: false };
const CLOSED_ESTIMATE = "再開の時期は決まっていません。デモはいつでも試せます。";

/** A table row; its tone is "alert" unless it says otherwise. */
type Entry = Omit<StatusDescription, "message" | "waitSec" | "tone"> & { readonly tone?: StatusTone };

const TABLE: Readonly<Partial<Record<ClientErrorCode, Entry>>> = {
  RATE_LIMITED: { title: "続けて使われています", nextStep: "少し待ってから、もう一度試してください。", estimate: "", action: RETRY },
  BUSY: { title: "混み合っています", nextStep: "少し待ってから、もう一度試してください。", estimate: "", action: RETRY },
  // Planned by the operator, not a failure: calm, and the demo is the way on.
  PAUSED: { title: PAUSE_HEADING, nextStep: "デモを試せます。", estimate: "再開の時期は未定です。", action: DEMO, tone: "calm" },
  LIVE_UNAVAILABLE: { title: "いまは実サイトの取得を準備できていません", nextStep: "デモを試せます。", estimate: CLOSED_ESTIMATE, action: DEMO },
  DAILY_CAP_REACHED: { title: "本日の分は終了しました", nextStep: "デモを試せます。", estimate: "日本時間の午前9時ごろに再開します。それまでもデモは試せます。", action: DEMO },
  EXPIRED: { title: "取得から30分が過ぎました", nextStep: "もう一度取得してください。一覧はそのまま残っています。", estimate: "もう一度取得すると、そこから30分、保存とプレビューができます。", action: RESCAN },
  INVALID_TICKET: { title: "素材の情報を確かめられませんでした", nextStep: "もう一度取得してください。", estimate: "もう一度取得すると、新しい一覧から保存できます。", action: RESCAN },
  BOT_CHECK_FAILED: { title: "確認に失敗しました", nextStep: "ボット確認を取り直して、もう一度送ってください。", estimate: "ボタンを押すと、確認を取り直してから同じページを送ります。", action: { kind: "retry", label: "確認してもう一度試す", primary: false } },
  BLOCKED_HOST: { title: "このサイトは取得できません", nextStep: "URL欄に戻って、別のページのURLを入れてください。", estimate: "別のページのURLなら、すぐに試せます。", action: URL_FIELD },
  PRIVATE_ADDRESS: { title: "公開されていない接続先です", nextStep: "URL欄に戻って、公開ページのURLを入れてください。", estimate: "公開ページのURLなら、すぐに試せます。", action: URL_FIELD },
  INVALID_URL: { title: "URLを確かめてください", nextStep: "URL欄に戻って、入力を直してください。", estimate: "URLを直せば、すぐに試せます。", action: URL_FIELD },
  SCAN_FAILED: { title: "ページを解析できませんでした", nextStep: "時間をおいて試すか、別のページで試してください。", estimate: "数分おくと取得できることがあります。", action: RETRY },
  LIMIT_EXCEEDED: { title: "一度に送れる量を超えています", nextStep: "選ぶ素材を減らしてから、もう一度保存してください。", estimate: "1回の保存は50点・合計100MiBまでです。", action: null },
  FORBIDDEN: { title: "この画面からは受け付けられませんでした", nextStep: "ブラウザーのアドレス欄から PageCrate を開き直して、操作してください。", estimate: "PageCrate の画面から操作すれば使えます。", action: null },
  NETWORK_ERROR: { title: "接続できませんでした", nextStep: "接続を確かめてから、もう一度試してください。", estimate: "接続が戻れば、すぐに試せます。", action: RETRY },
};

function fallback(subject: StatusSubject): Entry {
  return { title: subject === "scan" ? "ページを取得できませんでした" : "ZIPを作成できませんでした", nextStep: "時間をおいて、もう一度試してください。", estimate: "多くの場合、少し待つと使えます。", action: RETRY };
}

function positiveWhole(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.ceil(value) : undefined;
}

/** A wait as people say it: seconds under a minute, whole minutes (rounded up) beyond. */
export function waitPhrase(seconds: number): string {
  const whole = Math.max(0, Math.ceil(seconds));
  return whole < 60 ? `${whole}秒ほど` : `${Math.ceil(whole / 60)}分ほど`;
}

/** The estimate of a retry that must wait: the time left, and once it is over, that it can be tried. */
export function waitEstimate(secondsLeft: number): string {
  return secondsLeft > 0 ? `あと${waitPhrase(secondsLeft)}で、もう一度試せます。` : "もう一度試せます。";
}

export function describeStatus({ subject, error }: StatusError): StatusDescription {
  const entry = TABLE[error.code] ?? fallback(subject);
  // A retry waits out the server's seconds (its default when it sends none). Other buttons never wait: a closed day
  // or a pause is not shortened by waiting at the screen.
  const waitSec = entry.action?.kind === "retry" ? positiveWhole(error.retryAfterSec) ?? DEFAULT_WAIT_SEC[error.code] : undefined;
  return {
    ...entry,
    tone: entry.tone ?? "alert",
    message: error.message,
    estimate: waitSec === undefined ? entry.estimate : waitEstimate(waitSec),
    ...(waitSec === undefined ? {} : { waitSec }),
  };
}
