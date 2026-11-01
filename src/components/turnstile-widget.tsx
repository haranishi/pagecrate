"use client";

import { useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { Icon } from "@/components/icons";
import {
  INITIAL_TURNSTILE_STATE, TURNSTILE_SCRIPT_URL, TURNSTILE_WIDGET_ACTION, turnstileStep,
  type TurnstileEvent, type TurnstileState, type TurnstileStatus,
} from "@/lib/turnstile-client";

/** The part of Cloudflare's browser API this widget uses (explicit rendering). */
interface TurnstileRenderOptions {
  sitekey: string;
  action: string;
  theme: "light";
  size: "flexible";
  /** The token is refreshed on demand (the next take), so an idle page makes no further requests. */
  "refresh-expired": "never";
  /** The token goes to the page through takeToken, not through a hidden form field. */
  "response-field": false;
  callback: (token: string) => void;
  "expired-callback": () => void;
  "error-callback": () => boolean;
  "unsupported-callback": () => void;
}
interface TurnstileApi {
  render(container: HTMLElement, options: TurnstileRenderOptions): string | null | undefined;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
}

let scriptLoad: Promise<TurnstileApi> | null = null;

function browserTurnstile(): TurnstileApi | null {
  const api = (window as Window & { turnstile?: Partial<TurnstileApi> }).turnstile;
  return api && typeof api.render === "function" && typeof api.reset === "function" && typeof api.remove === "function" ? api as TurnstileApi : null;
}

/** Adds Cloudflare's script once per page. A failed load is forgotten, so a later attempt adds the script again. */
function loadTurnstile(): Promise<TurnstileApi> {
  const ready = browserTurnstile();
  if (ready) return Promise.resolve(ready);
  scriptLoad ??= new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement("script");
    const fail = () => { script.remove(); scriptLoad = null; reject(new Error("bot check unavailable")); };
    script.src = TURNSTILE_SCRIPT_URL;
    script.async = true;
    script.addEventListener("load", () => { const api = browserTurnstile(); if (api) resolve(api); else fail(); }, { once: true });
    script.addEventListener("error", fail, { once: true });
    document.head.appendChild(script);
  });
  return scriptLoad;
}

export interface TurnstileWidgetHandle {
  /** A fresh, unused token for one scan request, or null. After null, wait for the status "ready" and take again. */
  takeToken(): string | null;
  /** Starts the check again after an error (the "もう一度確認する" of a screen that shows its own messages). */
  retry(): void;
}

export interface TurnstileWidgetProps {
  /** Public site key (not a secret). The server passes it; the widget loads nothing while it is empty. */
  siteKey: string;
  /** Called when the status changes. It starts as "loading"; "ready" means takeToken will return a token. */
  onStatusChange?: (status: TurnstileStatus) => void;
  /** False when the page shows the check's progress and errors itself (the workspace's status band does). */
  messages?: boolean;
  ref?: Ref<TurnstileWidgetHandle>;
}

/**
 * The bot check. Mount it only when a scan starts: mounting is what loads Cloudflare's script. The token rules
 * (300 seconds, one use, fetch again after expiry, use or error) are in lib/turnstile-client.ts.
 */
export function TurnstileWidget({ siteKey, onStatusChange, messages = true, ref }: TurnstileWidgetProps) {
  const container = useRef<HTMLDivElement>(null);
  const api = useRef<TurnstileApi | null>(null);
  const widgetId = useRef<string | null>(null);
  const tokenState = useRef<TurnstileState>(INITIAL_TURNSTILE_STATE);
  const statusListener = useRef(onStatusChange);
  const [status, setStatus] = useState<TurnstileStatus>("loading");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const configured = siteKey.trim() !== "";

  useEffect(() => { statusListener.current = onStatusChange; }, [onStatusChange]);

  const apply = useCallback((event: TurnstileEvent): string | null => {
    const next = turnstileStep(tokenState.current, event);
    const changed = next.state.status !== tokenState.current.status;
    tokenState.current = next.state;
    if (next.reset) {
      let restarted = false;
      if (api.current && widgetId.current) {
        try { api.current.reset(widgetId.current); restarted = true; } catch { /* Draw the widget again below. */ }
      }
      if (!restarted) setLoadAttempt(attempt => attempt + 1); // The script or the widget is not up: start over.
    }
    if (changed) {
      setStatus(next.state.status);
      statusListener.current?.(next.state.status);
    }
    return next.taken;
  }, []);

  useImperativeHandle(ref, () => ({
    takeToken: () => apply({ type: "take", at: performance.now() }),
    retry: () => { apply({ type: "retry" }); },
  }), [apply]);

  useEffect(() => {
    if (!configured) {
      statusListener.current?.("error");
      return;
    }
    let active = true;
    loadTurnstile().then(turnstile => {
      const element = container.current;
      if (!active || !element) return;
      api.current = turnstile;
      try {
        widgetId.current = turnstile.render(element, {
          sitekey: siteKey.trim(), action: TURNSTILE_WIDGET_ACTION, theme: "light", size: "flexible",
          "refresh-expired": "never", "response-field": false,
          callback: token => { apply({ type: "issued", value: token, at: performance.now() }); },
          "expired-callback": () => { apply({ type: "expired" }); },
          // Handled here: the person sees the message below and can try again.
          "error-callback": () => { apply({ type: "failed" }); return true; },
          "unsupported-callback": () => { apply({ type: "failed" }); },
        }) || null;
      } catch {
        widgetId.current = null;
      }
      apply(widgetId.current ? { type: "rendered" } : { type: "failed" });
    }, () => { if (active) apply({ type: "failed" }); });
    return () => {
      active = false;
      const id = widgetId.current;
      widgetId.current = null;
      tokenState.current = INITIAL_TURNSTILE_STATE;
      if (id && api.current) {
        try { api.current.remove(id); } catch { /* The widget is already gone. */ }
      }
    };
  }, [configured, siteKey, loadAttempt, apply]);

  return <div>
    <div ref={container} />
    {!messages ? null : !configured ? <div className="message-box error-box" role="alert"><Icon name="warning" /><div><strong>ボット確認を準備できません</strong><p>いまは実際のページを解析できません。デモは使えます。</p></div></div>
      : status === "error" && <div className="message-box error-box" role="alert"><Icon name="warning" /><div><strong>ボット確認を完了できませんでした</strong><p>接続を確かめてから、もう一度お試しください。</p></div><button className="button button-small button-outline" type="button" onClick={() => apply({ type: "retry" })}><Icon name="refresh" />もう一度確認する</button></div>}
  </div>;
}
