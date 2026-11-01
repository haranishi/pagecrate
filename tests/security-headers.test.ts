import { test } from "node:test";
import assert from "node:assert/strict";
import config from "../next.config";
import { contentSecurityPolicy, PAGES_SOURCE, securityHeaderRules, TURNSTILE_ORIGIN, type HeaderRule } from "../src/lib/security-headers";
import { TURNSTILE_SCRIPT_URL } from "../src/lib/turnstile-client";

function directives(policy: string): Map<string, string[]> {
  return new Map(policy.split(";").map(part => part.trim()).filter(Boolean).map(part => {
    const [name, ...sources] = part.split(/\s+/);
    return [name, sources] as const;
  }));
}

/** The two source patterns in use, matched as path-to-regexp would. */
function matches(source: string, path: string): boolean {
  if (source === "/:path*") return true;
  if (source === PAGES_SOURCE) return new RegExp(`^${PAGES_SOURCE}$`).test(path);
  return source === path;
}

/** What Next.js sends for a path: every matching rule in order, a later rule replacing the same header. */
function effectiveHeaders(rules: readonly HeaderRule[], path: string): Map<string, string> {
  const result = new Map<string, string>();
  for (const rule of rules) if (matches(rule.source, path)) for (const header of rule.headers) result.set(header.key.toLowerCase(), header.value);
  return result;
}

const PAGES = ["/", "/demo", "/app", "/terms", "/privacy", "/cookies", "/login", "/account", "/og.png", "/apis", "/api"];

test("csp: the page policy allows its own origin, inline scripts and styles for Next.js, blob: for previews, and Turnstile in two directives", () => {
  assert.equal(TURNSTILE_ORIGIN, "https://challenges.cloudflare.com");
  assert.equal(new URL(TURNSTILE_SCRIPT_URL).origin, TURNSTILE_ORIGIN, "the allowed origin is the script's own");
  // The whole policy, in order.
  assert.deepEqual([...directives(contentSecurityPolicy())], [
    ["default-src", ["'self'"]],
    ["script-src", ["'self'", "'unsafe-inline'", TURNSTILE_ORIGIN]],
    ["style-src", ["'self'", "'unsafe-inline'"]],
    ["img-src", ["'self'", "data:", "blob:"]],
    ["media-src", ["'self'", "blob:"]],
    ["connect-src", ["'self'"]],
    ["frame-src", [TURNSTILE_ORIGIN]],
    ["object-src", ["'none'"]],
    ["base-uri", ["'self'"]],
    ["form-action", ["'self'"]],
    ["frame-ancestors", ["'none'"]],
  ]);
  const withTurnstile = [...directives(contentSecurityPolicy())].filter(([, sources]) => sources.includes(TURNSTILE_ORIGIN)).map(([name]) => name);
  assert.deepEqual(withTurnstile, ["script-src", "frame-src"], "only the two directives Cloudflare's CSP reference asks for");
  assert.deepEqual(directives(contentSecurityPolicy()).get("connect-src"), ["'self'"], "no pre-clearance, so no connect-src for Turnstile");
  assert.equal(contentSecurityPolicy().includes("unsafe-eval"), false);
});

test("security headers: in production every page outside /api/ sends the one policy that allows the bot check, /api/ sends none", () => {
  const rules = securityHeaderRules(true);
  // A policy belongs to the first document: a page with a policy of its own would break the bot check for visitors
  // who reach it through a link from another page, so exactly one rule sets it, for every page.
  assert.deepEqual(rules.map(rule => rule.source), ["/:path*", PAGES_SOURCE]);
  assert.equal(rules.filter(rule => rule.headers.some(header => header.key.toLowerCase() === "content-security-policy")).length, 1);
  for (const path of PAGES) {
    const headers = effectiveHeaders(rules, path);
    assert.equal(headers.get("content-security-policy"), contentSecurityPolicy(), path);
    const policy = directives(headers.get("content-security-policy") ?? "");
    assert.ok(policy.get("script-src")?.includes(TURNSTILE_ORIGIN), `${path}: script-src`);
    assert.deepEqual(policy.get("frame-src"), [TURNSTILE_ORIGIN], `${path}: frame-src`);
    assert.deepEqual(policy.get("connect-src"), ["'self'"], `${path}: connect-src`);
    assert.equal(headers.get("x-frame-options"), "DENY", path);
    assert.equal(headers.get("referrer-policy"), "no-referrer", path);
    // No two rules set the same header, so the order the rules come in changes nothing on any page.
    assert.deepEqual(effectiveHeaders([...rules].reverse(), path), headers, `${path}: order`);
  }
  // API routes keep the headers they set themselves (the preview's sandbox policy); the common ones still apply.
  for (const path of ["/api/scan", "/api/preview", "/api/download"]) {
    const headers = effectiveHeaders(rules, path);
    assert.equal(headers.has("content-security-policy"), false, path);
    assert.equal(headers.get("x-content-type-options"), "nosniff", path);
  }
  const development = securityHeaderRules(false);
  assert.equal(development.some(rule => rule.headers.some(header => header.key === "Content-Security-Policy")), false, "next dev keeps its reloads");
  assert.equal(effectiveHeaders(development, "/").get("x-content-type-options"), "nosniff");
});

test("security headers: next.config.ts returns these rules, the CSP only when built for production", async () => {
  const original = process.env.NODE_ENV;
  try {
    Reflect.set(process.env, "NODE_ENV", "production");
    assert.deepEqual(await config.headers!(), securityHeaderRules(true));
    Reflect.set(process.env, "NODE_ENV", "development");
    assert.deepEqual(await config.headers!(), securityHeaderRules(false));
  } finally {
    if (original === undefined) Reflect.deleteProperty(process.env, "NODE_ENV");
    else Reflect.set(process.env, "NODE_ENV", original);
  }
});
