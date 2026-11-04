import { describe, expect, it } from 'vitest';
import { findPublicInfo, isHarmlessIpv4 } from './check-public-info';

describe('public repository guard', () => {
  it('lets loopback, documentation ranges and the mock example network through', () => {
    for (const ip of ['127.0.0.1', '0.0.0.0', '255.255.255.0', '192.0.2.10', '198.51.100.7', '203.0.113.5', '192.168.1.23']) {
      expect(isHarmlessIpv4(ip.split('.').map(Number))).toBe(true);
    }
  });

  it('flags any other address and written-out SSH details, with their line', () => {
    const source = ['PORT=5320', 'host 10.20.30.40', 'ssh -p 2222 deploy@example.org', 'Port 2222', 'version 1.2.3.4000'].join('\n');
    expect(findPublicInfo(source, 'x.md').map((f) => [f.line, f.match])).toEqual([
      [2, '10.20.30.40'],
      [3, 'ssh -p 2222'],
      [3, 'ssh -p 2222 deploy@example.org'],
      [4, 'Port 2222'],
    ]);
  });

  it('ignores placeholders, plain ports and spec sections', () => {
    expect(findPublicInfo('ssh -p <SSH_PORT> <SSH_TARGET>\nlisten 127.0.0.1:5320\nOIDC Core §3.1.3.7', 'x.md')).toEqual([]);
  });
});
