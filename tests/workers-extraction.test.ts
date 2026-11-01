import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { assertWorkersRuntime, createDohResolver, createPublicTransport, createSafeFetcher, readBoundedBody, resolvePublic, safeFetch, type Address } from "../src/lib/safe-fetch";
import { verifyBrowserGuardrails, type ScanBrowser } from "../src/lib/scanner";
import { launchTestBrowser } from "./helpers/node-scanner";
import { ByteBudget } from "../src/lib/budget";
import { demoBody } from "../src/lib/demo";

const publicAddress: Address = { address: "8.8.8.8", family: 4 };
const publicResolver = async () => [publicAddress];
const jsonDns = (answer: unknown) => new Response(JSON.stringify({ Status: 0, Answer: answer }), { headers: { "content-type": "application/dns-json" } });

test("production safeFetch fails closed outside Workers before any outbound fetch", async () => {
  await assert.rejects(safeFetch("https://example.com"), { code: "EXTRACTION_RUNTIME" });
});

test("strictly-public runtime flag is mandatory even with the Workers user agent", () => {
  const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const cloudflareDescriptor = Object.getOwnPropertyDescriptor(globalThis, "Cloudflare");
  try {
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: { userAgent: "Cloudflare-Workers" } });
    for (const flags of [{}, { global_fetch_strictly_public: false }]) {
      Object.defineProperty(globalThis, "Cloudflare", { configurable: true, value: { compatibilityFlags: flags } });
      assert.throws(assertWorkersRuntime, { code: "EXTRACTION_GUARD" });
    }
    Object.defineProperty(globalThis, "Cloudflare", { configurable: true, value: { compatibilityFlags: { global_fetch_strictly_public: true } } });
    assert.doesNotThrow(assertWorkersRuntime);
  } finally {
    if (navigatorDescriptor) Object.defineProperty(globalThis, "navigator", navigatorDescriptor); else Reflect.deleteProperty(globalThis, "navigator");
    if (cloudflareDescriptor) Object.defineProperty(globalThis, "Cloudflare", cloudflareDescriptor); else Reflect.deleteProperty(globalThis, "Cloudflare");
  }
});

test("DoH checks both address families, rejects mixed private DNS, and uses fixed resolver", async () => {
  const requests: string[] = [];
  const mock: typeof fetch = async (input, init) => {
    const url = new URL(String(input)); requests.push(url.searchParams.get("type")!);
    assert.equal(url.origin + url.pathname, "https://cloudflare-dns.com/dns-query");
    assert.equal(url.searchParams.get("name"), "example.com");
    assert.equal(init?.redirect, "manual"); assert.equal(init?.credentials, "omit");
    return jsonDns(url.searchParams.get("type") === "A" ? [{ type: 1, data: "8.8.8.8" }] : [{ type: 28, data: "fd00::1" }]);
  };
  await assert.rejects(resolvePublic(new URL("https://example.com"), createDohResolver(mock)), { code: "UNSAFE_URL" });
  assert.deepEqual(requests.sort(), ["A", "AAAA"]);
});

test("DoH caches only within its factory, rejects redirects, malformed/oversize DNS", async () => {
  let calls = 0;
  const valid: typeof fetch = async () => { calls++; return jsonDns([{ type: 1, data: "8.8.8.8" }]); };
  const resolver = createDohResolver(valid);
  await resolver("example.com"); await resolver("example.com");
  assert.equal(calls, 2);
  await createDohResolver(valid)("example.com"); assert.equal(calls, 4);
  for (const response of [() => new Response(null, { status: 302, headers: { location: "http://127.0.0.1" } }), () => jsonDns([{ type: 1, data: "not-an-ip" }]), () => jsonDns([{ type: 1, data: "x".repeat(17000) }])]) {
    await assert.rejects(createDohResolver(async () => response())("example.com"));
  }
});

test("public transport never forwards caller credentials, follows no automatic redirects, strips cookies", async () => {
  const mock: typeof fetch = async (input, init) => {
    assert.equal(String(input), "https://example.com/a");
    assert.equal(init?.method, "GET"); assert.equal(init?.redirect, "manual");
    assert.equal(init?.credentials, "omit"); assert.equal(init?.cache, "no-store");
    const headers = new Headers(init?.headers);
    for (const key of ["cookie", "authorization", "referer", "origin"]) assert.equal(headers.has(key), false);
    assert.equal(headers.get("accept-encoding"), "identity");
    return new Response("abc", { status: 302, headers: { location: "/b", "set-cookie": "fixture=synthetic" } });
  };
  const result = await createPublicTransport(mock)(new URL("https://example.com/a"), publicAddress, {});
  assert.equal(result.status, 302); assert.equal(result.body.toString(), "abc");
  assert.equal(result.headers["set-cookie"], undefined);
});

