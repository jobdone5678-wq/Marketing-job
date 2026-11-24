import { chromium } from 'playwright';
import path from 'node:path';

async function main() {
  const extPath = path.resolve('jobright_extension');
  const context = await chromium.launchPersistentContext('', {
    headless: true,
    args: [
      `--disable-extensions-except=${extPath}`,
      `--load-extension=${extPath}`
    ]
  });

  let [sw] = context.serviceWorkers();
  if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 10000 }).catch(() => null);
  console.log('Service worker loaded:', !!sw, sw?.url());
  await context.close();
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
