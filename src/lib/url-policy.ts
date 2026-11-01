/**
 * Pure URL policy shared by the guard and safe-fetch: syntax only, no DNS and no network. It refuses URLs whose text
 * alone shows a non-public target (a private, loopback, link-local or reserved IP literal, an internal host name, a
 * non-standard port) so the guard can refuse them before a render is counted. Whether a host name resolves to public
 * addresses is still checked by safe-fetch when it connects. This module imports neither guard nor safe-fetch.
 */
import ipaddr from "ipaddr.js";

export const TARGET_URL_MAX_CHARS = 4096;

export type HttpUrlFailure = "TOO_LONG" | "NOT_A_URL" | "NOT_HTTP";
export type HttpUrlResult = { readonly ok: true; readonly url: URL } | { readonly ok: false; readonly reason: HttpUrlFailure };
export type NonPublicReason = "PORT" | "INTERNAL_HOST" | "PRIVATE_IP";

const INTERNAL_SUFFIX = /(^|\.)(localhost|local|internal|test|invalid)$/;
/** IPv4-compatible IPv6 (::/96, deprecated by RFC 4291). ipaddr.js 2.5 calls most of it unicast, e.g. ::7f00:1. */
const IPV4_COMPATIBLE = ipaddr.IPv6.parseCIDR("::/96");
/**
 * The dotted spelling "::a.b.c.d" of the same range. ipaddr.js 2.5 parses it as the IPv4-mapped ::ffff:a.b.c.d, so it
 * is recognised from the text before parsing. URL hosts never take this form, but a DNS answer could.
 */
const DOTTED_IPV4_COMPATIBLE = /^::[^:]*\./;

/** True only for a global unicast address (IPv4-mapped IPv6 is judged as the IPv4 it carries; ::/96 is never public). */
export function isPublicAddress(address: string): boolean {
  if (DOTTED_IPV4_COMPATIBLE.test(address)) return false;
  try {
    const parsed = ipaddr.process(address);
    if (parsed.kind() === "ipv6" && parsed.match(IPV4_COMPATIBLE)) return false;
    return parsed.range() === "unicast";
  } catch { return false; }
}

/** 4 or 6 for an IP literal, 0 for anything else. */
export function ipFamily(address: string): number {
  try { return ipaddr.parse(address).kind() === "ipv4" ? 4 : 6; } catch { return 0; }
}

/** http(s) without credentials, at most 4,096 characters (counted before trimming). */
export function parseHttpUrl(input: unknown): HttpUrlResult {
  if (typeof input !== "string" || input.length > TARGET_URL_MAX_CHARS) return { ok: false, reason: "TOO_LONG" };
  let url: URL;
  try { url = new URL(input.trim()); } catch { return { ok: false, reason: "NOT_A_URL" }; }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return { ok: false, reason: "NOT_HTTP" };
  return { ok: true, url };
}

/** Why the URL's text points at a non-public target, or null when nothing in the text does. */
export function nonPublicReason(url: URL): NonPublicReason | null {
  if (url.port && url.port !== (url.protocol === "https:" ? "443" : "80")) return "PORT";
  // Every trailing dot goes, as in guard.ts and safe-fetch.ts: "localhost.." is localhost, "127.0.0.1.." is 127.0.0.1.
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase().replace(/\.+$/, "");
  const family = ipFamily(host);
  if (!host || (!family && !host.includes(".")) || INTERNAL_SUFFIX.test(host) || host.endsWith(".home.arpa")) return "INTERNAL_HOST";
  if (family && !isPublicAddress(host)) return "PRIVATE_IP";
  return null;
}
