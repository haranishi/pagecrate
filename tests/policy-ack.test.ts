import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createPolicyAckSession, parsePolicyAck, readPolicyAck, writePolicyAck, type AckStorage, type AckStorageSource } from "../src/lib/policy-ack";
import { POLICY_ACK_STORAGE_NAME, POLICY_VERSION } from "../src/lib/policy";

/** A Web Storage stand-in. `failWrites` imitates a full or read-only storage (setItem throws). */
function memoryStorage(failWrites = false) {
  const values = new Map<string, string>();
  const storage: AckStorage = {
    getItem: name => values.get(name) ?? null,
    setItem: (name, value) => {
      if (failWrites) throw new DOMException("quota", "QuotaExceededError");
      values.set(name, String(value));
    },
  };
  return { storage, values };
}
const blocked: AckStorageSource = () => { throw new DOMException("blocked", "SecurityError"); };
const at = new Date("2026-10-31T03:00:00.000Z");

test("policy ack: only a record of the current version counts; older versions ask again", () => {
  const { storage } = memoryStorage();
  const source = () => storage;
  assert.equal(readPolicyAck(source, "2026-10-31.1"), "missing");
  assert.equal(writePolicyAck(source, "2026-10-31.1", at), true);
  assert.equal(readPolicyAck(source, "2026-10-31.1"), "current");
  assert.equal(readPolicyAck(source, "2026-11-05.1"), "outdated", "a new version asks again (2.3)");
  assert.equal(readPolicyAck(source, "2026-10-31.10"), "outdated", "versions are compared exactly, not as prefixes");
});

test("policy ack: the device keeps only the version and the time, under a name without KEY", () => {
  const { storage, values } = memoryStorage();
  writePolicyAck(() => storage, POLICY_VERSION, at);
  assert.deepEqual([...values.keys()], [POLICY_ACK_STORAGE_NAME]);
  assert.equal(POLICY_ACK_STORAGE_NAME, "pagecrate.policy");
  assert.doesNotMatch(POLICY_ACK_STORAGE_NAME, /key/i);
  assert.deepEqual(JSON.parse(values.get(POLICY_ACK_STORAGE_NAME)!), { version: POLICY_VERSION, ackedAt: "2026-10-31T03:00:00.000Z" });
});

test("policy ack: a broken or foreign record is treated as no record", () => {
  for (const raw of [null, "", "yes", "null", "[]", "1", "{}", '{"version":1,"ackedAt":"2026-10-31T00:00:00Z"}', '{"version":"","ackedAt":"2026-10-31T00:00:00Z"}',
    `{"version":"${POLICY_VERSION}"}`, `{"version":"${POLICY_VERSION}","ackedAt":"someday"}`]) {
    assert.equal(parsePolicyAck(raw), null, String(raw));
    const source = () => ({ getItem: () => raw, setItem: () => undefined });
    assert.equal(readPolicyAck(source, POLICY_VERSION), "missing", String(raw));
  }
});

test("policy ack: storage that throws or does not exist is never mistaken for a confirmation", () => {
  assert.equal(readPolicyAck(blocked, POLICY_VERSION), "unavailable");
  assert.equal(readPolicyAck(() => null, POLICY_VERSION), "unavailable");
  assert.equal(readPolicyAck(() => ({ getItem: () => { throw new Error("denied"); }, setItem: () => undefined }), POLICY_VERSION), "unavailable");
  assert.equal(writePolicyAck(blocked, POLICY_VERSION, at), false);
  assert.equal(writePolicyAck(() => null, POLICY_VERSION, at), false);
  assert.equal(writePolicyAck(() => memoryStorage(true).storage, POLICY_VERSION, at), false);
  // A storage that accepts the write but does not keep it is not a saved confirmation either.
  assert.equal(writePolicyAck(() => ({ getItem: () => null, setItem: () => undefined }), POLICY_VERSION, at), false);
});

test("policy ack session: once saved, the next visit is not asked until the version changes", () => {
  const { storage } = memoryStorage();
  const first = createPolicyAckSession({ version: "2026-10-31.1", storage: () => storage, now: () => at });
  assert.equal(first.needsAck(), true);
  assert.equal(first.acknowledge(), "saved");
  assert.equal(first.needsAck(), false);
  const reload = createPolicyAckSession({ version: "2026-10-31.1", storage: () => storage });
  assert.equal(reload.needsAck(), false, "the device remembers");
  const newVersion = createPolicyAckSession({ version: "2026-11-05.1", storage: () => storage });
  assert.equal(newVersion.needsAck(), true, "a new version asks again");
});

test("policy ack session: when the device cannot keep it, the confirmation lasts for this visit only", () => {
  for (const source of [blocked, () => null, () => memoryStorage(true).storage] as AckStorageSource[]) {
    const visit = createPolicyAckSession({ version: POLICY_VERSION, storage: source, now: () => at });
    assert.equal(visit.needsAck(), true);
    assert.equal(visit.acknowledge(), "this-visit");
    assert.equal(visit.needsAck(), false, "not asked again before every start in the same visit");
    const nextVisit = createPolicyAckSession({ version: POLICY_VERSION, storage: source });
    assert.equal(nextVisit.needsAck(), true, "asked again after a reload");
  }
});

test("policy check: the decision and the dialog send nothing to any server", () => {
  const root = new URL("..", import.meta.url);
  for (const file of ["src/lib/policy-ack.ts", "src/components/policy-gate.tsx", "src/lib/policy-content.ts"]) {
    const source = readFileSync(new URL(file, root), "utf8");
    for (const network of ["fetch(", "sendBeacon", "XMLHttpRequest", "WebSocket", "EventSource", "/api/", "document.cookie"]) {
      assert.equal(source.includes(network), false, `${network} in ${file}`);
    }
  }
  const gate = readFileSync(new URL("src/components/policy-gate.tsx", root), "utf8");
  assert.match(gate, /disabled=\{!read\}/, "進む stays disabled until 読みました is checked");
  assert.match(gate, /onCancel=\{event => \{ event\.preventDefault\(\); cancel\(\); \}\}/, "Esc is やめる");
  assert.match(gate, /href="\/privacy"/);
});
