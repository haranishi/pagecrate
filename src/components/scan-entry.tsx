"use client";

import { useState, type FormEvent, type RefObject } from "react";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { Phrased, Sentences } from "@/components/phrased";
import { isPageUrl } from "@/lib/api-client";
import { PAUSE_LEAD, PAUSE_LEAD_PHRASES, PAUSE_NEXT, PAUSE_NEXT_PHRASES } from "@/lib/pause-wording";

/**
 * Shown right under the URL field at all times (requirement 6.1: getting a file is not permission to reuse it; check
 * the rights holder's permission and the site's terms). It replaces the old rights checkbox: ticking a box did not
 * grant any permission and the server never checked it (design-ux.md, "変わった実装" 1).
 */
export const RIGHTS_NOTE = "取得できても、再利用の許諾ではありません。使う前に、権利者の許諾と対象サイトの規約を確認してください。";
/**
 * Where the rights note may wrap on a phone: only between phrases ("|"), each sentence on a line of its own. The
 * phrases keep "再利用の許諾ではありません。" whole (UI scoring of the paused screens: "許諾では／ありません。").
 */
const RIGHTS_NOTE_SENTENCES = ["取得できても、|再利用の許諾ではありません。", "使う前に、|権利者の許諾と|対象サイトの規約を|確認してください。"];
/** Under the field of an open site. Never while paused: it would read as if a page could be fetched now. */
const URL_HELP = "ログイン不要の公開ページを1ページずつ取得します。";
const URL_HELP_PHRASES = "ログイン不要の|公開ページを|1ページずつ取得します。";
/** The card's foot on an open site; while paused, the note at the top of the card is the one way into the demo. */
const ENTRY_HINT = "使い方を試したいときは、サンプル素材で体験できます。";
const ENTRY_HINT_PHRASES = "使い方を試したいときは、|サンプル素材で体験できます。";
/** /demo's line beside "自分のURLで使う" on an open site; while paused it says the pause instead. */
const DEMO_NEXT = "実際のページは、URLを入れて取得できます。";
/** Every way into the demo is called this, except the header's "デモ" and the top page's "登録なしで試す". */
const DEMO_LABEL = "デモを試す";
const URL_EMPTY = "素材を集めたいページのURLを入力してください。";
const URL_INVALID = "https:// または http:// から始まるURLを入力してください。ユーザー名・パスワード付きのURLは使えません。";

interface EntryProps {
  readonly busy: boolean;
  readonly scanning: boolean;
  /** A page scan waits for its bot check. */
  readonly checking: boolean;
  readonly hasResult: boolean;
  readonly onDemo: () => void;
}

interface UrlProps {
  readonly onScan: (url: string) => void;
  /** The URL field, so the status band can bring the person back to it. */
  readonly inputRef: RefObject<HTMLInputElement | null>;
  /**
   * The operator has paused page scans (the demo-only public site). /app: the card says so at its top, with the way
   * into the demo, and drops what would read as fetching now. /demo: its line under the demo says the pause.
   */
  readonly paused: boolean;
}

/** The start of both modes: /app takes a page URL (two steps: URL, then the button), /demo starts the built-in demo. */
export function ScanEntry({ demoOnly, onScan, inputRef, paused, ...entry }: EntryProps & UrlProps & { readonly demoOnly: boolean }) {
  return <>
    <section className="entry-panel" aria-label={demoOnly ? "自作素材のデモ" : "ページの取得"}>
      {demoOnly ? <DemoEntry {...entry} paused={paused} /> : <UrlForm {...entry} onScan={onScan} inputRef={inputRef} paused={paused} />}
    </section>
    {/* The lock goes with the first part. On a phone each part is a line of its own and the separators go (UI scoring
        of the paused screens: the lock stayed at the left while the centred words broke as "外部AIへの／送信なし"). */}
    <div className="privacy-note"><p><Icon name="lock" />{demoOnly
      ? <>このデモは内蔵素材だけを使用<span className="privacy-dot"> · </span><span className="privacy-part">外部サイトへのアクセスなし</span></>
      : <>素材の解析はCloudflareで処理<span className="privacy-dot"> · </span><span className="privacy-part">外部AIへの送信なし</span><span className="privacy-separator"> / </span><span className="privacy-part">取得時は対象サイトへアクセスします</span></>}</p></div>
  </>;
}