test("redirect bytes count toward the same budget and private redirect never reaches fetch", async () => {
  const seen: string[] = [], budget = new ByteBudget(10);
  const mock: typeof fetch = async input => {
    const url = new URL(String(input)); seen.push(url.pathname);
    return new Response("123456", { status: 302, headers: { location: "/next" } });
  };
  const fetcher = createSafeFetcher(publicResolver, createPublicTransport(mock));
  await assert.rejects(fetcher("https://example.com/first", { onBytes: budget.consume }), { code: "SCAN_LIMIT" });
  assert.deepEqual(seen, ["/first", "/next"]); assert.equal(budget.remaining, 0);
  let requests = 0;
  await assert.rejects(createSafeFetcher(publicResolver, createPublicTransport(async () => {
    requests++; return new Response("", { status: 302, headers: { location: "http://[::ffff:127.0.0.1]/private" } });
  }))("https://example.com"), { code: "UNSAFE_URL" });
  assert.equal(requests, 1);
});

test("decoded response stream limit cancels immediately; partial failed reads remain counted", async () => {
  let canceled = false;
  const body = new ReadableStream<Uint8Array>({ pull(controller) { controller.enqueue(new Uint8Array(6)); }, cancel() { canceled = true; } });
  const budget = new ByteBudget(100);
  await assert.rejects(readBoundedBody(new Response(body, { headers: { "content-encoding": "gzip" } }), 10, budget.consume), { code: "BODY_LIMIT" });
  assert.equal(canceled, true); assert.equal(budget.used, 12);
  let step = 0;
  const broken = new ReadableStream<Uint8Array>({ pull(controller) { if (!step++) controller.enqueue(new Uint8Array(3)); else controller.error(new Error("synthetic upstream failure")); } });
  await assert.rejects(readBoundedBody(new Response(broken), 10, budget.consume));
  assert.equal(budget.used, 15);
});

test("timeout spans response body and redirects; HEAD/oversize/unknown encoding cancel bodies", async () => {
  let canceled = false;
  const stalled: typeof fetch = async () => new Response(new ReadableStream<Uint8Array>({ cancel() { canceled = true; } }));
  await assert.rejects(createSafeFetcher(publicResolver, createPublicTransport(stalled))("https://example.com", { timeoutMs: 20 }), { code: "FETCH_TIMEOUT" });
  assert.equal(canceled, true);
  for (const mode of ["head", "length", "encoding"]) {
    let closed = false;
    const response = new Response(new ReadableStream<Uint8Array>({ cancel() { closed = true; } }), { headers: mode === "length" ? { "content-length": "1000" } : mode === "encoding" ? { "content-encoding": "unsupported" } : {} });
    const result = createPublicTransport(async () => response)(new URL("https://example.com"), publicAddress, { method: mode === "head" ? "HEAD" : "GET", maxBytes: 10 });
    if (mode === "head") assert.equal((await result).body.length, 0); else await assert.rejects(result, { code: "BODY_LIMIT" });
    assert.equal(closed, true);
  }
});

test("demo video is byte-identical to the self-authored fixture with no runtime filesystem", async () => {
  assert.deepEqual((await demoBody("demo-video")).body, await readFile(new URL("../fixtures/motion-study.webm", import.meta.url)));
});

test("browser guard probe requires exact platform headers, not just an arbitrary 403", { timeout: 45000 }, async () => {
  const browser = await launchTestBrowser(new AbortController().signal);
  try {
    await assert.rejects(verifyBrowserGuardrails(browser), { code: "BROWSER_GUARD" });
    const mockDenied: ScanBrowser = { newContext: async options => {
      const context = await browser.newContext(options);
      await context.route("https://example.com/pagecrate-network-guard-probe", route => route.fulfill({ status: 403, headers: {}, body: "" }));
      return context;
    }, close: () => browser.close() };
    await assert.rejects(verifyBrowserGuardrails(mockDenied), { code: "BROWSER_GUARD" });
    const mockGuarded: ScanBrowser = { newContext: async options => {
      const context = await browser.newContext(options);
      await context.route("https://example.com/pagecrate-network-guard-probe", route => route.fulfill({ status: 403, headers: { "cf-mitigated": "guardrails", "cf-brapi-guardrails-reason": "not-in-allowlist" }, body: "" }));
      return context;
    }, close: () => browser.close() };
    await verifyBrowserGuardrails(mockGuarded);
  } finally { await browser.close(); }
});
