import { test } from "node:test";
import assert from "node:assert/strict";
import { assertAppHost, configuredOrigin } from "../src/lib/origin";
import { assertLocalRequest } from "../src/lib/api";

const base = "https://pagecrate.example.com";
const NAMES = ["PAGECRATE_PUBLIC_ORIGIN"] as const;
function request(url = base, headers: Record<string, string> = {}) {
  return new Request(`${url}/api/scan`, { headers: { host: new URL(url).host, origin: url, ...headers } });
}
/** Runs with only the given origin settings present, then restores the caller's environment. */
function withOrigins(values: Partial<Record<(typeof NAMES)[number], string>>, run: () => void) {
  const previous = NAMES.map(name => [name, process.env[name]] as const);
  try {
    for (const name of NAMES) {
      const value = values[name];
      if (value === undefined) Reflect.deleteProperty(process.env, name); else process.env[name] = value;
    }
    run();
  } finally {
    for (const [name, value] of previous) if (value === undefined) Reflect.deleteProperty(process.env, name); else process.env[name] = value;
  }
}

test("production mutations require the configured canonical HTTPS host and Origin", () => {
  withOrigins({ PAGECRATE_PUBLIC_ORIGIN: base }, () => {
    assert.equal(configuredOrigin(), base);
    assertLocalRequest(request(), true);
    assert.throws(() => assertLocalRequest(request(base, { origin: "https://evil.example" }), true));
    assert.throws(() => assertLocalRequest(request(base, { origin: "null" }), true));
    assert.throws(() => assertLocalRequest(request(base, { host: "evil.example", "x-forwarded-host": "pagecrate.example.com" }), true));
    assert.throws(() => assertLocalRequest(request("https://evil.example", { host: "pagecrate.example.com", "x-forwarded-host": "pagecrate.example.com" }), true));
    assert.throws(() => assertLocalRequest(request("http://pagecrate.example.com"), true));
    assert.throws(() => assertLocalRequest(request(base, { "sec-fetch-site": "cross-site" }), true));
    const absent = request(); absent.headers.delete("origin");
    assert.throws(() => assertLocalRequest(absent, true));
    // The Host-only check ignores Sec-Fetch-Site; assertLocalRequest adds the Origin and cross-site checks on top.
    assert.equal(assertAppHost(request(base, { "sec-fetch-site": "cross-site" })), base);
  });
});

test("missing/invalid deployment configuration cannot fall back to an arbitrary host", () => {
  withOrigins({}, () => assert.throws(() => assertAppHost(request())));
  for (const invalid of ["http://pagecrate.example.com", `${base}/subpath`, `${base}?token=test`, `${base}#fragment`, "https://user:password@example.com", "http://127.0.0.1:3000"]) {
    for (const name of NAMES) {
      withOrigins({ [name]: invalid }, () => {
        assert.throws(() => configuredOrigin(), { code: "APP_NOT_CONFIGURED" }, `${name}=${invalid}`);
        assert.throws(() => assertAppHost(request()), { code: "APP_NOT_CONFIGURED" }, `${name}=${invalid}`);
      });
    }
  }
});

test("local Workers preview (8787) and next dev (4381) are the only plain-HTTP origins", () => {
  for (const local of ["http://127.0.0.1:8787", "http://localhost:8787", "http://127.0.0.1:4381", "http://localhost:4381"]) {
    withOrigins({ PAGECRATE_PUBLIC_ORIGIN: local }, () => {
      assert.equal(configuredOrigin(), local);
      assertLocalRequest(request(local), true);
    });
    // Without any setting, only these exact local origins may use their own URL as the expected origin.
    withOrigins({}, () => assert.equal(assertAppHost(request(local)), local));
  }
  withOrigins({}, () => {
    for (const other of ["http://127.0.0.1:3000", "http://127.0.0.1:8788", "http://192.168.0.2:8787", "https://pagecrate.example.com"]) {
      assert.throws(() => assertAppHost(request(other)), { code: "FORBIDDEN" }, other);
    }
  });
});

test("Next.js's loopback rewrite of request.url keeps the exact Host and Origin checks", () => {
  // Route handlers see http://127.0.0.1:8787 as http://localhost:8787, while the Host and Origin headers keep 127.0.0.1.
  const nextStyle = (host: string, origin = `http://${host}`) => new Request("http://localhost:8787/api/scan", { headers: { host, origin } });
  withOrigins({ PAGECRATE_PUBLIC_ORIGIN: "http://127.0.0.1:8787" }, () => {
    assertLocalRequest(nextStyle("127.0.0.1:8787"), true);
    assert.throws(() => assertAppHost(nextStyle("localhost:8787", "http://127.0.0.1:8787")), { code: "FORBIDDEN" });
    assert.throws(() => assertLocalRequest(nextStyle("localhost:8787"), true), { code: "FORBIDDEN" });
    assert.throws(() => assertLocalRequest(nextStyle("127.0.0.1:8787", "http://localhost:8787"), true), { code: "FORBIDDEN" });
  });
  withOrigins({}, () => {
    assert.equal(assertAppHost(nextStyle("127.0.0.1:8787")), "http://127.0.0.1:8787");
    assert.throws(() => assertAppHost(new Request("http://localhost:3000/api/scan", { headers: { host: "127.0.0.1:3000" } })), { code: "FORBIDDEN" });
  });
  // Public hosts are never rewritten, so the production comparison stays exact.
  withOrigins({ PAGECRATE_PUBLIC_ORIGIN: base }, () => {
    assert.throws(() => assertAppHost(new Request("http://localhost:8787/api/scan", { headers: { host: "pagecrate.example.com" } })), { code: "FORBIDDEN" });
  });
});
