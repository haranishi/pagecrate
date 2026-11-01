/**
 * Version of the terms, privacy policy and cookie page. Bump it when what they say changes materially: the policy
 * check on the device (policy-ack.ts) then asks again before the next start. Format: the date of the change and a
 * running number for that day.
 */
export const POLICY_VERSION = "2026-11-01.1";

/**
 * localStorage name of the device-only record that the person read the current version (design-contracts.md).
 * The cookie page names it. It must not contain "KEY": secret scanners flagged such names in other projects.
 */
export const POLICY_ACK_STORAGE_NAME = "pagecrate.policy";

const VERSION_FORMAT = /^(\d{4})-(\d{2})-(\d{2})\.(\d+)$/;

/** "2026-10-31.1" → "2026年10月31日": the date shown next to the version on the document pages. */
export function policyVersionDate(version: string = POLICY_VERSION): string {
  const match = VERSION_FORMAT.exec(version);
  if (!match) throw new Error("The policy version must be a date followed by a running number.");
  return `${Number(match[1])}年${Number(match[2])}月${Number(match[3])}日`;
}
