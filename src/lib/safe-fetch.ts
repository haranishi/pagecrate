import { AppError } from "./errors";
import { ipFamily, isPublicAddress, nonPublicReason, parseHttpUrl } from "./url-policy";

export { isPublicAddress } from "./url-policy";
export const MAX_ASSET_BYTES = 25 * 1024 * 1024;
export type Address = { address: string; family: number };
export type Resolver = (hostname: string, signal?: AbortSignal) => Promise<Address[]>;
export type SafeResponse = { status: number; headers: Record<string, string>; body: Buffer; url: string };
export type FetchOptions = {
  maxBytes?: number; timeoutMs?: number; redirects?: number; method?: "GET" | "HEAD"; signal?: AbortSignal; onBytes?: (bytes: number) => void;
  /** Operator blocklist, asked about the first URL and every redirect target before any DNS lookup or connection. */
  isBlockedHost?: (host: string) => boolean;
};
export type SafeTransport = (url: URL, address: Address, options: FetchOptions) => Promise<SafeResponse>;
const aborted = () => new AppError("ABORTED", "解析の制限時間に達しました。", 408);
const bodyLimit = () => new AppError("BODY_LIMIT", "素材が取得サイズの上限を超えています。", 413);

// The predicate gets a lowercase host without IPv6 brackets or trailing dots. A predicate that throws or does not
// answer false blocks the host: the operator's refusal must not depend on the predicate behaving.
function assertHostAllowed(url: URL, isBlockedHost: FetchOptions["isBlockedHost"]): void {
  if (!isBlockedHost) return;
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase().replace(/\.+$/, "");
  let blocked = true;
  try { blocked = isBlockedHost(host) !== false; } catch { blocked = true; }
  if (blocked) throw new AppError("BLOCKED_HOST", "このサイトは、運営者の設定により取得できません。", 403);
}

const INVALID_URL_MESSAGES = {
  TOO_LONG: "URLは4,096文字以内で入力してください。",
  NOT_A_URL: "https:// から始まるページのURLを入力してください。",
  NOT_HTTP: "認証情報を含まないHTTP / HTTPSのURLを入力してください。",
} as const;

// The syntax rules live in url-policy.ts, shared with the guard; DNS-based public checks stay here (resolvePublic).
export function validateUrl(input: string): URL {
  const parsed = parseHttpUrl(input);
  if (!parsed.ok) throw new AppError("INVALID_URL", INVALID_URL_MESSAGES[parsed.reason]);
  const { url } = parsed;
  const reason = nonPublicReason(url);
  if (reason === "PORT") throw new AppError("UNSAFE_URL", "標準ポートの公開Webページだけ取得できます。");
  if (reason !== null) throw new AppError("UNSAFE_URL", "ローカル・内部ネットワークのURLは取得できません。公開ページを指定してください。");
  url.hash = "";
  return url;
}

// global_fetch_strictly_public is for sending requests to the account's own zones out through the public Internet
// path. Whether it also refuses internal addresses at connection time is not described in the official documentation
// and is unconfirmed. The main defences are the syntax checks and the DoH precheck. How connection-time refusal holds
// up, including against a DNS answer that changes between the precheck and the connection, is to be confirmed on a
// Worker separate from production, before page scans are opened (README.md, docs/operations.md).
// Never silently fall back to Node's unrestricted global fetch().
export function assertWorkersRuntime(): void {
  if (typeof navigator === "undefined" || navigator.userAgent !== "Cloudflare-Workers") {
    throw new AppError("EXTRACTION_RUNTIME", "外部ページの解析はCloudflare Workers環境で利用できます。内蔵デモはこのまま試せます。", 503);
  }
  if (typeof Cloudflare === "undefined" || Cloudflare.compatibilityFlags.global_fetch_strictly_public !== true) {
    throw new AppError("EXTRACTION_GUARD", "公開ネットワークだけに接続する安全設定を確認できないため取得を停止しました。", 503);
  }
}

