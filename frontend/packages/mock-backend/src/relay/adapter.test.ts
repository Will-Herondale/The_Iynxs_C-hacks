import { afterEach, describe, expect, it } from 'vitest';
import { newClientEventId } from '@setu/contract';
import { MockStore } from '../store.js';
import { createMemoryStorage } from '../storage.js';
import { scenarioRules, initialSnapshot, S1_BRIDGE_ID } from '../seed/index.js';
import { configureMock, resetMockConfig } from '../config.js';
import { createRelayAdapter } from './adapter.js';
import { startRelayServer, type RelayServer } from './server.js';

let server: RelayServer | undefined;
afterEach(async () => {
  resetMockConfig();
  await server?.close();
  server = undefined;
});
// Polling budget: 20 s. The old 6 s budget sat above vitest's 5 s default test timeout, so under CPU load the TEST timed out
// (a flake) before the poll gave up. A genuinely broken relay still fails: the bridge never becomes blocked within 20 s.
const until = async (fn: () => boolean) => { for (let i = 0; i < 2000 && !fn(); i++) await new Promise((r) => setTimeout(r, 10)); };

describe('relay adapter (two origins)', () => {
  it('a blockage filed in store A changes the projection in store B', async () => {
    server = await startRelayServer({ port: 0 });
    configureMock({ applyDelayMs: 30 });
    const mk = () => new MockStore({ rules: scenarioRules, storage: createMemoryStorage(), channel: false, relay: createRelayAdapter({ url: server!.url }) });
    const field = mk();
    const command = mk();
    await new Promise((r) => setTimeout(r, 500)); // let both SSE clients connect (150 ms was too short under load)
    const [lng, lat] = initialSnapshot().roads.features.find((f) => f.properties.roadId === S1_BRIDGE_ID)!.geometry.coordinates[0]!;
    const ack = field.submitOne({
      clientEventId: newClientEventId(), type: 'road_blockage', roadId: S1_BRIDGE_ID, blockage: 'full', cause: 'submerged',
      occurredAt: new Date().toISOString(), reporterId: 'r', deviceId: 'd', location: { lat: lat!, lng: lng! },
    });
    expect(ack.result).toBe('accepted');
    const bridge = () => command.snapshot.roads.features.find((f) => f.properties.roadId === S1_BRIDGE_ID)?.properties;
    await until(() => bridge()?.status === 'blocked');
    expect(bridge()?.status).toBe('blocked');
    expect(command.snapshot.routes.features.some((f) => f.properties.status === 'unavailable')).toBe(true);
    field.close(); command.close();
  }, 30_000);
});
