import { test } from "node:test";
import assert from "node:assert/strict";
import { clientNetwork, IPV6_CLIENT_PREFIX_BITS, NO_CLIENT_ADDRESS } from "../src/lib/client-network";

test("client network: IPv4 stays as it is, IPv4-mapped IPv6 becomes that IPv4, IPv6 is cut to its /64", () => {
  assert.equal(IPV6_CLIENT_PREFIX_BITS, 64);
  assert.equal(clientNetwork("203.0.113.7"), "203.0.113.7");
  assert.equal(clientNetwork("  203.0.113.7\t"), "203.0.113.7");
  assert.notEqual(clientNetwork("203.0.113.8"), clientNetwork("203.0.113.7"));
  for (const mapped of ["::ffff:203.0.113.7", "::FFFF:203.0.113.7", "::ffff:cb00:7107", "0:0:0:0:0:ffff:cb00:7107"]) {
    assert.equal(clientNetwork(mapped), "203.0.113.7", mapped);
  }
  for (let index = 1; index <= 5; index += 1) assert.equal(clientNetwork(`2001:db8:1:1::${index}`), "2001:db8:1:1::/64");
  // Zero compression, leading zeros, case, the interface half and a zone index do not change the network.
  for (const spelling of ["2001:DB8:1:1:0:0:0:1", "2001:0db8:0001:0001:0000:0000:0000:0001", "2001:db8:1:1:ffff:ffff:ffff:ffff", "2001:db8:1:1::203.0.113.7", "2001:db8:1:1::1%eth0"]) {
    assert.equal(clientNetwork(spelling), "2001:db8:1:1::/64", spelling);
  }
  assert.equal(clientNetwork("2001:db8:1:2::1"), "2001:db8:1:2::/64");
  assert.equal(clientNetwork("2001:db8:0:0:1::1"), "2001:db8::/64");
});

test("client network: an empty or malformed value is the one shared word, never the raw text", () => {
  assert.equal(NO_CLIENT_ADDRESS, "no-client-address");
  const malformed = [null, undefined, "", "   ", "not-an-ip", "203.0.113", "203.0.113.007", "0x7f.0.0.1", "2130706433", "203.0.113.256",
    "[2001:db8::1]", "2001:db8::1::2", "203.0.113.7, 198.51.100.1"];
  for (const value of malformed) assert.equal(clientNetwork(value), NO_CLIENT_ADDRESS, String(value));
});
