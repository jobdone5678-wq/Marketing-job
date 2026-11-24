import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import tls from 'node:tls';
import http from 'node:http';
import https from 'node:https';
import {
  validateOutboundIp,
  resolveAndValidateHost,
  createSafeAgent,
  SSRFError,
  APPROVED_DEFAULT_HOSTS,
} from '../../src/lib/ai/ssrf-guard.ts';

test('SSRF Guard: IP blocklist and validation', async (t) => {
  await t.test('validates safe public IPv4 addresses', () => {
    assert.equal(validateOutboundIp('8.8.8.8'), true);
    assert.equal(validateOutboundIp('1.1.1.1'), true);
    assert.equal(validateOutboundIp('93.184.216.34'), true);
    // Cloudflare public IP in 172.64.0.0/13 (not in 172.16.0.0/12)
    assert.equal(validateOutboundIp('172.66.0.243'), true);
    assert.equal(validateOutboundIp('172.64.149.20'), true);
  });

  await t.test('validates safe public IPv6 addresses', () => {
    // Cloudflare DNS IPv6
    assert.equal(validateOutboundIp('2606:4700:4700::1111'), true);
    // Google DNS IPv6
    assert.equal(validateOutboundIp('2001:4860:4860::8888'), true);
  });

  await t.test('blocks IPv4 loopback addresses (127.0.0.0/8)', () => {
    assert.equal(validateOutboundIp('127.0.0.1'), false);
    assert.equal(validateOutboundIp('127.0.0.2'), false);
    assert.equal(validateOutboundIp('127.255.255.255'), false);
    assert.equal(validateOutboundIp('127.1.2.3'), false);
  });

  await t.test('blocks IPv6 loopback address (::1)', () => {
    assert.equal(validateOutboundIp('::1'), false);
    assert.equal(validateOutboundIp('0:0:0:0:0:0:0:1'), false);
  });

  await t.test('blocks RFC 1918 private IPv4 addresses', () => {
    // 10.0.0.0/8
    assert.equal(validateOutboundIp('10.0.0.1'), false);
    assert.equal(validateOutboundIp('10.255.255.254'), false);
    // 172.16.0.0/12 (172.16.0.0 - 172.31.255.255)
    assert.equal(validateOutboundIp('172.16.0.1'), false);
    assert.equal(validateOutboundIp('172.16.0.5'), false);
    assert.equal(validateOutboundIp('172.24.0.1'), false);
    assert.equal(validateOutboundIp('172.31.255.254'), false);
    // 192.168.0.0/16
    assert.equal(validateOutboundIp('192.168.0.1'), false);
    assert.equal(validateOutboundIp('192.168.1.1'), false);
    assert.equal(validateOutboundIp('192.168.254.254'), false);
  });

  await t.test('blocks cloud metadata and link-local IPv4 addresses (169.254.0.0/16)', () => {
    assert.equal(validateOutboundIp('169.254.169.254'), false);
    assert.equal(validateOutboundIp('169.254.0.1'), false);
    assert.equal(validateOutboundIp('169.254.255.254'), false);
  });

  await t.test('blocks IPv6 link-local (fe80::/10) and unique local (fc00::/7)', () => {
    assert.equal(validateOutboundIp('fe80::1'), false);
    assert.equal(validateOutboundIp('fe80::a00:27ff:fe8a:7c42'), false);
    assert.equal(validateOutboundIp('fc00::1'), false);
    assert.equal(validateOutboundIp('fd00::1'), false);
    assert.equal(validateOutboundIp('fd12:3456:789a:1::1'), false);
  });

  await t.test('blocks IPv4-mapped IPv6 addresses for loopback, private, and metadata ranges', () => {
    assert.equal(validateOutboundIp('::ffff:127.0.0.1'), false);
    assert.equal(validateOutboundIp('::ffff:10.0.0.1'), false);
    assert.equal(validateOutboundIp('::ffff:172.16.0.5'), false);
    assert.equal(validateOutboundIp('::ffff:192.168.1.1'), false);
    assert.equal(validateOutboundIp('::ffff:169.254.169.254'), false);
    // Also test hex-formatted IPv4-mapped representations
    assert.equal(validateOutboundIp('::ffff:7f00:1'), false);
    assert.equal(validateOutboundIp('::ffff:a00:1'), false);
    assert.equal(validateOutboundIp('::ffff:a9fe:a9fe'), false);
  });

  await t.test('blocks zero, broadcast, multicast, and carrier-grade NAT addresses', () => {
    assert.equal(validateOutboundIp('0.0.0.0'), false);
    assert.equal(validateOutboundIp('0.0.0.1'), false);
    assert.equal(validateOutboundIp('255.255.255.255'), false);
    assert.equal(validateOutboundIp('224.0.0.1'), false); // Multicast
    assert.equal(validateOutboundIp('240.0.0.1'), false); // Reserved Class E
    assert.equal(validateOutboundIp('100.64.0.1'), false); // CGNAT
    assert.equal(validateOutboundIp('::'), false); // Unspecified IPv6
    assert.equal(validateOutboundIp('ff02::1'), false); // IPv6 multicast
  });

  await t.test('returns false for invalid IP strings and hostnames', () => {
    assert.equal(validateOutboundIp('localhost'), false);
    assert.equal(validateOutboundIp('metadata.google.internal'), false);
    assert.equal(validateOutboundIp('not.an.ip.address'), false);
    assert.equal(validateOutboundIp(''), false);
    assert.equal(validateOutboundIp('999.999.999.999'), false);
  });
});

