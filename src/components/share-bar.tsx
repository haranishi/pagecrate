"use client";

import { useId, useState, useSyncExternalStore } from "react";
import { Icon } from "@/components/icons";
import { SHARE_TEXT, SHARE_TITLE, shareLinks, shareTarget } from "@/lib/share-links";
import styles from "./share-bar.module.css";

const noSubscription = () => () => undefined;

/** The page's origin once in the browser; null while rendered on the server (no mismatch on hydration). */
function useOrigin(): string | null {
  return useSyncExternalStore(noSubscription, () => window.location.origin, () => null);
}

/** Whether the device has a share sheet. Decided after mount, so the server's markup and the first render agree. */
function useCanShare(): boolean {
  return useSyncExternalStore(noSubscription, () => typeof navigator.share === "function", () => false);
}

type Result = "" | "copied" | "copy-failed" | "share-failed";
const RESULT_TEXT: Readonly<Record<Result, string>> = {
  "": "",
  copied: "リンクをコピーしました。",
  "copy-failed": "コピーできませんでした。ブラウザーのアドレス欄から、URLをコピーしてください。",
  "share-failed": "端末の共有を開けませんでした。リンクのコピーを使ってください。",
};

/**
 * Four ways to pass PageCrate on: X, LINE, the device's share sheet (only where there is one) and copying the link.
 * The X and LINE buttons are plain links that open those services in a new tab when pressed; nothing is loaded from
 * them before that, and nothing goes to the operator.
 */
export function ShareBar({ className }: { readonly className?: string }) {
  const origin = useOrigin();
  const canShare = useCanShare();
  const [result, setResult] = useState<Result>("");
  const id = useId();
  const url = origin === null ? null : shareTarget(origin);
  const links = url === null ? null : shareLinks(url);

  async function copy() {
    if (url === null) return;
    try {
      await navigator.clipboard.writeText(url);
      setResult("copied");
    } catch {
      setResult("copy-failed");
    }
  }

  async function share() {
    if (url === null) return;
    setResult("");
    try {
      await navigator.share({ title: SHARE_TITLE, text: SHARE_TEXT, url });
    } catch (error) {
      // Closing the sheet is not a failure.
      if (!(error instanceof DOMException && error.name === "AbortError")) setResult("share-failed");
    }
  }

  return <section className={`${styles.share}${className ? ` ${className}` : ""}`} aria-labelledby={`${id}-title`}>
    <h2 id={`${id}-title`} className={styles.title}>PageCrate を共有する</h2>
    <ul className={styles.actions}>
      <li><a className={styles.action} href={links?.x} target="_blank" rel="noopener noreferrer">X で共有<Icon name="external" /><span className="sr-only">（新しいタブで開きます）</span></a></li>
      <li><a className={styles.action} href={links?.line} target="_blank" rel="noopener noreferrer">LINE で送る<Icon name="external" /><span className="sr-only">（新しいタブで開きます）</span></a></li>
      {canShare && <li><button className={styles.action} type="button" onClick={() => void share()}>端末の共有</button></li>}
      <li><button className={styles.action} type="button" onClick={() => void copy()}><Icon name="link" />リンクをコピー</button></li>
    </ul>
    {/* Only what this browser can do: without a share sheet, copying the link is the one way left. */}
    <p className={styles.note}>{canShare ? "Instagram や YouTube には、端末の共有かリンクのコピーを使ってください。" : "Instagram や YouTube には、リンクのコピーを使ってください。"}</p>
    <p className={styles.result} role="status">{RESULT_TEXT[result]}</p>
  </section>;
}
