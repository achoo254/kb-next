/** The browser leaving before the handler looks: the signal taken afterwards is already aborted. */
import { type Server, createServer, request } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Request, Response } from 'express';
import { afterAll, describe, expect, it } from 'vitest';
import { connectionSignal } from './event-stream';

let server: Server;

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('connection signal', () => {
  it('is aborted at once when the client left while earlier work was awaited', async () => {
    const seen = new Promise<boolean>((resolve) => {
      server = createServer((req, res) => {
        // The session, key and document reads of a route: the client hangs up meanwhile.
        setTimeout(() => {
          resolve(connectionSignal(req as Request, res as Response).aborted);
          res.end();
        }, 150);
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    const client = request({ host: '127.0.0.1', port, method: 'POST', path: '/' });
    client.on('error', () => undefined);
    client.end('{}');
    setTimeout(() => client.destroy(), 30);
    expect(await seen).toBe(true);
  });
});
