import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { browserBundle, browserStyles } from './helpers/browser-bundle.mjs';

let browser, script, sharedScript, css;
before(async () => {
  browser = await chromium.launch({ headless: true });
  css = await browserStyles();
  script = await browserBundle('./src/components/chart-area-interactive.tsx', `
    createRoot(document.getElementById('root')).render(
      <Component.ChartAreaInteractive data={[
        {date: '2026-10-12', submissions: 2},
        {date: '2026-10-13', submissions: 5},
      ]} />
    );
  `);
  sharedScript = await browserBundle('./src/components/ui/chart.tsx', `
    import { AreaChart, Area } from 'recharts';
    createRoot(document.getElementById('root')).render(
      <Component.ChartContainer className="h-64 w-full" config={{submissions: {label: 'Submissions', color: '#123456'}}}>
        <AreaChart data={[{date: '2026-10-12', submissions: 2}, {date: '2026-10-13', submissions: 5}]}>
          <Area dataKey="submissions" isAnimationActive={false} />
        </AreaChart>
      </Component.ChartContainer>
    );
  `);
});
after(async () => { await browser?.close(); });

for (const name of ['submission chart', 'shared chart container']) {
test(`${name} starts with valid dimensions and follows resize and visibility changes`, async t => {
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
  t.after(() => page.close());
  const dimensionWarnings = [];
  page.on('console', message => {
    if (message.type() === 'warning' && /The width\(-\d+\) and height\(-\d+\)/.test(message.text())) {
      dimensionWarnings.push(message.text());
    }
  });
  await page.setContent('<div id="root" style="width: 100%; min-width: 0"></div>');
  await page.addStyleTag({ content: css });
  await page.addScriptTag({ content: name === 'submission chart' ? script : sharedScript });
  const chart = page.locator('.recharts-surface');
  await chart.waitFor();
  await page.waitForFunction(() => document.querySelector('.recharts-surface')?.getBoundingClientRect().width > 500);
  const desktopWidth = (await chart.boundingBox()).width;
  assert.equal((await chart.boundingBox()).height, 256);

  await page.setViewportSize({ width: 390, height: 700 });
  await page.waitForFunction(() => {
    const width = document.querySelector('.recharts-surface')?.getBoundingClientRect().width;
    return width > 0 && width <= 390;
  });
  assert.ok((await chart.boundingBox()).width < desktopWidth);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);

  await page.locator('#root').evaluate(element => { element.style.display = 'none'; });
  await page.waitForFunction(() => !document.querySelector('.recharts-surface'));
  await page.locator('#root').evaluate(element => { element.style.display = ''; });
  await chart.waitFor();
  assert.ok((await chart.boundingBox()).width > 0);
  assert.equal((await chart.boundingBox()).height, 256);
  assert.deepEqual(dimensionWarnings, [], 'chart must not render with Recharts negative initial dimensions');
});
}
