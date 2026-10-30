import { afterEach, describe, expect, it } from 'vitest';
import { newClientEventId } from '@setu/contract';
import { MockStore } from '../store.js';
import { createMemoryStorage } from '../storage.js';
import { scenarioRules } from '../seed/index.js';
import { configureMock, resetMockConfig } from '../config.js';
import { createRelayAdapter } from './adapter.js';
import { startRelayServer, type RelayServer } from './server.js';

let server: RelayServer | undefined;
afterEach(async () => {
  resetMockConfig();
  await server?.close();
  server = undefined;
});
const until = async (fn: () => boolean) => { for (let i = 0; i < 200 && !fn(); i++) await new Promise((r) => setTimeout(r, 10)); };

describe('relay adapter (two origins)', () => {
  it('a blockage filed in store A changes the projection in store B', async () => {
    server = await startRelayServer({ port: 0 });
    configureMock({ applyDelayMs: 30 });
    const mk = () => new MockStore({ rules: scenarioRules, storage: createMemoryStorage(), channel: false, relay: createRelayAdapter({ url: server!.url }) });
    const field = mk();
    const command = mk();
    await new Promise((r) => setTimeout(r, 150)); // let both connect
    const ack = field.submitOne({
      clientEventId: newClientEventId(), type: 'road_blockage', roadId: 'R7', blockage: 'full',
      occurredAt: new Date().toISOString(), reporterId: 'r', deviceId: 'd', location: { lat: 26.15, lng: 91.67 },
    });
    expect(ack.result).toBe('accepted');
    await until(() => command.snapshot.settlements.features.some((f) => f.properties.settlementId === 'S3' && f.properties.accessibility === 'cut_off'));
    const s3 = command.snapshot.settlements.features.find((f) => f.properties.settlementId === 'S3');
    expect(s3?.properties.accessibility).toBe('cut_off');
    expect(command.snapshot.routes.features.some((f) => f.properties.routeId === 'EVAC-2b')).toBe(true);
    field.close(); command.close();
  });
});