test('SSRF Guard: DNS resolution and host validation', async (t) => {
  await t.test('resolves and validates approved remote hosts', async () => {
    const ips = await resolveAndValidateHost('api.openai.com');
    assert.ok(Array.isArray(ips) && ips.length > 0);
    for (const ip of ips) {
      assert.equal(validateOutboundIp(ip), true, `Resolved IP ${ip} must be safe`);
    }
  });

  await t.test('immediately blocks localhost and internal cloud metadata hostnames', async () => {
    await assert.rejects(
      async () => resolveAndValidateHost('localhost'),
      (err) => {
        assert.ok(err instanceof SSRFError);
        assert.ok(['BLOCKED_HOST', 'BLOCKED_IP'].includes(err.code));
        return true;
      },
    );

    await assert.rejects(
      async () => resolveAndValidateHost('metadata.google.internal'),
      (err) => {
        assert.ok(err instanceof SSRFError);
        assert.ok(['BLOCKED_HOST', 'BLOCKED_IP', 'DNS_RESOLUTION_FAILED'].includes(err.code));
        return true;
      },
    );
  });

  await t.test('blocks hostnames that resolve to private or loopback IPs', async () => {
    // Custom mock lookup that resolves to loopback IP
    const mockLookup = async () => [{ address: '127.0.0.1', family: 4 }];

    await assert.rejects(
      async () => resolveAndValidateHost('rebind.attacker.test', mockLookup),
      (err) => {
        assert.ok(err instanceof SSRFError);
        assert.equal(err.code, 'BLOCKED_IP');
        return true;
      },
    );
  });

  await t.test('blocks hostnames that resolve to mixed public and private IPs (dual-homed attack)', async () => {
    // Even if one IP is safe, ANY internal IP must trigger rejection
    const mockLookup = async () => [
      { address: '93.184.216.34', family: 4 },
      { address: '10.0.0.1', family: 4 },
    ];

    await assert.rejects(
      async () => resolveAndValidateHost('dual-homed.attacker.test', mockLookup),
      (err) => {
        assert.ok(err instanceof SSRFError);
        assert.equal(err.code, 'BLOCKED_IP');
        return true;
      },
    );
  });

  await t.test('throws DNS_RESOLUTION_FAILED on non-resolvable domain', async () => {
    const mockLookup = async () => {
      const err = new Error('getaddrinfo ENOTFOUND definitely-non-existent-domain-12345.test');
      err.code = 'ENOTFOUND';
      throw err;
    };

    await assert.rejects(
      async () => resolveAndValidateHost('definitely-non-existent-domain-12345.test', mockLookup),
      (err) => {
        assert.ok(err instanceof SSRFError);
        assert.equal(err.code, 'DNS_RESOLUTION_FAILED');
        return true;
      },
    );
  });
});

