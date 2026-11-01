/**
 * Stateless asset tickets: base64url(JSON claims) + "." + base64url(HMAC-SHA256 over the first segment).
 * Nothing is stored server-side. A ticket stays valid until `e` (30 minutes after issue), and rotating
 * PAGECRATE_TICKET_SECRET invalidates every outstanding ticket. Results carry codes only, never the ticket or key.
 */
export const TICKET_TTL_SECONDS = 1800;
export const TICKET_URL_MAX_CHARS = 4096;
export const TICKET_SECRET_MIN_BYTES = 32;
/** Tolerated clock difference between the issuing and the verifying isolate. */
const CLOCK_SKEW_SECONDS = 60;
// Worst case: every URL character JSON-escaped to two, an origin no longer than a URL, fixed fields under 128.
const MAX_TICKET_CHARS = Math.ceil((TICKET_URL_MAX_CHARS * 3 + 128) / 3) * 4 + 1 + 43;

export type TicketKind = "image" | "video";
export interface TicketClaims {
  readonly v: 1;
  /** Asset URL: canonical http(s), at most 4,096 characters, without credentials. */
  readonly u: string;
  readonly k: TicketKind;
  /** Origin of the scanned page. */
  readonly o: string;
  /** Demo asset: served from built-in bytes, never fetched. */
  readonly d: boolean;
  /** Expiry in Unix seconds. */
  readonly e: number;
}
export interface TicketInput { readonly url: string; readonly kind: TicketKind; readonly pageOrigin: string; readonly demo: boolean }
export type TicketIssueResult =
  | { readonly ok: true; readonly ticket: string; readonly claims: TicketClaims }
  | { readonly ok: false; readonly code: "INVALID_INPUT" };
export type TicketVerifyResult =
  | { readonly ok: true; readonly claims: TicketClaims }
  | { readonly ok: false; readonly code: "INVALID_TICKET" | "EXPIRED" };
export interface TicketCodec {
  issue(input: TicketInput): Promise<TicketIssueResult>;
  /** `kinds` lists the asset kinds the calling route accepts (the preview takes images only). */
  verify(ticket: unknown, kinds?: readonly TicketKind[]): Promise<TicketVerifyResult>;
}
export type TicketCodecResult =
  | { readonly ok: true; readonly codec: TicketCodec }
  | { readonly ok: false; readonly code: "TICKET_KEY_INVALID" };

const encoder = new TextEncoder();
const KINDS: readonly TicketKind[] = ["image", "video"];
const CLAIM_KEYS = "d,e,k,o,u,v";
const INVALID = Object.freeze({ ok: false, code: "INVALID_TICKET" } as const);

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Strict decoding: base64url alphabet without padding, canonical form only. */
function fromBase64Url(text: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]+$/.test(text) || text.length % 4 === 1) return null;
  let binary: string;
  try { binary = atob(text.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (text.length % 4)) % 4)); } catch { return null; }
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
  return toBase64Url(bytes) === text ? bytes : null;
}

function isAssetUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > TICKET_URL_MAX_CHARS) return false;
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password && url.href === value;
  } catch { return false; }
}

function isPageOrigin(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > TICKET_URL_MAX_CHARS) return false;
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && url.origin === value;
  } catch { return false; }
}

function isKind(value: unknown): value is TicketKind {
  return value === "image" || value === "video";
}

function parseClaims(value: unknown): TicketClaims | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).sort().join() !== CLAIM_KEYS) return null;
  const { v, u, k, o, d, e } = record;
  if (v !== 1 || !isAssetUrl(u) || !isKind(k) || !isPageOrigin(o) || typeof d !== "boolean") return null;
  if (typeof e !== "number" || !Number.isSafeInteger(e) || e <= 0) return null;
  return { v, u, k, o, d, e };
}

/** Builds the signer/verifier. The key must be at least 32 bytes (UTF-8); a shorter key is a configuration error. */
export async function createTicketCodec(secret: string | undefined, options: { readonly now?: () => number } = {}): Promise<TicketCodecResult> {
  const raw = typeof secret === "string" ? encoder.encode(secret) : null;
  if (raw === null || raw.byteLength < TICKET_SECRET_MIN_BYTES) return { ok: false, code: "TICKET_KEY_INVALID" };
  let key: CryptoKey;
  try { key = await crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]); }
  catch { return { ok: false, code: "TICKET_KEY_INVALID" }; }
  const now = options.now ?? Date.now;
  const seconds = () => Math.floor(now() / 1000);
  return {
    ok: true,
    codec: {
      async issue(input) {
        if (!isAssetUrl(input.url) || !isKind(input.kind) || !isPageOrigin(input.pageOrigin) || typeof input.demo !== "boolean") return { ok: false, code: "INVALID_INPUT" };
        const claims: TicketClaims = { v: 1, u: input.url, k: input.kind, o: input.pageOrigin, d: input.demo, e: seconds() + TICKET_TTL_SECONDS };
        const body = toBase64Url(encoder.encode(JSON.stringify(claims)));
        const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(body)));
        return { ok: true, ticket: `${body}.${toBase64Url(mac)}`, claims };
      },
      async verify(ticket, kinds = KINDS) {
        if (typeof ticket !== "string" || ticket.length > MAX_TICKET_CHARS) return INVALID;
        const parts = ticket.split(".");
        if (parts.length !== 2) return INVALID;
        const [body, mac] = parts;
        const signature = fromBase64Url(mac);
        const payload = fromBase64Url(body);
        if (!signature || !payload) return INVALID;
        // WebCrypto compares in constant time; nothing inside the claims is trusted before this check.
        if (!await crypto.subtle.verify("HMAC", key, signature, encoder.encode(body))) return INVALID;
        let claims: TicketClaims | null;
        try { claims = parseClaims(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(payload))); } catch { return INVALID; }
        if (!claims || !kinds.includes(claims.k)) return INVALID;
        const current = seconds();
        if (claims.e > current + TICKET_TTL_SECONDS + CLOCK_SKEW_SECONDS) return INVALID;
        if (current >= claims.e) return { ok: false, code: "EXPIRED" };
        return { ok: true, claims };
      },
    },
  };
}
