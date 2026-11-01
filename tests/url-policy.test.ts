import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { apiErrorResponse } from "../src/lib/api";
import { guardScan } from "../src/lib/guard";
import { resolvePublic, validateUrl } from "../src/lib/safe-fetch";
import { isPublicAddress, nonPublicReason, parseHttpUrl } from "../src/lib/url-policy";
import { context, live, refused, scanRequest, OPEN_ENV } from "./helpers/guard-fixtures";

const CAP_REACHED = { allowed: false, reason: "CAP_REACHED", used: 5 };
const PRIVATE_TARGETS = [
  "http://127.0.0.1/", "http://127.1.2.3/x", "http://2130706433/", "http://0x7f000001/", "http://0177.0.0.1/",
  "http://10.0.0.1/", "http://172.16.5.4/", "http://192.168.1.1/", "http://169.254.169.254/latest/meta-data",
  "http://100.64.0.1/", "http://0.0.0.0/", "http://192.0.2.1/", "http://198.18.0.1/", "http://224.0.0.1/",
  "http://[::1]/", "http://[::ffff:127.0.0.1]/", "http://[fc00::1]/", "http://[fe80::1]/", "http://[2001:db8::1]/",
  "http://localhost/", "http://localhost./", "http://app.localhost/", "http://box.local/", "http://printer/",
  "http://api.internal/", "http://site.test/", "http://name.invalid/", "http://router.home.arpa/",
  "https://photos.example.org:8443/x", "http://photos.example.org:8080/", "https://photos.example.org:80/",
];
/** Spellings that once got past the syntax check to the daily cap (independent review F3): extra trailing dots, ::/96. */
const SLIPPED_TARGETS: ReadonlyArray<readonly [string, string]> = [
  ["http://localhost../", "INTERNAL_HOST"], ["http://127.0.0.1../", "PRIVATE_IP"], ["http://corp.internal../", "INTERNAL_HOST"], ["http://[::127.0.0.1]/", "PRIVATE_IP"],
  ["http://localhost.../", "INTERNAL_HOST"], ["http://127.0.0.1.../x", "PRIVATE_IP"], ["http://corp.internal.../", "INTERNAL_HOST"], ["http://[::7f00:1]/", "PRIVATE_IP"], ["http://[::2]/", "PRIVATE_IP"],
];

function classify(input: string): string {
  const parsed = parseHttpUrl(input);
  if (!parsed.ok) return parsed.reason;
  return nonPublicReason(parsed.url) ?? "PUBLIC";
}

test("url policy: IP literals that are not global unicast, internal host names and non-standard ports are non-public by syntax alone", () => {
  for (const url of PRIVATE_TARGETS) assert.notEqual(classify(url), "PUBLIC", url);
  assert.equal(classify("https://photos.example.org:8443/x"), "PORT");
  assert.equal(classify("http://printer/"), "INTERNAL_HOST");
  assert.equal(classify("http://[::ffff:10.0.0.1]/"), "PRIVATE_IP");
  for (const url of ["https://photos.example.org/gallery?id=1", "http://photos.example.org:80/", "https://photos.example.org:443/", "https://8.8.8.8/", "https://[2606:4700:4700::1111]/", "https://例え.jp/"]) {
    assert.equal(classify(url), "PUBLIC", url);
  }
  // Shape errors stay shape errors: they are INVALID_URL, not PRIVATE_ADDRESS.
  for (const [input, reason] of [["", "NOT_A_URL"], ["notaurl", "NOT_A_URL"], ["ftp://photos.example.org/", "NOT_HTTP"], ["https://user:pass@photos.example.org/", "NOT_HTTP"], [`https://photos.example.org/${"a".repeat(4096)}`, "TOO_LONG"]] as const) {
    assert.equal(classify(input), reason, input.slice(0, 40));
  }
  assert.equal(isPublicAddress("8.8.8.8"), true);
  assert.equal(isPublicAddress("10.0.0.1"), false);
});

test("url policy: every trailing dot is dropped, and IPv4-compatible IPv6 (::/96) is never public", async () => {
  for (const [url, reason] of SLIPPED_TARGETS) assert.equal(classify(url), reason, url);
  for (const address of ["::7f00:1", "::1", "::", "::2", "::a9fe:a9fe", "::10.0.0.1", "::8.8.8.8"]) assert.equal(isPublicAddress(address), false, address);
  // The IPv4-mapped form is not in ::/96 and is still judged as the IPv4 address it carries.
  for (const address of ["2606:4700::1111", "2606:4700:4700::1111", "::ffff:8.8.8.8", "8.8.8.8"]) assert.equal(isPublicAddress(address), true, address);
  // safe-fetch shares both rules: for the URL of a ticket or a redirect, and for the DNS answers it checks.
  for (const [url] of SLIPPED_TARGETS) assert.throws(() => validateUrl(url), { code: "UNSAFE_URL" }, url);
  await assert.rejects(resolvePublic(new URL("https://photos.example.org/"), async () => [{ address: "::7f00:1", family: 6 }]), { code: "UNSAFE_URL" });
});

