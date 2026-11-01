"use client";

/* The preview is a blob: URL of an image from this app's own preview route, shown with a plain <img>. */
/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Icon } from "@/components/icons";
import { IDLE_PREVIEW, type PreviewStore, type PreviewView } from "@/lib/preview-store";

/** A small margin: previews are asked for when the card is on screen or just about to be (design-ux.md). */
const NEAR_SCREEN = "120px 0px";
const ENDED: Readonly<Record<"expired" | "unsupported" | "failed", string>> = {
  expired: "期限切れのため表示できません",
  unsupported: "プレビューできません",
  failed: "読み込めませんでした",
};

/** One card's preview. The card asks while it is on screen; the store and its queue decide when it is fetched. */
export function AssetPreview({ store, path, name }: { store: PreviewStore; path: string; name: string }) {
  const frame = useRef<HTMLDivElement>(null);
  const subscribe = useCallback((listener: () => void) => store.subscribe(path, listener), [store, path]);
  const view = useSyncExternalStore(subscribe, () => store.get(path), () => IDLE_PREVIEW);
  const [shown, setShown] = useState<string | null>(null);
  const [broken, setBroken] = useState<string | null>(null);

  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    if (typeof IntersectionObserver !== "function") {
      store.show(path);
      return () => store.release(path);
    }
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.isIntersecting) store.show(path);
        else store.hide(path);
      }
    }, { rootMargin: NEAR_SCREEN });
    observer.observe(element);
    return () => {
      observer.disconnect();
      store.release(path);
    };
  }, [store, path]);

  return <div ref={frame} className="preview-frame" data-preview={view.kind}>{frameContent(view, name, shown, broken, setShown, setBroken)}</div>;
}

function frameContent(view: PreviewView, name: string, shown: string | null, broken: string | null, setShown: (src: string) => void, setBroken: (src: string) => void) {
  if (view.kind === "loaded" && view.src !== broken) {
    return <>
      {shown !== view.src && <Waiting />}
      <img className={`preview-image${shown === view.src ? " is-loaded" : ""}`} src={view.src} alt={`${name} のプレビュー`} decoding="async" onLoad={() => setShown(view.src)} onError={() => setBroken(view.src)} />
    </>;
  }
  // Not asked for yet: the card is off screen, so nothing is loading. "読み込み中" means a request waits or runs.
  if (view.kind === "idle") return <div className="preview-placeholder" aria-hidden="true"><Icon name="image" /></div>;
  if (view.kind === "loading") return <Waiting />;
  const end = view.kind === "loaded" ? "failed" : view.kind;
  return <div className="preview-placeholder preview-ended"><Icon name={end === "expired" ? "info" : "image"} /><span>{ENDED[end]}</span></div>;
}

function Waiting() {
  return <div className="preview-placeholder" aria-hidden="true"><span className="spinner preview-spinner" /><span>読み込み中</span></div>;
}
