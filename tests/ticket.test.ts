import { test } from "node:test";
import assert from "node:assert/strict";
import { createTicketCodec, TICKET_TTL_SECONDS, type TicketCodec, type TicketInput } from "../src/lib/ticket";

const SECRET = "test-only-ticket-key-".padEnd(48, "0");
const OTHER_SECRET = "test-only-rotated-key-".padEnd(48, "1");
const T0 = Date.UTC(2026, 9, 31, 12, 0, 0);
const image: TicketInput = { url: "https://cdn.example.com/photos/a.jpg?w=1200", kind: "image", pageOrigin: "https://example.com", demo: false };
const video: TicketInput = { url: "https://pagecrate.example/assets/motion-study.webm", kind: "video", pageOrigin: "https://pagecrate.example", demo: true };

async function codec(secret = SECRET, now: () => number = () => T0): Promise<TicketCodec> {
  const result = await createTicketCodec(secret, { now });
  assert.ok(result.ok, "codec should be created");
  return result.codec;
}
async function issue(signer: TicketCodec, input: TicketInput = image): Promise<string> {
  const result = await signer.issue(input);
  assert.ok(result.ok, "ticket should be issued");
  return result.ticket;
}
/** Signs arbitrary claims with the real key, to reach the checks that sit behind the MAC. */
async function forge(claims: unknown, secret = SECRET): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const body = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const mac = Buffer.from(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body))).toString("base64url");
  return `${body}.${mac}`;
}
const INVALID = { ok: false, code: "INVALID_TICKET" };

test("ticket: a correctly signed ticket verifies and carries URL, kind, demo flag, page origin and a 30-minute expiry", async () => {
  const signer = await codec();
  const issued = await signer.issue(image);
  assert.ok(issued.ok);
  assert.match(issued.ticket, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/);
  const claims = { v: 1, u: image.url, k: "image", o: image.pageOrigin, d: false, e: T0 / 1000 + TICKET_TTL_SECONDS };
  assert.deepEqual(issued.claims, claims);
  assert.deepEqual(await signer.verify(issued.ticket), { ok: true, claims });
  assert.deepEqual(await signer.verify(issued.ticket, ["image"]), { ok: true, claims });
  const demo = await issue(signer, video);
  const verified = await signer.verify(demo, ["image", "video"]);
  assert.ok(verified.ok);
  assert.equal(verified.claims.d, true);
  assert.equal(verified.claims.k, "video");
});

test("ticket: tampering with either segment is rejected as INVALID_TICKET", async () => {
  const signer = await codec();
  const ticket = await issue(signer);
  const [body, mac] = ticket.split(".");
  const flip = (text: string, index: number) => text.slice(0, index) + (text[index] === "A" ? "B" : "A") + text.slice(index + 1);
  assert.deepEqual(await signer.verify(`${flip(body, 5)}.${mac}`), INVALID);
  assert.deepEqual(await signer.verify(`${body}.${flip(mac, 3)}`), INVALID);
  // Re-encoded claims that point elsewhere, flip the demo flag or extend the expiry keep the old MAC and fail.
  for (const change of [{ u: "https://evil.example/secret.jpg" }, { d: true }, { e: T0 / 1000 + 10 * TICKET_TTL_SECONDS }]) {
    const claims = { ...JSON.parse(Buffer.from(body, "base64url").toString("utf8")), ...change };
    assert.deepEqual(await signer.verify(`${Buffer.from(JSON.stringify(claims)).toString("base64url")}.${mac}`), INVALID, JSON.stringify(change));
  }
  const other = await issue(signer, video);
  assert.deepEqual(await signer.verify(`${body}.${other.split(".")[1]}`), INVALID);
  // The last MAC character carries two unused bits; a lenient decoder would accept this second spelling of the same bytes.
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  const respelled = mac.slice(0, -1) + alphabet[alphabet.indexOf(mac.at(-1) ?? "A") ^ 1];
  assert.equal(Buffer.from(respelled, "base64url").equals(Buffer.from(mac, "base64url")), true);
  assert.deepEqual(await signer.verify(`${body}.${respelled}`), INVALID);
  for (const malformed of ["", "abc", `${ticket}.`, `${body}.${mac}.${mac}`, `.${mac}`, `${body}.`, `${ticket}=`, `${body}+.${mac}`, "x".repeat(40_000), 42, null, undefined, {}]) {
    assert.deepEqual(await signer.verify(malformed), INVALID, String(malformed).slice(0, 40));
  }
});