function UrlForm({ busy, scanning, checking, paused, onDemo, onScan, inputRef: input }: EntryProps & UrlProps) {
  const [url, setUrl] = useState("");
  // After a refused submit, the help line says what is wrong and follows the input until it is fixed.
  const [tried, setTried] = useState(false);
  const value = url.trim();
  const problem = value === "" ? URL_EMPTY : isPageUrl(value) ? null : URL_INVALID;
  const showProblem = tried && problem !== null;
  // At work (the bot check or the scan), the button keeps its dark green and shows the spinner; it cannot be pressed
  // (aria-disabled, and submit() ignores it while busy). `disabled` would fade its words to about 3.3:1.
  const working = scanning || checking;
  // While paused, the help line shows only a problem with the address (the note above says why nothing is fetched).
  const showHelp = !paused || showProblem;
  const describedBy = [paused && "pause-note", showHelp && "url-help", "rights-note"].filter(Boolean).join(" ");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (problem !== null) {
      setTried(true);
      input.current?.focus();
      return;
    }
    setTried(false);
    onScan(value);
  }

  return <>
    {/* While paused: the pause in bold, what to do instead, and the demo's button, the main way into it on this screen.
        The words are read with the field too, so a keyboard user hears them before pressing the main button. */}
    {paused && <div className="pause-note">
      <Icon name="info" />
      <p id="pause-note"><strong className="phrased-sentence"><Phrased text={PAUSE_LEAD} pattern={PAUSE_LEAD_PHRASES} /></strong><span className="phrased-sentence"><Phrased text={PAUSE_NEXT} pattern={PAUSE_NEXT_PHRASES} /></span></p>
      <button className="button button-primary" type="button" disabled={busy} onClick={onDemo}>{DEMO_LABEL}<Icon name="arrow" /></button>
    </div>}
    <form className="scan-form" onSubmit={submit} noValidate>
      <label className="url-label" htmlFor="page-url">素材を集めたいページのURL</label>
      <div className="url-field"><Icon name="link" /><input ref={input} id="page-url" name="url" type="url" inputMode="url" autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder="例：https://example.com/gallery" value={url} onChange={event => setUrl(event.target.value)} disabled={busy} aria-invalid={showProblem} aria-describedby={describedBy} /></div>
      <p id="rights-note" className="rights-note"><Icon name="info" /><span><Sentences text={RIGHTS_NOTE} patterns={RIGHTS_NOTE_SENTENCES} /></span></p>
      {showHelp && <p id="url-help" className={`url-format-help${showProblem ? " is-invalid" : ""}`}>{showProblem ? problem : <Phrased text={URL_HELP} pattern={URL_HELP_PHRASES} />}</p>}
      <div className="scan-actions">
        {/* While paused it is outlined, so the demo in the note above is the card's one filled button: this one can still
            be pressed (the band then says why) but cannot do its job now (UI scoring of the paused screens, round 2). */}
        <button className={`button ${paused ? "button-outline" : "button-primary"} scan-button`} type="submit" disabled={busy && !working} aria-disabled={working || undefined}>{scanning
          ? <><span className="spinner" />素材を探しています</>
          : checking ? <><span className="spinner" />確認しています</>
          : <><span>素材を見つける</span><Icon name="arrow" /></>}</button>
      </div>
    </form>
    {!paused && <div className="entry-footer"><p><Phrased text={ENTRY_HINT} pattern={ENTRY_HINT_PHRASES} /></p><button className="demo-button" type="button" disabled={busy} onClick={onDemo}><span className="demo-spark" aria-hidden="true">✦</span>{DEMO_LABEL}<Icon name="arrow" /></button></div>}
  </>;
}

function DemoEntry({ busy, scanning, hasResult, paused, onDemo }: EntryProps & { readonly paused: boolean }) {
  return <>
    <div className="demo-entry">
      <div><h2>自作素材のサンプルコレクション</h2><p>画像・動画を選んで、実際のZIPファイルを保存できます。外部サイトにはアクセスしません。</p></div>
      {/* While the demo is prepared: the same as the scan button above (requestStart ignores a press during a scan). */}
      <button className="button button-primary" type="button" disabled={busy && !scanning} aria-disabled={scanning || undefined} onClick={onDemo}>{scanning
        ? <><span className="spinner" />素材を準備しています</>
        : <>{hasResult ? "デモをやり直す" : "デモを始める"}<Icon name="arrow" /></>}</button>
    </div>
    {/* The link stays while paused: /app then says the pause, with the demo as the way on. */}
    <p className="demo-next"><Link href="/app">自分のURLで使う<Icon name="arrow" /></Link><span>{paused ? <Phrased text={PAUSE_LEAD} pattern={PAUSE_LEAD_PHRASES} /> : DEMO_NEXT}</span></p>
  </>;
}

/** Before the first result: the three steps. */
export function HowItWorks({ demoOnly, paused }: { readonly demoOnly: boolean; readonly paused: boolean }) {
  // While page scans are paused, the first step is the demo's too: "paste a URL and press the button" would read as
  // if that worked now (UI scoring of the paused screens, round 2).
  const demoFirst = demoOnly || paused;
  return <section className="how-it-works" aria-label="PageCrateの使い方">
    <div className="how-step"><span className="step-number">01</span><div><h2>{demoFirst ? "デモ素材を開く" : "URLを入れる"}</h2><p>{demoOnly
      ? <>「デモを始める」を押すと、<br />自作のサンプルが一覧に。</>
      : paused ? <>「{DEMO_LABEL}」を押すと、<br />自作のサンプルが一覧に。</>
      : <>公開ページのURLを貼り付けて、<br />「素材を見つける」を押します。</>}</p></div></div>
    <div className="how-step"><span className="step-number">02</span><div><h2>必要なものを選ぶ</h2><p>プレビューで見比べながら、<br />気になる素材をピックアップ。</p></div></div>
    <div className="how-step"><span className="step-number">03</span><div><h2>出典ごと持ち帰る</h2><p>選んだ原本と取得元の記録を、<br />ひとつのZIPファイルに。</p></div></div>
  </section>;
}
