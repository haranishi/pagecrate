"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Phrased } from "@/components/phrased";
import { POLICY_VERSION } from "@/lib/policy";
import { createPolicyAckSession, type PolicyAckSession } from "@/lib/policy-ack";
import { POLICY_LIMITS, POLICY_SUMMARY } from "@/lib/policy-content";
import { patternFor } from "@/lib/phrase-breaks";
import styles from "./policy-gate.module.css";

let visitSession: PolicyAckSession | null = null;

/** The check's memory for this page load (the "visit" of policy-ack.ts). Browser only. */
function policyAckSession(): PolicyAckSession {
  visitSession ??= createPolicyAckSession({ version: POLICY_VERSION, storage: () => window.localStorage });
  return visitSession;
}

/** Call when a scan or the demo is about to start: true means open the PolicyGate first. Never call it during render. */
export function needsPolicyAck(): boolean {
  return typeof window === "undefined" || policyAckSession().needsAck();
}

export interface PolicyGateProps {
  /** Opens the check. Open it when needsPolicyAck() is true at the moment a scan or the demo starts. */
  open: boolean;
  /** "進む": the confirmation is already recorded (device, or this visit). Set open to false and start what was asked. */
  onProceed: () => void;
  /** "やめる" or Esc: set open to false; nothing starts. */
  onCancel: () => void;
}

const FOCUSABLE = "a[href], button:not(:disabled), input:not(:disabled)";

/**
 * Where each line of the summary may wrap ("|" between phrases), so a phone never splits a word or leaves a lone
 * character on a line. The words are POLICY_SUMMARY's own; a line that changes is shown whole until this is updated.
 */
const SUMMARY_PHRASES: readonly string[] = [
  "入力した|URLと|ページの|内容は、|Cloudflare の|設備で|処理します。|運営者は|保存しません。",
  `ログインは|なく、|氏名や|メールアドレスも|集めません。|候補の|一覧は|${POLICY_LIMITS.ticketMinutes}分で|使えなく|なります。`,
  "使いすぎを|防ぐため、|接続元を|日替わりの|鍵で|縮めた|値を、|短い|時間だけ|使います。|運営者は|その値を|保存しません。",
  "解析を|始めるときは、|ボット確認|（Cloudflare Turnstile）の|ために、|ブラウザーが |Cloudflare と|通信します。|このとき、|接続元|（IPアドレス）などが |Cloudflare に|渡ります。",
  "PageCrate で|取得できても、|素材を|使って|よいという|許可（許諾）には|なりません。|素材を|使う前に、|権利者の|許諾と、|対象の|サイトの|利用規約を|確かめてください。",
  "この確認は、|この端末の|中だけに|残します。|運営者には|送りません。",
];

/**
 * The privacy policy check shown before the first start (requirement 2.1). A modal dialog: the page behind it is
 * inert, Tab stays inside, Esc is "やめる". It sends nothing anywhere; the confirmation stays on the device.
 */
export function PolicyGate({ open, onProceed, onCancel }: PolicyGateProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  /** The part fixed at the bottom: the checkbox, its note and the buttons. */
  const fixed = useRef<HTMLDivElement>(null);
  const isOpen = useRef(open);
  const handlers = useRef({ onProceed, onCancel });
  const [read, setRead] = useState(false);
  /** The body has more below what is in sight: the row of buttons shows a shadow over it. */
  const [moreBelow, setMoreBelow] = useState(false);
  const id = useId();
  const titleId = `${id}-title`, introId = `${id}-intro`, helpId = `${id}-help`;

  useEffect(() => { handlers.current = { onProceed, onCancel }; }, [onProceed, onCancel]);

  useEffect(() => {
    const element = dialog.current;
    isOpen.current = open;
    if (!element) return;
    if (open && !element.open) {
      element.showModal();
      heading.current?.focus();
    } else if (!open && element.open) {
      element.close();
    }
  }, [open]);

  useEffect(() => {
    const element = dialog.current;
    // Closing on unmount lets the browser give focus back to the button that opened the check.
    return () => { if (element?.open) element.close(); };
  }, []);

  // On a short screen the body scrolls under the fixed part (the checkbox, its note and the buttons), which stays at the
  // bottom of the dialog: the required step is never hidden (UI scoring round 2). The fixed part's height becomes the
  // dialog's scroll padding, so a link reached with Tab is scrolled clear of it.
  useEffect(() => {
    const element = dialog.current;
    const footer = fixed.current;
    if (!open || !element) return;
    const update = () => {
      setMoreBelow(element.scrollHeight - element.scrollTop - element.clientHeight > 1);
      if (footer) element.style.setProperty("--gate-fixed-height", `${Math.ceil(footer.getBoundingClientRect().height)}px`);
    };
    update();
    element.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    const resized = typeof ResizeObserver === "function" ? new ResizeObserver(update) : null;
    resized?.observe(element);
    if (footer) resized?.observe(footer);
    return () => {
      element.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      resized?.disconnect();
    };
  }, [open]);

  function cancel() {
    setRead(false);
    handlers.current.onCancel();
  }

  function proceed() {
    if (!read) return;
    policyAckSession().acknowledge();
    setRead(false);
    handlers.current.onProceed();
  }

  function keepFocusInside(event: KeyboardEvent<HTMLDialogElement>) {
    const element = dialog.current;
    if (event.key !== "Tab" || !element) return;
    const items = [...element.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === heading.current || !element.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !element.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  }

  return <dialog ref={dialog} className={styles.dialog} aria-labelledby={titleId} aria-describedby={introId}
    onCancel={event => { event.preventDefault(); cancel(); }}
    // The browser can close the dialog by itself (a repeated Esc). While the parent still wants it open, that is "やめる".
    onClose={() => { if (isOpen.current && !dialog.current?.open) cancel(); }}
    onKeyDown={keepFocusInside}>
    <h2 id={titleId} ref={heading} tabIndex={-1} className={styles.title}>使う前に、プライバシーポリシーをお読みください</h2>
    <p id={introId} className={styles.intro}>はじめて解析やデモを始める前と、ポリシーが変わったあとに、一度だけ確認をお願いしています。</p>
    <ul className={styles.summary}>{POLICY_SUMMARY.map(line => <li key={line}><Phrased text={line} pattern={patternFor(line, SUMMARY_PHRASES)} /></li>)}</ul>
    <a className={styles.fullText} href="/privacy" target="_blank" rel="noopener">プライバシーポリシーの全文を読む<span className={styles.newTab}>（新しいタブで開きます）</span></a>
    <p className={styles.version}>文書版 {POLICY_VERSION}</p>
    <div ref={fixed} className={`${styles.fixed}${moreBelow ? ` ${styles.moreBelow}` : ""}`}>
      <label className={styles.check}>
        <input type="checkbox" checked={read} onChange={event => setRead(event.target.checked)} aria-describedby={helpId} />
        <span>プライバシーポリシーを読みました</span>
      </label>
      <p id={helpId} className={styles.help}>チェックを入れると「進む」を押せます。</p>
      <div className={styles.actions}>
        <button className="button button-outline" type="button" onClick={cancel}>やめる</button>
        <button className="button button-primary" type="button" disabled={!read} onClick={proceed}>進む</button>
      </div>
    </div>
  </dialog>;
}
