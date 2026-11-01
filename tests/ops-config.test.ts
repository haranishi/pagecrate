import { test } from "node:test";
import assert from "node:assert/strict";
import { liveFetchState, readOpsConfig, readPublicOrigin } from "../src/lib/ops-config";
import { parseTurnstileSiteKey } from "../src/lib/turnstile-client";

const origin = "https://pagecrate.example.com";
/** Cloudflare's published test site key: the shape of a usable key. */
const SITE_KEY = "1x00000000000000000000AA";

test("ops config: unset values close live fetching, read as paused and leave the blocklist empty", () => {
  assert.deepEqual(readOpsConfig({}), {
    dailyRenderCap: 0, paused: true, blockedHosts: [], publicOrigin: { state: "unset" }, liveFetchOpen: false,
  });
  const blank = readOpsConfig({ PAGECRATE_DAILY_RENDER_CAP: "", PAGECRATE_PAUSED: "", PAGECRATE_BLOCKED_HOSTS: "", PAGECRATE_PUBLIC_ORIGIN: "  " });
  assert.equal(blank.dailyRenderCap, 0);
  assert.equal(blank.publicOrigin.state, "unset");
  assert.equal(blank.liveFetchOpen, false);
});

test("ops config: malformed cap becomes 0 and keeps live fetching closed", () => {
  for (const cap of ["abc", "-1", "+5", "1.5", "1e3", "0x10", "5 renders", "１０", "9999999999999999", "0"]) {
    const config = readOpsConfig({ PAGECRATE_DAILY_RENDER_CAP: cap, PAGECRATE_PUBLIC_ORIGIN: origin });
    assert.equal(config.dailyRenderCap, 0, cap);
    assert.equal(config.liveFetchOpen, false, cap);
  }
});

test("ops config: valid values are typed and open live fetching only with cap >= 1 and a valid origin", () => {
  const config = readOpsConfig({
    PAGECRATE_DAILY_RENDER_CAP: " 120 ", PAGECRATE_PAUSED: "0",
    PAGECRATE_BLOCKED_HOSTS: " Example.COM, ,blocked.example ,,", PAGECRATE_PUBLIC_ORIGIN: `${origin}/`,
  });
  assert.deepEqual(config, {
    dailyRenderCap: 120, paused: false, blockedHosts: ["example.com", "blocked.example"],
    publicOrigin: { state: "valid", origin }, liveFetchOpen: true,
  });
  assert.equal(readOpsConfig({ PAGECRATE_DAILY_RENDER_CAP: "1", PAGECRATE_PUBLIC_ORIGIN: origin }).liveFetchOpen, true);
  assert.equal(readOpsConfig({ PAGECRATE_DAILY_RENDER_CAP: "1" }).liveFetchOpen, false);
  assert.equal(readOpsConfig({ PAGECRATE_DAILY_RENDER_CAP: "1", PAGECRATE_PUBLIC_ORIGIN: "http://pagecrate.example.com" }).liveFetchOpen, false);
});

// The pause is the one switch that keeps the demo-only public site from fetching other people's pages, so it fails
// closed (independent review, final: a value like "yes" or a full-width "１" used to read as "not paused" and let live
// fetching start). Only an explicit 0 or false opens; unset, blank, typos and anything else pause.
test("ops config: the pause fails closed — only an explicit 0/false is not paused; unset, blank, typos and full-width digits all pause; the open flag leaves pause to the guard", () => {
  for (const value of ["1", "true", "TRUE", " true ", "yes", "on", "off", "no", "paused", "stop", "nope", "2", "00", "１", "０", "ｔｒｕｅ", "", "   "]) {
    assert.equal(readOpsConfig({ PAGECRATE_PAUSED: value }).paused, true, JSON.stringify(value));
  }
  assert.equal(readOpsConfig({}).paused, true, "unset");
  for (const value of ["0", "false", "FALSE", " 0 ", " False "]) assert.equal(readOpsConfig({ PAGECRATE_PAUSED: value }).paused, false, JSON.stringify(value));
  const paused = readOpsConfig({ PAGECRATE_PAUSED: "1", PAGECRATE_DAILY_RENDER_CAP: "3", PAGECRATE_PUBLIC_ORIGIN: origin });
  assert.equal(paused.paused, true);
  assert.equal(paused.liveFetchOpen, true);
});

