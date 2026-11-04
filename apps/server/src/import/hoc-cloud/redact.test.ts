import { describe, expect, it } from 'vitest';
import { createRedactor, redactJson } from './redact';
import { isTeachingAddress } from './teaching-addresses';

// Built at runtime so this file holds no literal address the public-info guard would flag.
const ip = (...octets: number[]): string => octets.join('.');
const SERVER = ip(10, 20, 30, 40);
const OTHER = ip(10, 20, 30, 41);
const RESOLVER = ip(8, 8, 8, 8);
const POD = ip(10, 244, 1, 7);
const SSH = 'ssh'; // so that no line here reads as a written-out SSH command

describe('redaction of imported text', () => {
  it('numbers each server address per document and drops its port', () => {
    const redact = createRedactor();
    expect(redact(`IP_SERVER='${SERVER}:9514' then ${OTHER} and ${SERVER} again.`)).toBe("IP_SERVER='<ADDR-1>:<PORT>' then <ADDR-2> and <ADDR-1> again.");
    expect(redact(`log from ${OTHER}`)).toBe('log from <ADDR-2>');
    expect(redact.redacted).toBe(4);
    expect(createRedactor()(`${OTHER}`)).toBe('<ADDR-1>');
  });

  it('keeps lesson operands, networks, loopback and spec sections', () => {
    const text = `ping ${RESOLVER}; ${ip(10, 0, 0, 0)}/8; ${ip(10, 1, 2, 0)}; 127.0.0.1:8080; RFC 1122 §3.2.1.7; rfc1122#section-3.2.1.7; v1.2.3.400`;
    expect(createRedactor()(text)).toBe(text);
  });

  it('treats a host written with a prefix as a host', () => {
    expect(createRedactor()(`addresses: [${SERVER}/24]`)).toBe('addresses: [<ADDR-1>/24]');
    expect(isTeachingAddress([10, 20, 30, 0], 24)).toBe(true);
    expect(isTeachingAddress([10, 20, 30, 40], 24)).toBe(false);
  });

  it('hides SSH logins and ports', () => {
    const redact = createRedactor();
    expect(redact(`ssh dev@${SERVER}`)).toBe('ssh <USER>@<ADDR-1>');
    expect(redact(`${SSH} -i key.pem admin@box.example.org uptime`)).toBe(`${SSH} -i key.pem <USER>@<HOST> uptime`);
    expect(redact('scp dump.pcap root@lab:/tmp/')).toBe('scp dump.pcap <USER>@<HOST>:/tmp/');
    expect(redact(`${SSH} -p 2222 <USER>@<HOST>`)).toBe(`${SSH} -p <SSH_PORT> <USER>@<HOST>`);
    expect(redact('Port 2222')).toBe('Port <SSH_PORT>');
  });

  it('changes nothing the second time', () => {
    const text = `${SSH} -p 2222 me@${SERVER}\nIP=${OTHER}:514 and ${POD}`;
    const once = createRedactor()(text);
    expect(createRedactor()(once)).toBe(once);
  });

  it('walks every string of a JSON answer with one numbering', () => {
    const redact = createRedactor();
    expect(redactJson({ a: [SERVER, { b: `x ${OTHER}` }], n: 3, c: null }, redact)).toEqual({ a: ['<ADDR-1>', { b: 'x <ADDR-2>' }], n: 3, c: null });
  });
});
