// Starts the Field app and the Command centre together for a side-by-side demo.
//   VITE_API_URL=https://<backend> npm run demo        (or: npm run demo -- https://<backend>)
// The backend address always comes from the environment or the argument; nothing is hard-coded.
import { spawn } from 'node:child_process';

const api = process.argv[2] || process.env.VITE_API_URL || 'http://localhost:8080';
const env = { ...process.env, VITE_API_URL: api };
const apps = [
  { name: 'Field   (phone view, 360 px wide)', ws: '@setu/field', url: 'http://localhost:5173' },
  { name: 'Command (desktop, 1366x768 or larger)', ws: '@setu/command', url: 'http://localhost:5174' },
];
const children = apps.map((a) => spawn('npm', ['run', 'dev', '-w', a.ws], { env, stdio: 'ignore' }));
console.log(`\nSETU demo (backend: ${api})\n`);
for (const a of apps) console.log(`  ${a.name}\n    ${a.url}`);
console.log('\nPlace the two windows side by side. Field: report offline, reconnect. Command: Live Map -> "Open demo scenario".\nPress Ctrl+C to stop both servers.\n');
const stop = () => { for (const c of children) c.kill(); process.exit(0); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);
for (const c of children) c.on('exit', (code) => { if (code) { console.error(`a dev server exited with code ${code} (is port 5173/5174 already in use?)`); stop(); } });