test("ticket: expired tickets are refused with EXPIRED, one second earlier still passes, and forgery outranks expiry", async () => {
  const ticket = await issue(await codec());
  const at = async (ms: number) => (await codec(SECRET, () => ms)).verify(ticket);
  assert.equal((await at(T0 + (TICKET_TTL_SECONDS - 1) * 1000 + 999)).ok, true);
  assert.deepEqual(await at(T0 + TICKET_TTL_SECONDS * 1000), { ok: false, code: "EXPIRED" });
  assert.deepEqual(await at(T0 + 86_400_000), { ok: false, code: "EXPIRED" });
  const [body, mac] = ticket.split(".");
  const tampered = `${body}.${mac.slice(0, -2)}${mac.endsWith("AA") ? "BA" : "AA"}`;
  assert.deepEqual(await (await codec(SECRET, () => T0 + 86_400_000)).verify(tampered), INVALID);
});

test("ticket: a ticket of another kind is refused for the route", async () => {
  const signer = await codec();
  const videoTicket = await issue(signer, { ...image, url: "https://cdn.example.com/clip.mp4", kind: "video" });
  assert.deepEqual(await signer.verify(videoTicket, ["image"]), INVALID);
  assert.equal((await signer.verify(videoTicket, ["image", "video"])).ok, true);
  assert.deepEqual(await signer.verify(await issue(signer), ["video"]), INVALID);
});

test("ticket: rotating the key invalidates every outstanding ticket", async () => {
  const ticket = await issue(await codec());
  assert.deepEqual(await (await codec(OTHER_SECRET)).verify(ticket), INVALID);
  assert.equal((await (await codec(SECRET)).verify(ticket)).ok, true);
});

test("ticket: the key must be at least 32 bytes counted in UTF-8, otherwise it is a configuration error", async () => {
  for (const secret of [undefined, "", "a".repeat(31), "あ".repeat(10)]) {
    assert.deepEqual(await createTicketCodec(secret), { ok: false, code: "TICKET_KEY_INVALID" }, String(secret));
  }
  for (const secret of ["a".repeat(32), "あ".repeat(11)]) assert.equal((await createTicketCodec(secret)).ok, true, secret);
});

test("ticket: only canonical http(s) URLs up to 4,096 characters and a real page origin can be signed", async () => {
  const signer = await codec();
  const base = "https://cdn.example.com/";
  const longest = base + "a".repeat(4096 - base.length);
  assert.equal(longest.length, 4096);
  assert.equal((await signer.issue({ ...image, url: longest })).ok, true);
  for (const url of [`${longest}a`, "javascript:alert(1)", "data:image/png;base64,AAAA", "ftp://cdn.example.com/a.png", "blob:https://example.com/x",
    "/relative.png", "https://CDN.example.com/a.png", "https://user:pass@cdn.example.com/a.png", ""]) {
    assert.deepEqual(await signer.issue({ ...image, url }), { ok: false, code: "INVALID_INPUT" }, url.slice(0, 40));
  }
  for (const pageOrigin of ["https://example.com/page", "null", "example.com", "file:///tmp"]) {
    assert.deepEqual(await signer.issue({ ...image, pageOrigin }), { ok: false, code: "INVALID_INPUT" }, pageOrigin);
  }
  const notAKind = { ...image, kind: "stream" } as unknown as TicketInput;
  assert.deepEqual(await signer.issue(notAKind), { ok: false, code: "INVALID_INPUT" });
});

test("ticket: claims behind a valid MAC are still checked for version, shape and lifetime", async () => {
  const signer = await codec();
  const good = { v: 1, u: image.url, k: "image", o: image.pageOrigin, d: false, e: T0 / 1000 + 60 };
  assert.equal((await signer.verify(await forge(good))).ok, true);
  for (const bad of [{ ...good, v: 2 }, { ...good, extra: "x" }, { ...good, e: String(good.e) }, { ...good, e: T0 / 1000 + 2 * 3600 },
    { ...good, u: "javascript:alert(1)" }, { ...good, o: "https://example.com/path" }, { ...good, d: "false" }, [good]]) {
    assert.deepEqual(await signer.verify(await forge(bad)), INVALID, JSON.stringify(bad).slice(0, 60));
  }
});
