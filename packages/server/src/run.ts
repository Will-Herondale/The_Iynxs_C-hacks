import { startServer } from './server.js';

async function main() {
  // startServer's default reads SETU_PORT, allowing isolated demo instances
  // without changing the production default of 8080.
  const server = await startServer();
  console.log(`Server running on port ${process.env.SETU_PORT || 8080}`);

  process.on('SIGINT', async () => {
    await server.close();
    process.exit(0);
  });
}

main().catch(console.error);
