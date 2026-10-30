/**
 * Node-only (vite.config) entry: `import { setuMockRelay } from '@setu/mock-backend/relay'`.
 * Browser code must import the client from '@setu/mock-backend/relay/client' instead.
 */
import type { Plugin } from 'vite';
import { RELAY_HOST, RELAY_PORT } from './protocol.js';
import { startRelayServer, type RelayServer } from './server.js';

export { startRelayServer, type RelayServer, type RelayServerOptions } from './server.js';
export { RELAY_HOST, RELAY_PORT, RELAY_URL, type RelayState, type SaveResult } from './protocol.js';

export interface MockRelayPluginOptions {
  port?: number;
  host?: string;
  /** How often a dev server that lost the race re-tries to take over the port (ms). 0 disables. Default 3000. */
  takeoverMs?: number;
}

/**
 * Dev-only. Whichever dev server starts first hosts the shared relay; later ones find the port taken and
 * reuse it. If the host dev server exits, a surviving one takes over (state is in-memory, so it resets;
 * connected tabs re-sync from their local copy).
 */
export function setuMockRelay(opts: MockRelayPluginOptions = {}): Plugin {
  const port = opts.port ?? RELAY_PORT;
  const host = opts.host ?? RELAY_HOST;
  return {
    name: 'setu-mock-relay',
    apply: 'serve',
    configureServer(server) {
      let relay: RelayServer | undefined;
      let timer: ReturnType<typeof setInterval> | undefined;
      const log = (m: string) => server.config.logger.info(`  [setu-mock-relay] ${m}`);
      const tryStart = async () => {
        if (relay) return;
        try {
          relay = await startRelayServer({ host, port });
          log(`hosting shared mock relay at ${relay.url}`);
          if (timer) { clearInterval(timer); timer = undefined; }
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw e;
        }
      };
      void tryStart().then(() => {
        if (!relay) {
          log(`reusing existing relay at http://${host}:${port}`);
          const ms = opts.takeoverMs ?? 3000;
          if (ms > 0) { timer = setInterval(() => void tryStart(), ms); timer.unref(); }
        }
      });
      server.httpServer?.once('close', () => {
        if (timer) clearInterval(timer);
        void relay?.close();
      });
    },
    // Tell the browser (mock mode) where the relay is; createApiClientWithMock() reads it.
    transformIndexHtml() {
      return [{ tag: 'script', injectTo: 'head-prepend', children: `globalThis.__SETU_MOCK_RELAY__=${JSON.stringify(`http://${host}:${port}`)};` }];
    },
  };
}