test("scan guard: the spellings that once slipped through are PRIVATE_ADDRESS before the daily cap — nothing is reserved", async () => {
  for (const [url] of SLIPPED_TARGETS) {
    const run = context({ reserve: CAP_REACHED });
    const error = refused(await guardScan(scanRequest(live({ url })), run.ctx), url);
    assert.equal(error.code, "PRIVATE_ADDRESS", url);
    assert.deepEqual(run.calls, ["limit:scan", "bot"], url);
    assert.deepEqual(run.reserved, [], url);
  }
});

test("url policy: safe-fetch keeps its codes and messages on the shared rules", () => {
  assert.throws(() => validateUrl("https://photos.example.org:8443/x"), { code: "UNSAFE_URL", message: "標準ポートの公開Webページだけ取得できます。" });
  assert.throws(() => validateUrl("http://10.0.0.1/"), { code: "UNSAFE_URL", message: /内部ネットワーク/ });
  assert.throws(() => validateUrl("http://printer/"), { code: "UNSAFE_URL" });
  assert.throws(() => validateUrl("x".repeat(4097)), { code: "INVALID_URL", message: /4,096文字/ });
  assert.throws(() => validateUrl("not a url"), { code: "INVALID_URL", message: /https:\/\// });
  assert.throws(() => validateUrl("ftp://photos.example.org/"), { code: "INVALID_URL", message: /認証情報/ });
  assert.equal(validateUrl("  https://photos.example.org/a#frag  ").href, "https://photos.example.org/a");
});

test("scan guard: an internal target is PRIVATE_ADDRESS (422) before the daily cap — nothing is reserved", async () => {
  for (const url of PRIVATE_TARGETS) {
    const run = context({ reserve: CAP_REACHED });
    const error = refused(await guardScan(scanRequest(live({ url })), run.ctx), url);
    assert.equal(error.code, "PRIVATE_ADDRESS", url);
    assert.equal(apiErrorResponse(error).status, 422, url);
    assert.deepEqual(run.calls, ["limit:scan", "bot"], url);
    assert.deepEqual(run.reserved, [], url);
  }
  // Order: the URL shape first, then the operator blocklist, then the internal-address check.
  const order: Array<[string, string]> = [["ftp://10.0.0.1/", "INVALID_URL"], ["http://blocked.example:8080/", "BLOCKED_HOST"]];
  for (const [url, code] of order) assert.equal(refused(await guardScan(scanRequest(live({ url })), context().ctx), url).code, code, url);
  for (const [entry, url] of [["10.0.0.1", "http://10.0.0.1/"], ["corp.internal", "http://corp.internal/"]] as const) {
    const blocked = context({ env: { ...OPEN_ENV, PAGECRATE_BLOCKED_HOSTS: entry } });
    assert.equal(refused(await guardScan(scanRequest(live({ url })), blocked.ctx), url).code, "BLOCKED_HOST", url);
  }
  // A public host name still passes: whether it resolves to a public address is checked by safe-fetch when it connects.
  const run = context();
  const passed = await guardScan(scanRequest(live({ url: "https://intranet-looking.example.org/#section" })), run.ctx);
  assert.deepEqual(passed.ok && !passed.demo ? passed.url : null, "https://intranet-looking.example.org/");
  assert.deepEqual(run.calls, ["limit:scan", "bot", "reserve"]);
});

test("layering: guard and url-policy never import safe-fetch; safe-fetch takes its syntax rules from url-policy", async () => {
  const source = async (name: string) => readFile(new URL(`../src/lib/${name}`, import.meta.url), "utf8");
  const imports = (text: string) => [...text.matchAll(/from\s+"([^"]+)"/g)].map(match => match[1]);
  assert.equal(imports(await source("guard.ts")).includes("./safe-fetch"), false);
  assert.deepEqual(imports(await source("url-policy.ts")), ["ipaddr.js"]);
  assert.ok(imports(await source("safe-fetch.ts")).includes("./url-policy"));
});