// fetch() exposes decoded chunks: enforce limits while reading, not after an
// unbounded arrayBuffer()/decompression. Cancel on header/budget/abort failures.
export async function readBoundedBody(response: Response, maxBytes: number, onBytes?: (bytes: number) => void, signal?: AbortSignal): Promise<Buffer> {
  const reader = response.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks: Buffer[] = [];
  let size = 0, finished = false;
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal?.addEventListener("abort", cancel, { once: true });
  try {
    if (signal?.aborted) throw aborted();
    if (Number(response.headers.get("content-length")) > maxBytes) throw bodyLimit();
    while (true) {
      const { done, value } = await reader.read();
      if (signal?.aborted) throw aborted();
      if (done) break;
      onBytes?.(value.byteLength);
      size += value.byteLength;
      if (size > maxBytes) throw bodyLimit();
      chunks.push(Buffer.from(value.buffer, value.byteOffset, value.byteLength));
    }
    finished = true;
    return Buffer.concat(chunks, size);
  } finally {
    signal?.removeEventListener("abort", cancel);
    if (!finished) await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }

// Fixed public DoH endpoint, never a caller-selected resolver. Request-scoped
// caching is an optimization, NOT a claim to pin global fetch's actual socket.
export function createDohResolver(fetchImpl: typeof fetch): Resolver {
  const cache = new Map<string, Promise<Address[]>>();
  return (hostname, signal) => {
    const previous = cache.get(hostname);
    if (previous) return previous;
    const controller = new AbortController();
    const cancel = () => controller.abort();
    signal?.addEventListener("abort", cancel, { once: true });
    if (signal?.aborted) controller.abort();
    const query = async (type: "A" | "AAAA"): Promise<Address[]> => {
      const url = new URL("https://cloudflare-dns.com/dns-query");
      url.searchParams.set("name", hostname); url.searchParams.set("type", type);
      const response = await fetchImpl(url, { method: "GET", redirect: "manual", credentials: "omit", cache: "no-store", signal: controller.signal, headers: { Accept: "application/dns-json" } });
      if (response.status !== 200 || !response.headers.get("content-type")?.includes("application/dns-json")) {
        await response.body?.cancel(); throw new AppError("DNS_FAILED", "接続先を安全に確認できませんでした。", 502);
      }
      const data: unknown = JSON.parse((await readBoundedBody(response, 16 * 1024, undefined, controller.signal)).toString("utf8"));
      if (!record(data) || data.Status !== 0 || (data.Answer !== undefined && !Array.isArray(data.Answer))) throw new AppError("DNS_FAILED", "接続先が見つかりません。URLを確認してください。", 502);
      const answers: unknown[] = Array.isArray(data.Answer) ? data.Answer : [];
      const addresses: Address[] = [];
      for (const answer of answers) {
        if (!record(answer) || typeof answer.type !== "number" || typeof answer.data !== "string") throw new AppError("DNS_FAILED", "接続先を安全に確認できませんでした。", 502);
        if (answer.type !== 1 && answer.type !== 28) continue;
        const family = ipFamily(answer.data);
        if (family !== (answer.type === 1 ? 4 : 6)) throw new AppError("DNS_FAILED", "接続先を安全に確認できませんでした。", 502);
        addresses.push({ address: answer.data, family });
      }
      return addresses;
    };
    const result = Promise.all([query("A"), query("AAAA")]).then(groups => groups.flat()).finally(() => { controller.abort(); signal?.removeEventListener("abort", cancel); });
    if (cache.size < 128) cache.set(hostname, result);
    return result;
  };
}

export async function resolvePublic(url: URL, resolver: Resolver, signal?: AbortSignal): Promise<Address> {
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal?.addEventListener("abort", cancel, { once: true });
  const timer = setTimeout(cancel, 4000);
  try {
    if (signal?.aborted) throw aborted();
    const addresses = ipFamily(hostname) ? [{ address: hostname, family: ipFamily(hostname) }] : await resolver(hostname, controller.signal);
    if (controller.signal.aborted) throw new AppError("DNS_TIMEOUT", "接続先の確認が時間切れになりました。再試行してください。", 504);
    if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) throw new AppError("UNSAFE_URL", "接続先に内部ネットワークのアドレスが含まれるため取得できません。");
    return addresses.find(({ family }) => family === 4) ?? addresses[0];
  } catch (error) {
    if (signal?.aborted) throw aborted();
    if (error instanceof AppError) throw error;
    throw new AppError("DNS_FAILED", "接続先が見つかりません。URLを確認してください。", 502);
  } finally { clearTimeout(timer); signal?.removeEventListener("abort", cancel); }
}

