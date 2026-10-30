import { startServer } from './server.js';

async function main() {
  const server = await startServer(8080);
  console.log('Server running on port 8080');

  process.on('SIGINT', async () => {
    await server.close();
    process.exit(0);
  });
}

main().catch(console.error);
