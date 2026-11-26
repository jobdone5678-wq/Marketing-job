import * as http from 'node:http';
import * as https from 'node:https';
import * as net from 'node:net';
import * as tls from 'node:tls';
import * as dns from 'node:dns/promises';

export interface SafeAgentResult {
  agent: http.Agent | https.Agent;
  validatedUrl: string;
  targetIp: string;
  hostname: string;
  port: number;
  protocol: 'http:' | 'https:';
  redirect?: 'error';
}

export class SSRFError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'SSRFError';
    this.code = code;
  }
}

/**
 * Whitelist of approved remote AI providers for outbound proxy routing.
 */
export const APPROVED_DEFAULT_HOSTS = new Set<string>([
  'api.openai.com',
  'openrouter.ai',
  'api.deepseek.com',
  'api.groq.com',
  'api.mistral.ai',
  'api.xkiro.com',
  'api.cent-ai.dev',
]);

/**
 * Standard allowed outbound HTTP/HTTPS ports.
 */
export const ALLOWED_PORTS = new Set<number>([80, 443, 8080, 8443]);

/**
 * Hostnames blocked outright prior to DNS resolution.
 */
export const BLOCKED_HOSTNAMES = new Set<string>([
  'localhost',
  'metadata.google.internal',
  'metadata',
  'instance-data',
  '169.254.169.254',
]);

/**
 * Validates whether an IPv4 address belongs to a safe public range.
 */
function validateIPv4(ip: string): boolean {
  const parts = ip.split('.').map((p) => Number(p));
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    return false;
  }

  // 0.0.0.0/8 (This host on this network)
  if (parts[0] === 0) return false;

  // 10.0.0.0/8 (RFC 1918 Private)
  if (parts[0] === 10) return false;

  // 100.64.0.0/10 (Carrier-grade NAT, RFC 6598)
  if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return false;

  // 127.0.0.0/8 (Loopback)
  if (parts[0] === 127) return false;

  // 169.254.0.0/16 (Link-local / Cloud metadata, RFC 3927)
  if (parts[0] === 169 && parts[1] === 254) return false;

  // 172.16.0.0/12 (RFC 1918 Private: 172.16.0.0 - 172.31.255.255)
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return false;

  // 192.0.0.0/24 (IETF Protocol Assignments)
  if (parts[0] === 192 && parts[1] === 0 && parts[2] === 0) return false;

  // 192.0.2.0/24 (TEST-NET-1)
  if (parts[0] === 192 && parts[1] === 0 && parts[2] === 2) return false;

  // 192.168.0.0/16 (RFC 1918 Private)
  if (parts[0] === 192 && parts[1] === 168) return false;

  // 198.18.0.0/15 (Network benchmark tests)
  if (parts[0] === 198 && (parts[1] === 18 || parts[1] === 19)) return false;

  // 198.51.100.0/24 (TEST-NET-2)
  if (parts[0] === 198 && parts[1] === 51 && parts[2] === 100) return false;

  // 203.0.113.0/24 (TEST-NET-3)
  if (parts[0] === 203 && parts[1] === 0 && parts[2] === 113) return false;

  // 224.0.0.0/4 (Multicast: 224.0.0.0 - 239.255.255.255) & 240.0.0.0/4 (Reserved / Broadcast: 240.0.0.0 - 255.255.255.255)
  if (parts[0] >= 224) return false;

  return true;
}

/**
 * Expands any valid IPv6 address into exactly 8 16-bit integers.
 */
