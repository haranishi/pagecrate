/**
 * Previews of one scan result, for the cards on screen. A card asks while it is visible and lets go when it leaves:
 * a request that has not started is dropped (and queued again when the card comes back), and an unmounted card
 * drops its request even if it has started. A loaded preview keeps its object URL so a card that remounts (after a
 * filter change) does not fetch again; reset() revokes them all when the result is replaced or the screen is left.
 * Pure apart from the injected URL functions, so node tests can drive it with a fake queue clock.
 */
import { createPreviewQueue, type PreviewEnd, type PreviewFetcher, type PreviewQueue, type PreviewQueueOptions, type PreviewRequest } from "./preview-queue";

export type PreviewView =
  /** Not asked for yet (off screen). */
  | { readonly kind: "idle" }
  /** Waiting for a slot, being fetched, or waiting to be retried. */
  | { readonly kind: "loading" }
  | { readonly kind: "loaded"; readonly src: string }
  | { readonly kind: PreviewEnd };

export const IDLE_PREVIEW: PreviewView = Object.freeze({ kind: "idle" });
const LOADING: PreviewView = Object.freeze({ kind: "loading" });
const ENDS: Readonly<Record<PreviewEnd, PreviewView>> = {
  expired: Object.freeze({ kind: "expired" }),
  unsupported: Object.freeze({ kind: "unsupported" }),
  failed: Object.freeze({ kind: "failed" }),
};

export interface PreviewStore {
  /** The same object until the view changes (for useSyncExternalStore). */
  get(path: string): PreviewView;
  subscribe(path: string, listener: () => void): () => void;
  /** The card is on screen: queue its preview unless it has one or has an answer. */
  show(path: string): void;
  /** The card left the screen: drop its request if it has not started. */
  hide(path: string): void;
  /** The card is gone: drop its request, started or not. */
  release(path: string): void;
  /** The result has expired: nothing new is fetched. Loaded previews stay. */
  expire(): void;
  /** Drops every request, revokes every object URL and starts over. Safe to use again afterwards (React remounts). */
  reset(): void;
}

export interface PreviewStoreOptions<T> {
  readonly expiresAtMs: number;
  readonly fetchPreview: PreviewFetcher<T>;
  readonly createUrl: (value: T) => string;
  readonly revokeUrl: (url: string) => void;
  /** Runs when a preview answer or the clock shows that the result has expired. */
  readonly onExpired?: () => void;
  /** Passed to the queue: a 429 makes previews wait until this time; null when they start again. */
  readonly onRateLimitWait?: (untilMs: number | null) => void;
  readonly queue?: Pick<PreviewQueueOptions<T>, "now" | "setTimer" | "clearTimer" | "maxConcurrent" | "maxAttempts">;
}

interface Entry {
  view: PreviewView;
  request: PreviewRequest | null;
  readonly listeners: Set<() => void>;
}

export function createPreviewStore<T>(options: PreviewStoreOptions<T>): PreviewStore {
  const entries = new Map<string, Entry>();
  let queue: PreviewQueue<T> | null = null;
  let expired = false;

  function currentQueue(): PreviewQueue<T> {
    queue ??= createPreviewQueue<T>({
      ...options.queue,
      fetchPreview: options.fetchPreview,
      expiresAtMs: options.expiresAtMs,
      onExpired: () => { expired = true; options.onExpired?.(); },
      ...(options.onRateLimitWait ? { onRateLimitWait: options.onRateLimitWait } : {}),
    });
    return queue;
  }

  function entry(path: string): Entry {
    let found = entries.get(path);
    if (!found) {
      found = { view: IDLE_PREVIEW, request: null, listeners: new Set() };
      entries.set(path, found);
    }
    return found;
  }

  function setView(target: Entry, view: PreviewView) {
    if (target.view === view) return;
    target.view = view;
    for (const listener of [...target.listeners]) listener();
  }

  function drop(path: string, startedToo: boolean) {
    const target = entries.get(path);
    if (!target?.request || (!startedToo && !target.request.waiting)) return;
    target.request.cancel();
    target.request = null;
    setView(target, IDLE_PREVIEW);
  }

  return {
    get: path => entries.get(path)?.view ?? IDLE_PREVIEW,
    subscribe(path, listener) {
      const target = entry(path);
      target.listeners.add(listener);
      return () => { target.listeners.delete(listener); };
    },
    show(path) {
      const target = entry(path);
      if (target.view !== IDLE_PREVIEW) return;
      if (expired) { setView(target, ENDS.expired); return; }
      setView(target, LOADING);
      const request = currentQueue().request(path, outcome => {
        target.request = null;
        setView(target, outcome.kind === "loaded" ? { kind: "loaded", src: options.createUrl(outcome.value) } : ENDS[outcome.kind]);
      });
      // The queue answers at once when the result has already expired; keep only a request that is still open.
      if (target.view === LOADING) target.request = request;
    },
    hide: path => drop(path, false),
    release: path => drop(path, true),
    expire() {
      expired = true;
      queue?.expire();
    },
    reset() {
      queue?.close();
      queue = null;
      expired = false;
      for (const target of entries.values()) {
        target.request = null;
        if (target.view.kind === "loaded") options.revokeUrl(target.view.src);
        setView(target, IDLE_PREVIEW);
      }
    },
  };
}
