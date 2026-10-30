import { startServer } from './packages/server/src/server.ts';

const server = await startServer(8080);
console.log('Server started on port 8080');

// Keep process alive
process.on('SIGINT', async () => {
  await server.close();
  process.exit(0);
});