function parseIPv6Words(ip: string): number[] | null {
  let clean = ip.replace(/^\[|\]$/g, '').trim().toLowerCase();

  // Handle embedded IPv4 notation (e.g. ::ffff:192.168.1.1)
  if (clean.includes('.')) {
    const lastColon = clean.lastIndexOf(':');
    if (lastColon === -1) return null;
    const ipv4Part = clean.slice(lastColon + 1);
    const octets = ipv4Part.split('.').map((p) => Number(p));
    if (octets.length !== 4 || octets.some((n) => isNaN(n) || n < 0 || n > 255)) {
      return null;
    }
    const hex1 = (((octets[0] << 8) | octets[1]) >>> 0).toString(16);
    const hex2 = (((octets[2] << 8) | octets[3]) >>> 0).toString(16);
    clean = clean.slice(0, lastColon) + ':' + hex1 + ':' + hex2;
  }

  const halves = clean.split('::');
  if (halves.length > 2) return null;

  let words: number[];
  if (halves.length === 2) {
    const left = halves[0] ? halves[0].split(':') : [];
    const right = halves[1] ? halves[1].split(':') : [];
    const missing = 8 - (left.length + right.length);
    if (missing < 1) return null;
    const mid = Array(missing).fill('0');
    const all = [...left, ...mid, ...right];
    if (all.length !== 8) return null;
    words = all.map((w) => parseInt(w, 16));
  } else {
    const parts = clean.split(':');
    if (parts.length !== 8) return null;
    words = parts.map((w) => parseInt(w, 16));
  }

  if (words.some((w) => isNaN(w) || w < 0 || w > 0xffff)) {
    return null;
  }
  return words;
}

/**
 * Validates whether an IPv6 address belongs to a safe public range.
 */
function validateIPv6(ip: string): boolean {
  const words = parseIPv6Words(ip);
  if (!words || words.length !== 8) return false;

  // ::/128 (Unspecified address)
  if (words.every((w) => w === 0)) return false;

  // ::1/128 (Loopback)
  if (words.slice(0, 7).every((w) => w === 0) && words[7] === 1) return false;

  // fc00::/7 (Unique local address / ULA: fc00:: - fdff::)
  if ((words[0] & 0xfe00) === 0xfc00) return false;

  // fe80::/10 (Link-local unicast)
  if ((words[0] & 0xffc0) === 0xfe80) return false;

  // fec0::/10 (Site-local, deprecated RFC 3879)
  if ((words[0] & 0xffc0) === 0xfec0) return false;

  // ff00::/8 (Multicast)
  if ((words[0] & 0xff00) === 0xff00) return false;

  // 100::/64 (Discard prefix, RFC 6666)
  if (words[0] === 0x0100 && words[1] === 0 && words[2] === 0 && words[3] === 0) return false;

  // 2001:db8::/32 (Documentation prefix)
  if (words[0] === 0x2001 && words[1] === 0x0db8) return false;

  // 2002::/16 (6to4 transition prefix: contains embedded IPv4)
  if (words[0] === 0x2002) {
    const o1 = (words[1] >> 8) & 0xff;
    const o2 = words[1] & 0xff;
    const o3 = (words[2] >> 8) & 0xff;
    const o4 = words[2] & 0xff;
    if (!validateIPv4(`${o1}.${o2}.${o3}.${o4}`)) return false;
  }

  // IPv4-mapped (::ffff:0:0/96) or IPv4-compatible (::/96)
  const isIpv4Mapped =
    words.slice(0, 5).every((w) => w === 0) ||
    (words.slice(0, 4).every((w) => w === 0) && words[4] === 0 && words[5] === 0xffff) ||
    (words.slice(0, 5).every((w) => w === 0) && words[5] === 0xffff);

  if (isIpv4Mapped) {
    const o1 = (words[6] >> 8) & 0xff;
    const o2 = words[6] & 0xff;
    const o3 = (words[7] >> 8) & 0xff;
    const o4 = words[7] & 0xff;
    if (!validateIPv4(`${o1}.${o2}.${o3}.${o4}`)) return false;
  }

  return true;
}

/**
 * Validates whether an IP address (IPv4 or IPv6) is a safe public routable IP.
 * Returns false if the IP is private, loopback, link-local, cloud metadata, multicast, or invalid.
 */
export function validateOutboundIp(ip: string): boolean {
  if (!ip || typeof ip !== 'string') return false;
  const clean = ip.replace(/^\[|\]$/g, '').trim();
  const family = net.isIP(clean);
  if (family === 4) {
    return validateIPv4(clean);
  }
  if (family === 6) {
    return validateIPv6(clean);
  }
  return false;
}

export type DnsLookupFn = (
  host: string,
  opts: { all: true },
) => Promise<Array<{ address: string; family: number }>>;

