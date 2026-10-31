import { afterEach, describe, expect, it } from 'vitest';
import { connectRelay, type RelayClient } from './client.js';
import { startRelayServer, type RelayServer } from './server.js';

let server: RelayServer | undefined;
const clients: RelayClient[] = [];
afterEach(async () => {
  clients.splice(0).forEach((c) => c.close());
  await server?.close();
  server = undefined;
});

async function setup() {
  server = await startRelayServer({ port: 0 });
  const a = (await connectRelay({ url: server.url }))!;
  const b = (await connectRelay({ url: server.url }))!;
  clients.push(a, b);
  return { a, b };
}
const until = async (fn: () => boolean) => { for (let i = 0; i < 100 && !fn(); i++) await new Promise((r) => setTimeout(r, 10)); };

describe('mock relay', () => {
  it('round-trips state between two clients and notifies the other', async () => {
    const { a, b } = await setup();
    const seen: number[] = [];
    b.subscribe((rev) => seen.push(rev));
    await until(() => seen.includes(0));
    expect((await b.load()).state).toBeNull();

    const res = await a.save({ events: ['e1'] }, 0);
    expect(res).toEqual({ ok: true, rev: 1 });
    await until(() => seen.includes(1));
    expect(seen).toContain(1);
    expect(await b.load()).toEqual({ rev: 1, state: { events: ['e1'] } });
  });

  it('rejects stale writes with the latest state (compare-and-set)', async () => {
    const { a, b } = await setup();
    await a.save({ v: 1 }, 0);
    const stale = await b.save({ v: 2 }, 0);
    expect(stale).toEqual({ ok: false, rev: 1, state: { v: 1 } });
    expect(await b.save({ v: 2 }, 1)).toEqual({ ok: true, rev: 2 });
  });

  it('connectRelay returns null when nothing is listening', async () => {
    expect(await connectRelay({ url: 'http://127.0.0.1:1', timeoutMs: 300 })).toBeNull();
  });

  it('refuses a second relay on the same port', async () => {
    server = await startRelayServer({ port: 0 });
    await expect(startRelayServer({ port: server.port })).rejects.toMatchObject({ code: 'EADDRINUSE' });
  });
});