test("live fetch state: a pause comes first; otherwise page scans are open only with open settings and a usable site key", () => {
  for (const liveFetchOpen of [true, false]) {
    for (const siteKey of [SITE_KEY, null]) assert.equal(liveFetchState({ paused: true, liveFetchOpen }, siteKey), "paused", `open ${liveFetchOpen}, key ${siteKey}`);
  }
  assert.equal(liveFetchState({ paused: false, liveFetchOpen: true }, SITE_KEY), "open");
  assert.equal(liveFetchState({ paused: false, liveFetchOpen: false }, SITE_KEY), "unavailable");
  assert.equal(liveFetchState({ paused: false, liveFetchOpen: true }, null), "unavailable");
  assert.equal(liveFetchState({ paused: false, liveFetchOpen: false }, null), "unavailable");
});

test("live fetch state from the environment: the demo-only site reads as paused even when its bot-check keys are never used", () => {
  const stateOf = (env: Record<string, string>) => liveFetchState(readOpsConfig(env), parseTurnstileSiteKey(env.PAGECRATE_TURNSTILE_SITEKEY));
  const open: Record<string, string> = { PAGECRATE_PUBLIC_ORIGIN: origin, PAGECRATE_DAILY_RENDER_CAP: "5", PAGECRATE_PAUSED: "0", PAGECRATE_TURNSTILE_SITEKEY: SITE_KEY };
  assert.equal(stateOf(open), "open");
  for (const paused of ["1", "true", " TRUE "]) {
    assert.equal(stateOf({ ...open, PAGECRATE_PAUSED: paused }), "paused", paused);
    assert.equal(stateOf({ ...open, PAGECRATE_PAUSED: paused, PAGECRATE_TURNSTILE_SITEKEY: "unused" }), "paused", `${paused}, a key that is never used`);
    assert.equal(stateOf({ PAGECRATE_PAUSED: paused }), "paused", `${paused}, nothing else set`);
  }
  // The pause fails closed: a typo or a missing value reads as paused too, never as open or "not ready".
  for (const paused of ["yes", "on", "１", ""]) assert.equal(stateOf({ ...open, PAGECRATE_PAUSED: paused }), "paused", JSON.stringify(paused));
  assert.equal(stateOf({}), "paused", "nothing set");
  const closed: [string, Record<string, string>][] = [
    ["cap 0", { ...open, PAGECRATE_DAILY_RENDER_CAP: "0" }],
    ["no origin", { ...open, PAGECRATE_PUBLIC_ORIGIN: "" }],
    ["a malformed key", { ...open, PAGECRATE_TURNSTILE_SITEKEY: "not a key!" }],
    // docs/operations.md: the demo-only site's placeholder, if the pause is lifted before the real keys are in.
    ["the placeholder key 'unused'", { ...open, PAGECRATE_TURNSTILE_SITEKEY: "unused" }],
    ["no key", { ...open, PAGECRATE_TURNSTILE_SITEKEY: "" }],
  ];
  for (const [label, env] of closed) assert.equal(stateOf(env), "unavailable", label);
});

test("public origin: HTTPS origin or local preview/dev HTTP only; anything else is invalid", () => {
  for (const valid of ["http://127.0.0.1:8787", "http://localhost:8787", "http://127.0.0.1:4381", "http://localhost:4381", "https://pagecrate.example.com:8443"]) {
    assert.deepEqual(readPublicOrigin({ PAGECRATE_PUBLIC_ORIGIN: valid }), { state: "valid", origin: valid }, valid);
  }
  for (const invalid of ["pagecrate.example.com", "http://pagecrate.example.com", "http://127.0.0.1:3000", "http://127.0.0.1:8788", "http://0.0.0.0:8787",
    `${origin}/subpath`, `${origin}/?token=test`, `${origin}/#fragment`, "https://user:password@pagecrate.example.com", "ftp://pagecrate.example.com"]) {
    assert.deepEqual(readPublicOrigin({ PAGECRATE_PUBLIC_ORIGIN: invalid }), { state: "invalid" }, invalid);
  }
});