test('SSRF Guard: createSafeAgent destination policies & URL enforcement', async (t) => {
  await t.test('accepts all default approved provider destinations', async () => {
    const approvedUrls = [
      'https://api.openai.com/v1',
      'https://openrouter.ai/api/v1',
      'https://api.deepseek.com/v1',
      'https://api.groq.com/openai/v1',
      'https://api.mistral.ai/v1',
      'https://api.xkiro.com/v1',
    ];

    for (const url of approvedUrls) {
      const result = await createSafeAgent(url);
      assert.ok(result.agent, `Agent must be created for ${url}`);
      assert.equal(result.protocol, 'https:');
      assert.equal(result.port, 443);
      assert.ok(validateOutboundIp(result.targetIp), `Target IP ${result.targetIp} must be safe`);
      assert.equal(result.redirect, 'error', 'Must specify redirect error to prevent automatic redirects');
    }
  });

  await t.test('rejects unapproved host when allowCustom is not set', async () => {
    await assert.rejects(
      async () => createSafeAgent('https://custom-unapproved-provider.com/v1'),
      (err) => {
        assert.ok(err instanceof SSRFError);
        assert.equal(err.code, 'DISALLOWED_HOST');
        return true;
      },
    );
  });

  await t.test('allows custom host when allowCustom: true is passed and IP is safe', async () => {
    // Cloudflare public DNS
    const result = await createSafeAgent('https://cloudflare-dns.com/dns-query', { allowCustom: true });
    assert.ok(result.agent);
    assert.equal(result.hostname, 'cloudflare-dns.com');
    assert.ok(validateOutboundIp(result.targetIp));
  });

  await t.test('blocks loopback URLs: 127.0.0.1, localhost, and [::1]', async () => {
    const loopbacks = [
      'http://127.0.0.1',
      'http://127.0.0.1:80',
      'http://localhost:11434',
      'http://[::1]',
      'http://[::1]:8080',
    ];

    for (const url of loopbacks) {
      await assert.rejects(
        async () => createSafeAgent(url, { allowCustom: true }),
        (err) => {
          assert.ok(err instanceof SSRFError, `Expected SSRFError for ${url}, got ${err.name}`);
          assert.ok(
            ['BLOCKED_IP', 'BLOCKED_HOST', 'DISALLOWED_PORT', 'DISALLOWED_HOST'].includes(err.code),
            `Unexpected error code: ${err.code} for ${url}`,
          );
          return true;
        },
      );
    }
  });

  await t.test('blocks RFC 1918 private IP URLs', async () => {
    const privateUrls = [
      'http://10.0.0.1',
      'http://172.16.0.5',
      'http://192.168.1.1',
      'https://192.168.0.100:8443',
    ];

    for (const url of privateUrls) {
      await assert.rejects(
        async () => createSafeAgent(url, { allowCustom: true }),
        (err) => {
          assert.ok(err instanceof SSRFError);
          assert.equal(err.code, 'BLOCKED_IP');
          return true;
        },
      );
    }
  });

  await t.test('blocks cloud metadata URLs: 169.254.169.254 and metadata.google.internal', async () => {
    const metadataUrls = [
      'http://169.254.169.254',
      'http://169.254.169.254/latest/meta-data/',
      'http://metadata.google.internal',
      'http://metadata.google.internal/computeMetadata/v1/',
    ];

    for (const url of metadataUrls) {
      await assert.rejects(
        async () => createSafeAgent(url, { allowCustom: true }),
        (err) => {
          assert.ok(err instanceof SSRFError);
          assert.ok(['BLOCKED_IP', 'BLOCKED_HOST'].includes(err.code));
          return true;
        },
      );
    }
  });

  await t.test('blocks IPv4-mapped IPv6 URLs: http://[::ffff:127.0.0.1]', async () => {
    const mappedUrls = [
      'http://[::ffff:127.0.0.1]',
      'http://[::ffff:10.0.0.1]',
      'http://[::ffff:169.254.169.254]',
    ];

    for (const url of mappedUrls) {
      await assert.rejects(
        async () => createSafeAgent(url, { allowCustom: true }),
        (err) => {
          assert.ok(err instanceof SSRFError);
          assert.equal(err.code, 'BLOCKED_IP');
          return true;
        },
      );
    }
  });

  await t.test('enforces strict protocol restrictions: rejects file, ftp, gopher', async () => {
    const nonHttpUrls = [
      'file:///etc/passwd',
      'ftp://ftp.example.com/file.txt',
      'gopher://gopher.floodgap.com',
      'ws://api.openai.com/v1',
    ];

    for (const url of nonHttpUrls) {
      await assert.rejects(
        async () => createSafeAgent(url, { allowCustom: true }),
        (err) => {
          assert.ok(err instanceof SSRFError);
          assert.equal(err.code, 'INVALID_PROTOCOL');
          return true;
        },
      );
    }
  });

  await t.test('enforces strict port restrictions: permits only 80, 443, 8080, 8443', async () => {
    // Non-standard ports should be rejected
    const badPortUrls = [
      'https://cloudflare-dns.com:22', // SSH
      'https://cloudflare-dns.com:25', // SMTP
      'https://cloudflare-dns.com:3306', // MySQL
      'https://cloudflare-dns.com:11434', // Ollama
    ];

    for (const url of badPortUrls) {
      await assert.rejects(
        async () => createSafeAgent(url, { allowCustom: true }),
        (err) => {
          assert.ok(err instanceof SSRFError);
          assert.equal(err.code, 'DISALLOWED_PORT');
          return true;
        },
      );
    }

    // Permitted ports: 80, 443, 8080, 8443
    const goodPortUrls = [
      'https://cloudflare-dns.com:443/dns-query',
      'http://cloudflare-dns.com:80/dns-query',
      'https://cloudflare-dns.com:8443/dns-query',
      'http://cloudflare-dns.com:8080/dns-query',
    ];

    for (const url of goodPortUrls) {
      const result = await createSafeAgent(url, { allowCustom: true });
      assert.ok(result.agent);
    }
  });
});