/**
 * Resolves a hostname to all IP addresses and ensures EVERY resolved IP is safe.
 * Throws SSRFError if any resolved IP belongs to a blocked range or if resolution fails.
 */
export async function resolveAndValidateHost(
  hostname: string,
  dnsLookup: DnsLookupFn = (host, opts) => dns.lookup(host, opts),
): Promise<string[]> {
  if (!hostname || typeof hostname !== 'string') {
    throw new SSRFError('Hostname must be a non-empty string', 'INVALID_URL');
  }

  const cleanHost = hostname.replace(/^\[|\]$/g, '').trim().toLowerCase();
  if (!cleanHost) {
    throw new SSRFError('Hostname cannot be empty', 'INVALID_URL');
  }

  if (BLOCKED_HOSTNAMES.has(cleanHost) || cleanHost.endsWith('.localhost')) {
    throw new SSRFError(`Destination hostname "${hostname}" is blocked.`, 'BLOCKED_HOST');
  }

  // If hostname is already an IP literal
  if (net.isIP(cleanHost) !== 0) {
    if (!validateOutboundIp(cleanHost)) {
      throw new SSRFError(`Destination IP address "${cleanHost}" is blocked.`, 'BLOCKED_IP');
    }
    return [cleanHost];
  }

  let addresses: Array<{ address: string; family: number }>;
  try {
    addresses = await dnsLookup(cleanHost, { all: true });
  } catch (err: any) {
    throw new SSRFError(
      `DNS resolution failed for "${cleanHost}": ${err?.message || String(err)}`,
      'DNS_RESOLUTION_FAILED',
    );
  }

  if (!addresses || addresses.length === 0) {
    throw new SSRFError(`DNS resolution returned no addresses for "${cleanHost}".`, 'DNS_RESOLUTION_FAILED');
  }

  const safeIps: string[] = [];
  for (const entry of addresses) {
    const ip = entry.address;
    if (!validateOutboundIp(ip)) {
      throw new SSRFError(
        `Destination host "${cleanHost}" resolved to blocked IP address "${ip}".`,
        'BLOCKED_IP',
      );
    }
    safeIps.push(ip);
  }

  return safeIps;
}

export interface SafeHttpAgentOptions extends http.AgentOptions {
  netConnect?: typeof net.connect;
}

export interface SafeHttpsAgentOptions extends https.AgentOptions {
  netConnect?: typeof net.connect;
  tlsConnect?: typeof tls.connect;
}

/**
 * Safe HTTP Agent that overrides createConnection to bind raw TCP socket
 * strictly to the verified target IP, defeating TOCTOU DNS rebinding.
 */
export class SafeHttpAgent extends http.Agent {
  readonly targetIp: string;
  readonly targetPort: number;
  private readonly netConnect: typeof net.connect;

  constructor(targetIp: string, targetPort: number, options?: SafeHttpAgentOptions) {
    const { netConnect, ...agentOptions } = options || {};
    super({ keepAlive: false, ...agentOptions });
    this.targetIp = targetIp;
    this.targetPort = targetPort;
    this.netConnect = netConnect || net.connect;
  }

  override createConnection(
    options: http.ClientRequestArgs,
    cb?: (err: Error | null, socket: net.Socket) => void,
  ): net.Socket {
    const socket = this.netConnect({
      host: this.targetIp,
      port: this.targetPort,
    });

    if (cb && socket && typeof socket.once === 'function') {
      socket.once('connect', () => cb(null, socket));
      socket.once('error', (err) => cb(err, socket));
    }

    return socket;
  }
}

/**
 * Safe HTTPS Agent that overrides createConnection to bind raw TCP socket
 * to the verified target IP, then wraps with TLS preserving SNI hostname verification.
 */
export class SafeHttpsAgent extends https.Agent {
  readonly targetIp: string;
  readonly hostname: string;
  readonly targetPort: number;
  private readonly netConnect: typeof net.connect;
  private readonly tlsConnect: typeof tls.connect;

  constructor(targetIp: string, hostname: string, targetPort: number, options?: SafeHttpsAgentOptions) {
    const { netConnect, tlsConnect, ...agentOptions } = options || {};
    super({ keepAlive: false, ...agentOptions });
    this.targetIp = targetIp;
    this.hostname = hostname;
    this.targetPort = targetPort;
    this.netConnect = netConnect || net.connect;
    this.tlsConnect = tlsConnect || tls.connect;
  }

