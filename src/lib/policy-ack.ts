/**
 * The policy check's memory, kept on the device only (requirements 2.1–2.3, design D5). Pure decisions: the storage
 * is passed in, so tests use a stand-in and the browser passes localStorage. Nothing here talks to a server.
 */
import { POLICY_ACK_STORAGE_NAME } from "./policy";

/** What is stored under POLICY_ACK_STORAGE_NAME: the version read and when, nothing else. */
export interface PolicyAckRecord {
  readonly version: string;
  readonly ackedAt: string;
}

/** The part of Web Storage the check uses. */
export type AckStorage = Pick<Storage, "getItem" | "setItem">;
/** Gives the storage, or null when there is none. Getting it may throw (blocked site data): that counts as none. */
export type AckStorageSource = () => AckStorage | null;

/** current: confirmed for this version. outdated: an older version. missing: nothing usable. unavailable: cannot read. */
export type PolicyAckStatus = "current" | "outdated" | "missing" | "unavailable";

/** The stored record, or null when it is absent, not JSON, or not exactly a version and a valid date. */
export function parsePolicyAck(raw: string | null): PolicyAckRecord | null {
  if (raw === null) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const { version, ackedAt } = value as Record<string, unknown>;
  if (typeof version !== "string" || version === "" || typeof ackedAt !== "string" || Number.isNaN(Date.parse(ackedAt))) return null;
  return { version, ackedAt };
}

export function readPolicyAck(source: AckStorageSource, version: string): PolicyAckStatus {
  let raw: string | null;
  try {
    const storage = source();
    if (!storage) return "unavailable";
    raw = storage.getItem(POLICY_ACK_STORAGE_NAME);
  } catch {
    return "unavailable";
  }
  const record = parsePolicyAck(raw);
  if (!record) return "missing";
  return record.version === version ? "current" : "outdated";
}

/** Stores the confirmation of this version. False when the device did not keep it. */
export function writePolicyAck(source: AckStorageSource, version: string, now: Date): boolean {
  try {
    const storage = source();
    if (!storage) return false;
    const record: PolicyAckRecord = { version, ackedAt: now.toISOString() };
    storage.setItem(POLICY_ACK_STORAGE_NAME, JSON.stringify(record));
    return parsePolicyAck(storage.getItem(POLICY_ACK_STORAGE_NAME))?.version === version;
  } catch {
    return false;
  }
}

export interface PolicyAckSession {
  /** True when the check must be shown before a scan or the demo starts. */
  needsAck(): boolean;
  /** Records the confirmation: "saved" on the device, or "this-visit" when the device cannot keep it. */
  acknowledge(): "saved" | "this-visit";
}

/**
 * One per visit (page load). A confirmation the device could not keep still counts until the page is left or
 * reloaded, so a browser without storage is asked once per visit instead of before every start.
 */
export function createPolicyAckSession(options: { version: string; storage: AckStorageSource; now?: () => Date }): PolicyAckSession {
  let confirmedThisVisit = false;
  const now = options.now ?? (() => new Date());
  return {
    needsAck: () => !confirmedThisVisit && readPolicyAck(options.storage, options.version) !== "current",
    acknowledge: () => {
      confirmedThisVisit = true;
      return writePolicyAck(options.storage, options.version, now()) ? "saved" : "this-visit";
    },
  };
}