test('SSRF Guard: Socket IP binding & TLS SNI preservation (DNS rebinding immunity)', async (t) => {
  await t.test('agent createConnection binds raw socket to validated IP with host port', async () => {
    const mockPublicIp = '93.184.216.34';
    const mockLookup = async () => [{ address: mockPublicIp, family: 4 }];

    let netConnectArgs = null;
    const dummySocket = new net.Socket();
    const mockNetConnect = (options) => {
      netConnectArgs = options;
      return dummySocket;
    };

    const result = await createSafeAgent('http://example-mock-provider.com:8080/v1', {
      allowCustom: true,
      dnsLookup: mockLookup,
      netConnect: mockNetConnect,
    });

    assert.equal(result.targetIp, mockPublicIp);
    assert.equal(result.hostname, 'example-mock-provider.com');
    assert.equal(result.port, 8080);
    assert.equal(result.protocol, 'http:');
    assert.ok(result.agent instanceof http.Agent);

    // Invoke createConnection
    result.agent.createConnection({});
    assert.ok(netConnectArgs, 'net.connect must be called');
    assert.equal(netConnectArgs.host, mockPublicIp, 'Socket must connect to verified targetIp, not hostname');
    assert.equal(netConnectArgs.port, 8080, 'Socket must connect to targetPort');
  });

  await t.test('TLS connections wrap raw socket and preserve servername SNI', async () => {
    const mockPublicIp = '104.18.2.115';
    const mockLookup = async () => [{ address: mockPublicIp, family: 4 }];

    let netConnectArgs = null;
    let tlsConnectArgs = null;
    const dummySocket = new net.Socket();
    const dummyTlsSocket = new tls.TLSSocket(dummySocket);

    const mockNetConnect = (options) => {
      netConnectArgs = options;
      return dummySocket;
    };

    const mockTlsConnect = (options) => {
      tlsConnectArgs = options;
      return dummyTlsSocket;
    };

    const result = await createSafeAgent('https://openrouter.ai/api/v1', {
      dnsLookup: mockLookup,
      netConnect: mockNetConnect,
      tlsConnect: mockTlsConnect,
    });

    assert.equal(result.targetIp, mockPublicIp);
    assert.equal(result.hostname, 'openrouter.ai');
    assert.equal(result.port, 443);
    assert.equal(result.protocol, 'https:');
    assert.ok(result.agent instanceof https.Agent);

    result.agent.createConnection({});

    assert.ok(netConnectArgs, 'net.connect must be called');
    assert.equal(netConnectArgs.host, mockPublicIp, 'Raw socket must bind to validated targetIp');
    assert.equal(netConnectArgs.port, 443);

    assert.ok(tlsConnectArgs, 'tls.connect must be called');
    assert.equal(tlsConnectArgs.socket, dummySocket, 'TLS must wrap the raw socket bound to targetIp');
    assert.equal(tlsConnectArgs.servername, 'openrouter.ai', 'TLS SNI servername must match target hostname');
  });

  await t.test('prevents DNS rebinding: socket connection remains bound to validated IP', async () => {
    // Scenario: Attacker domain initially resolves to safe public IP
    let lookupCallCount = 0;
    const initialSafeIp = '93.184.216.34';
    const rebindMaliciousIp = '127.0.0.1';

    const mockRebindLookup = async () => {
      lookupCallCount++;
      if (lookupCallCount === 1) {
        return [{ address: initialSafeIp, family: 4 }];
      }
      // Rebound to loopback on subsequent calls
      return [{ address: rebindMaliciousIp, family: 4 }];
    };

    let connectedHost = null;
    const dummySocket = new net.Socket();
    const dummyTlsSocket = new tls.TLSSocket(dummySocket);

    const mockNetConnect = (options) => {
      connectedHost = options.host;
      return dummySocket;
    };
    const mockTlsConnect = () => dummyTlsSocket;

    const result = await createSafeAgent('https://attacker-rebind.com/v1', {
      allowCustom: true,
      dnsLookup: mockRebindLookup,
      netConnect: mockNetConnect,
      tlsConnect: mockTlsConnect,
    });

    assert.equal(result.targetIp, initialSafeIp, 'Must record validated safe IP');

    // Trigger connection
    result.agent.createConnection({});

    assert.equal(
      connectedHost,
      initialSafeIp,
      'Connection MUST be bound to initial validated IP, immune to DNS rebinding',
    );
    assert.notEqual(
      connectedHost,
      rebindMaliciousIp,
      'Connection must never connect to rebounded loopback IP',
    );
  });
});