export function createPublicTransport(fetchImpl: typeof fetch): SafeTransport {
  return async (url, _address, options) => {
    // global_fetch_strictly_public is mandatory. No service/VPC/origin binding,
    // cf.resolveOverride, caller headers, cookies, Authorization or auto redirects.
    const response = await fetchImpl(url, { method: options.method ?? "GET", redirect: "manual", credentials: "omit", cache: "no-store", signal: options.signal, headers: {
      "User-Agent": "PageCrate/0.2 (public-page media collector)", Accept: "*/*", "Accept-Encoding": "identity",
    } });
    const headers = Object.fromEntries(response.headers);
    if (Object.entries(headers).reduce((size, [key, value]) => size + key.length + value.length, 0) > 32 * 1024) {
      await response.body?.cancel(); throw new AppError("HEADER_LIMIT", "取得先の応答ヘッダーが上限を超えています。", 413);
    }
    if (!["", "identity", "gzip", "br"].includes(headers["content-encoding"] ?? "")) {
      await response.body?.cancel(); throw new AppError("BODY_LIMIT", "対応できない圧縮形式です。", 413);
    }
    let body: Buffer;
    if (options.method === "HEAD") { await response.body?.cancel(); body = Buffer.alloc(0); }
    else body = await readBoundedBody(response, options.maxBytes ?? MAX_ASSET_BYTES, options.onBytes, options.signal);
    delete headers["set-cookie"]; delete headers["content-encoding"]; delete headers["transfer-encoding"];
    headers["content-length"] = String(body.length);
    return { status: response.status, headers, body, url: url.href };
  };
}

// Every redirect gets URL + DNS validation. These syntax checks and the DoH precheck are the main defences. The
// precheck is not IP pinning: the connection looks the name up again. global_fetch_strictly_public is for sending
// requests to the account's own zones out through the public Internet path; whether it refuses internal addresses at
// connection time is not described in the official documentation and is unconfirmed. Connection-time refusal and
// robustness against the gap between the two lookups are to be confirmed on a Worker separate from production,
// before page scans are opened (README.md, docs/operations.md).
export function createSafeFetcher(resolver: Resolver, transport: SafeTransport) {
  return async function fetchValidated(input: string, options: FetchOptions = {}): Promise<SafeResponse> {
    let url = validateUrl(input);
    assertHostAllowed(url, options.isBlockedHost);
    const controller = new AbortController();
    const cancel = () => controller.abort();
    options.signal?.addEventListener("abort", cancel, { once: true });
    const timer = setTimeout(cancel, options.timeoutMs ?? 10000);
    const limited = { ...options, signal: controller.signal };
    try {
      const limit = options.redirects ?? 5;
      for (let hop = 0; hop <= limit; hop++) {
        if (options.signal?.aborted || controller.signal.aborted) throw aborted();
        const address = await resolvePublic(url, resolver, controller.signal);
        const response = await transport(url, address, limited);
        if (controller.signal.aborted) throw aborted();
        if ([301, 302, 303, 307, 308].includes(response.status) && response.headers.location) {
          const next = validateUrl(new URL(response.headers.location, url).href);
          assertHostAllowed(next, options.isBlockedHost);
          if (limit === 0) { await resolvePublic(next, resolver, controller.signal); return { ...response, headers: { ...response.headers, location: next.href } }; }
          if (hop === limit) throw new AppError("REDIRECT_LIMIT", "転送回数が多すぎるため取得を停止しました。", 502);
          url = next; continue;
        }
        return response;
      }
      throw new AppError("REDIRECT_LIMIT", "転送回数が多すぎます。", 502);
    } catch (error) {
      if (options.signal?.aborted) throw aborted();
      if (controller.signal.aborted) throw new AppError("FETCH_TIMEOUT", "取得が時間切れになりました。再試行してください。", 504);
      if (error instanceof AppError) throw error;
      throw new AppError("CONNECTION_FAILED", "接続できませんでした。公開ページか確認して再試行してください。", 502);
    } finally { clearTimeout(timer); options.signal?.removeEventListener("abort", cancel); }
  };
}

export function createWorkerSafeFetcher() {
  assertWorkersRuntime();
  return createSafeFetcher(createDohResolver(fetch), createPublicTransport(fetch));
}
export async function safeFetch(input: string, options: FetchOptions = {}): Promise<SafeResponse> {
  return createWorkerSafeFetcher()(input, options);
}
