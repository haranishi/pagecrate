import { test } from "node:test";
import assert from "node:assert/strict";
import { createBlockedHostMatcher } from "../src/lib/guard";
import { createSafeFetcher, type Address, type SafeResponse } from "../src/lib/safe-fetch";

const publicAddress: Address = { address: "8.8.8.8", family: 4 };

/** Safe fetcher over recording fakes: `redirects` maps a URL to the Location it answers with (others answer 200). */
function recordingFetcher(redirects: Record<string, string> = {}) {
  const resolved: string[] = [];
  const fetched: string[] = [];
  const fetcher = createSafeFetcher(async hostname => { resolved.push(hostname); return [publicAddress]; }, async (url): Promise<SafeResponse> => {
    fetched.push(url.href);
    const location = redirects[url.href];
    return location
      ? { status: 302, headers: { location }, body: Buffer.alloc(0), url: url.href }
      : { status: 200, headers: { "content-type": "image/png" }, body: Buffer.from("synthetic"), url: url.href };
  });
  return { fetcher, resolved, fetched };
}

test("safe fetch: a blocked first URL is refused with BLOCKED_HOST before any DNS lookup or connection", async () => {
  const { fetcher, resolved, fetched } = recordingFetcher();
  const asked: string[] = [];
  await assert.rejects(fetcher("https://Blocked.Example./photo.png", { isBlockedHost: host => { asked.push(host); return host === "blocked.example"; } }), { code: "BLOCKED_HOST", status: 403 });
  assert.deepEqual(asked, ["blocked.example"]);
  assert.deepEqual(resolved, []);
  assert.deepEqual(fetched, []);
});

test("safe fetch: a redirect to a blocked host is refused mid-chain, and the blocked hop gets no DNS lookup or connection", async () => {
  const { fetcher, resolved, fetched } = recordingFetcher({
    "https://start.example/a": "https://hop.example/b",
    "https://hop.example/b": "https://cdn.blocked.example/c.png",
  });
  await assert.rejects(fetcher("https://start.example/a", { isBlockedHost: createBlockedHostMatcher(["blocked.example"]).isBlocked }), { code: "BLOCKED_HOST", status: 403 });
  assert.deepEqual(fetched, ["https://start.example/a", "https://hop.example/b"]);
  assert.deepEqual(resolved, ["start.example", "hop.example"]);
  // With redirects: 0 the target is only reported, and it is still checked first.
  const single = recordingFetcher({ "https://start.example/a": "https://blocked.example/c.png" });
  await assert.rejects(single.fetcher("https://start.example/a", { redirects: 0, isBlockedHost: host => host === "blocked.example" }), { code: "BLOCKED_HOST" });
  assert.deepEqual(single.resolved, ["start.example"]);
  const reported = await recordingFetcher({ "https://start.example/a": "https://blocked.example/c.png" }).fetcher("https://start.example/a", { redirects: 0 });
  assert.equal(reported.headers.location, "https://blocked.example/c.png");
});

test("safe fetch: the predicate gets a normalized host, and a throwing or non-false predicate blocks", async () => {
  const asked: string[] = [];
  const allowAll = (host: string) => { asked.push(host); return false; };
  const { fetcher } = recordingFetcher();
  for (const url of ["https://CDN.Example.org./a.png", "https://[2606:4700:4700::1111]/a.png", "https://例え.jp/a.png"]) await fetcher(url, { isBlockedHost: allowAll });
  assert.deepEqual(asked, ["cdn.example.org", "2606:4700:4700::1111", "xn--r8jz45g.jp"]);
  const odd = recordingFetcher();
  await assert.rejects(odd.fetcher("https://cdn.example.org/a.png", { isBlockedHost: () => { throw new Error("predicate failed"); } }), { code: "BLOCKED_HOST" });
  await assert.rejects(odd.fetcher("https://cdn.example.org/a.png", { isBlockedHost: (() => undefined) as unknown as (host: string) => boolean }), { code: "BLOCKED_HOST" });
  assert.deepEqual([odd.resolved, odd.fetched], [[], []]);
});

test("safe fetch: without the predicate, or with one that allows the hosts, redirects are followed as before", async () => {
  const chain = { "https://start.example/a": "https://cdn.blocked.example/c.png" };
  const plain = recordingFetcher(chain);
  const response = await plain.fetcher("https://start.example/a");
  assert.equal(response.status, 200);
  assert.equal(response.url, "https://cdn.blocked.example/c.png");
  assert.deepEqual(plain.fetched, ["https://start.example/a", "https://cdn.blocked.example/c.png"]);
  const allowed = recordingFetcher(chain);
  assert.equal((await allowed.fetcher("https://start.example/a", { isBlockedHost: createBlockedHostMatcher(["other.example"]).isBlocked })).status, 200);
  assert.deepEqual(allowed.fetched, plain.fetched);
});

test("safe fetch with the guard's matcher: subdomains and either IDN spelling are refused, look-alike hosts pass", async () => {
  const isBlockedHost = createBlockedHostMatcher(["blocked.example", "例え.jp"]).isBlocked;
  for (const url of ["https://img.blocked.example/a.png", "https://xn--r8jz45g.jp/a.png", "https://sub.例え.jp/a.png"]) {
    const { fetcher, resolved } = recordingFetcher();
    await assert.rejects(fetcher(url, { isBlockedHost }), { code: "BLOCKED_HOST" }, url);
    assert.deepEqual(resolved, [], url);
  }
  for (const url of ["https://notblocked.example/a.png", "https://blocked.example.org/a.png", "https://xn--r8jz45g.jp.example/a.png"]) {
    assert.equal((await recordingFetcher().fetcher(url, { isBlockedHost })).status, 200, url);
  }
});
