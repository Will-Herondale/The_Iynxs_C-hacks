import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { RELAY_HOST, RELAY_PORT, type RelayState } from './protocol.js';

export interface RelayServer {
  url: string;
  port: number;
  close(): Promise<void>;
  /** Current in-memory state (for tests). */
  snapshot(): RelayState;
}

export interface RelayServerOptions {
  host?: string;
  /** 0 picks a free port. */
  port?: number;
  /** SSE keep-alive interval (ms). */
  heartbeatMs?: number;
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,PUT,OPTIONS',
  'access-control-allow-headers': 'content-type',
};

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.setEncoding('utf8');
    req.on('data', (c: string) => {
      data += c;
      if (data.length > 20_000_000) reject(new Error('body too large'));
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

/**
 * Starts the shared mock relay: holds one opaque JSON blob with a revision counter
 * (compare-and-set) and pushes revision bumps to listeners over SSE.
 * Rejects with code EADDRINUSE if another relay already owns the port.
 */
export function startRelayServer(opts: RelayServerOptions = {}): Promise<RelayServer> {
  const host = opts.host ?? RELAY_HOST;
  const current: RelayState = { rev: 0, state: null };
  const listeners = new Set<ServerResponse>();

  const send = (res: ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { ...CORS, 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  };

  const server: Server = createServer((req, res) => {
    const path = (req.url ?? '/').split('?')[0];
    if (req.method === 'OPTIONS') { res.writeHead(204, CORS); res.end(); return; }
    if (req.method === 'GET' && path === '/health') { send(res, 200, { ok: true, relay: 'setu-mock', rev: current.rev }); return; }
    if (req.method === 'GET' && path === '/state') { send(res, 200, current); return; }
    if (req.method === 'PUT' && path === '/state') {
      readBody(req).then((raw) => {
        let body: { baseRev?: unknown; state?: unknown };
        try { body = JSON.parse(raw); } catch { send(res, 400, { ok: false, error: 'invalid json' }); return; }
        if (body.baseRev !== current.rev) { send(res, 409, { ok: false, rev: current.rev, state: current.state }); return; }
        current.rev += 1;
        current.state = body.state ?? null;
        send(res, 200, { ok: true, rev: current.rev });
        const msg = `data: ${JSON.stringify({ rev: current.rev })}\n\n`;
        for (const l of listeners) l.write(msg);
      }).catch(() => send(res, 400, { ok: false, error: 'bad request' }));
      return;
    }
    if (req.method === 'GET' && path === '/events') {
      res.writeHead(200, { ...CORS, 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
      res.write(`data: ${JSON.stringify({ rev: current.rev })}\n\n`);
      listeners.add(res);
      req.on('close', () => listeners.delete(res));
      return;
    }
    send(res, 404, { ok: false });
  });

  const heartbeat = setInterval(() => { for (const l of listeners) l.write(': ping\n\n'); }, opts.heartbeatMs ?? 15_000);
  heartbeat.unref();

  return new Promise((resolve, reject) => {
    server.once('error', (err) => { clearInterval(heartbeat); reject(err); });
    server.listen(opts.port ?? RELAY_PORT, host, () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : (opts.port ?? RELAY_PORT);
      resolve({
        url: `http://${host}:${port}`,
        port,
        snapshot: () => ({ ...current }),
        close: () => new Promise<void>((r) => {
          clearInterval(heartbeat);
          for (const l of listeners) l.end();
          listeners.clear();
          server.close(() => r());
          server.closeAllConnections?.();
        }),
      });
    });
  });
}