  override createConnection(
    options: https.RequestOptions,
    cb?: (err: Error | null, socket: net.Socket) => void,
  ): net.Socket {
    const rawSocket = this.netConnect({
      host: this.targetIp,
      port: this.targetPort,
    });

    const { host, port, servername, socket, ...restOptions } = (options as any) || {};

    const tlsSocket = this.tlsConnect(
      {
        ...restOptions,
        socket: rawSocket,
        servername: this.hostname,
      },
      cb ? () => cb(null, tlsSocket) : undefined,
    );

    return tlsSocket;
  }
}

export interface CreateSafeAgentOptions {
  allowCustom?: boolean;
  dnsLookup?: DnsLookupFn;
  netConnect?: typeof net.connect;
  tlsConnect?: typeof tls.connect;
}

/**
 * Creates a safe http.Agent or https.Agent bound to a validated public IP address,
 * ensuring immunity against SSRF and DNS rebinding attacks while preserving TLS hostname SNI.
 */
export async function createSafeAgent(
  rawUrl: string,
  options?: CreateSafeAgentOptions,
): Promise<SafeAgentResult> {
  if (!rawUrl || typeof rawUrl !== 'string') {
    throw new SSRFError('URL must be a non-empty string', 'INVALID_URL');
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    throw new SSRFError(`Invalid URL: "${rawUrl}"`, 'INVALID_URL');
  }

  const protocol = parsedUrl.protocol;
  if (protocol !== 'http:' && protocol !== 'https:') {
    throw new SSRFError(
      `Disallowed protocol "${protocol}". Only "http:" and "https:" are permitted.`,
      'INVALID_PROTOCOL',
    );
  }

  const port = parsedUrl.port ? parseInt(parsedUrl.port, 10) : (protocol === 'https:' ? 443 : 80);
  if (!ALLOWED_PORTS.has(port)) {
    throw new SSRFError(
      `Disallowed port "${port}". Only ports 80, 443, 8080, and 8443 are permitted.`,
      'DISALLOWED_PORT',
    );
  }

  const rawHostname = parsedUrl.hostname;
  if (!rawHostname) {
    throw new SSRFError('URL must contain a valid hostname', 'INVALID_URL');
  }

  const cleanHost = rawHostname.replace(/^\[|\]$/g, '').trim().toLowerCase();
  const isIp = net.isIP(cleanHost) !== 0;

  // Immediate blocklist check
  if (BLOCKED_HOSTNAMES.has(cleanHost) || cleanHost.endsWith('.localhost')) {
    throw new SSRFError(`Destination hostname "${rawHostname}" is blocked.`, 'BLOCKED_HOST');
  }

  // Immediate IP check if the hostname is an IP literal
  if (isIp && !validateOutboundIp(cleanHost)) {
    throw new SSRFError(`Destination IP "${cleanHost}" is in a blocked range.`, 'BLOCKED_IP');
  }

  // Destination whitelist check for server proxying (unless allowCustom: true)
  if (!options?.allowCustom && !APPROVED_DEFAULT_HOSTS.has(cleanHost)) {
    throw new SSRFError(
      `Host "${rawHostname}" is not in the approved provider whitelist. Specify allowCustom: true to permit custom destinations.`,
      'DISALLOWED_HOST',
    );
  }

  // Resolve and validate all resolved IPs
  const validatedIps = await resolveAndValidateHost(cleanHost, options?.dnsLookup);
  const targetIp = validatedIps[0];

  const agent = protocol === 'https:'
    ? new SafeHttpsAgent(targetIp, cleanHost, port, {
        netConnect: options?.netConnect,
        tlsConnect: options?.tlsConnect,
      })
    : new SafeHttpAgent(targetIp, port, {
        netConnect: options?.netConnect,
      });

  return {
    agent,
    validatedUrl: parsedUrl.toString(),
    targetIp,
    hostname: cleanHost,
    port,
    protocol: protocol as 'http:' | 'https:',
    redirect: 'error',
  };
}
