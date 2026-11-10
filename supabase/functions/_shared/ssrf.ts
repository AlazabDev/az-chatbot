// SSRF protection for outbound webhook dispatch.
// Validates a tenant-supplied URL: https only, public host, and every resolved
// IP address must be outside private/loopback/link-local/reserved ranges.

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata",
  "metadata.google.internal",
  "instance-data",
]);

function ipv4ToLong(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    value = value * 256 + n;
  }
  return value;
}

function isPrivateIPv4(ip: string): boolean {
  const long = ipv4ToLong(ip);
  if (long === null) return true; // unparseable => treat as unsafe
  const ranges: [string, number][] = [
    ["0.0.0.0", 8],
    ["10.0.0.0", 8],
    ["100.64.0.0", 10],
    ["127.0.0.0", 8],
    ["169.254.0.0", 16],
    ["172.16.0.0", 12],
    ["192.0.0.0", 24],
    ["192.168.0.0", 16],
    ["198.18.0.0", 15],
    ["224.0.0.0", 4],
    ["240.0.0.0", 4],
  ];
  for (const [base, bits] of ranges) {
    const baseLong = ipv4ToLong(base);
    if (baseLong === null) continue;
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    if ((long & mask) >>> 0 === (baseLong & mask) >>> 0) return true;
  }
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const addr = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (addr === "::" || addr === "::1") return true;
  if (addr.startsWith("fe80") || addr.startsWith("fc") || addr.startsWith("fd")) return true;
  if (addr.startsWith("ff")) return true; // multicast
  // IPv4-mapped (::ffff:a.b.c.d)
  const mapped = addr.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIPv4(mapped[1]);
  return false;
}

export function isPrivateAddress(ip: string): boolean {
  return ip.includes(":") ? isPrivateIPv6(ip) : isPrivateIPv4(ip);
}

export interface SsrfCheck {
  ok: boolean;
  reason?: string;
}

/**
 * Validate a webhook destination immediately before each dispatch.
 * DNS is resolved at call time so a previously-safe hostname cannot be
 * re-pointed at internal infrastructure after it was saved.
 */
export async function assertPublicWebhookUrl(rawUrl: string): Promise<SsrfCheck> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, reason: "invalid_url" };
  }

  if (url.protocol !== "https:") return { ok: false, reason: "https_required" };
  if (url.username || url.password) return { ok: false, reason: "credentials_in_url" };

  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (BLOCKED_HOSTNAMES.has(host) || host.endsWith(".local") || host.endsWith(".internal")) {
    return { ok: false, reason: "blocked_host" };
  }

  // Literal IP host
  const literal = host.replace(/^\[|\]$/g, "");
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(literal) || literal.includes(":")) {
    return isPrivateAddress(literal) ? { ok: false, reason: "private_ip" } : { ok: true };
  }

  const addresses: string[] = [];
  for (const recordType of ["A", "AAAA"] as const) {
    try {
      addresses.push(...(await Deno.resolveDns(host, recordType)));
    } catch {
      // record type may not exist; ignore
    }
  }
  if (!addresses.length) return { ok: false, reason: "dns_resolution_failed" };
  if (addresses.some((ip) => isPrivateAddress(ip))) return { ok: false, reason: "private_ip" };

  return { ok: true };
}
