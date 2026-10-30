// Runs an npm script in every app workspace that exists and defines it (apps may land on separate branches).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const script = process.argv[2];
if (!script) throw new Error('usage: node scripts/run-apps.mjs <script>');
const appsDir = new URL('../apps/', import.meta.url);
const apps = existsSync(appsDir) ? readdirSync(appsDir, { withFileTypes: true }).filter((d) => d.isDirectory()) : [];
for (const app of apps) {
  const pkgUrl = new URL(`${app.name}/package.json`, appsDir);
  if (!existsSync(pkgUrl)) continue;
  const pkg = JSON.parse(readFileSync(pkgUrl, 'utf8'));
  if (!pkg.scripts?.[script]) continue;
  console.log(`\n> ${pkg.name} ${script}`);
  execSync(`npm run ${script} -w ${pkg.name}`, { stdio: 'inherit' });
}
