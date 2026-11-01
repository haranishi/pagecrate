/**
 * The network a client address belongs to: the input of the rate-limit key (guard.ts deriveClientKey). Pure: no
 * network, no clock, no state. An IPv4 address stays as it is, an IPv4-mapped IPv6 address becomes the IPv4 address it
 * carries, and an IPv6 address is cut to its first 64 bits: one subscriber usually holds a whole /64 and could
 * otherwise send every request from a new address. Spellings of the same address (zero compression, case) give the
 * same value. An empty or malformed value gives one shared word, so all such requests share one bucket. The value is
 * only ever hashed by the caller; neither the address nor its network is kept.
 */
import ipaddr from "ipaddr.js";

/** Requests without a readable cf-connecting-ip (only possible off Cloudflare) share this one bucket. */
export const NO_CLIENT_ADDRESS = "no-client-address";
/** Prefix length an IPv6 client is grouped by. */
export const IPV6_CLIENT_PREFIX_BITS = 64;

export function clientNetwork(value: string | null | undefined): string {
  const text = value?.trim() ?? "";
  // Cloudflare writes plain dotted decimal. Legacy spellings (octal, hex, fewer parts) are not addresses here.
  if (ipaddr.IPv4.isValidFourPartDecimal(text)) return ipaddr.IPv4.parse(text).toString();
  if (!ipaddr.IPv6.isValid(text)) return NO_CLIENT_ADDRESS;
  const address = ipaddr.IPv6.parse(text);
  if (address.isIPv4MappedAddress()) return address.toIPv4Address().toString();
  // A new address from the first four 16-bit groups: the interface half and any zone index are dropped.
  const network = new ipaddr.IPv6([...address.parts.slice(0, IPV6_CLIENT_PREFIX_BITS / 16), 0, 0, 0, 0]);
  return `${network.toRFC5952String()}/${IPV6_CLIENT_PREFIX_BITS}`;
}
