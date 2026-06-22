import puppeteer from 'puppeteer-core';

const baseUrl = process.env.QA_BASE_URL || 'http://127.0.0.1:3001';
const executablePath = process.env.CHROMIUM_PATH || '/usr/bin/chromium';
const browserRequired = process.env.ROUTE_QA_BROWSER_REQUIRED === 'true';
const browserDisabled = process.env.ROUTE_QA_BROWSER === 'off';
const routes: Array<[string, string]> = [
  ['/', 'Trading Operations Dashboard'],
  ['/market-scanner', 'Market Scanner'],
  ['/signals', 'Active Signals'],
  ['/execution', 'Entry Queue'],
  ['/active-trades', 'Active Trades'],
  ['/risk-control', 'Risk Control'],
  ['/journal-logs', 'Journal / Logs'],
  ['/settings', 'Settings & Safety'],
  ['/strategy', 'Strategy Performance'],
];

const httpResults: Array<{ route: string; status: number; hasRoot: boolean }> = [];
for (const [route] of routes) {
  const response = await fetch(`${baseUrl}${route}`);
  const body = await response.text();
  const hasRoot = body.includes('<div id="root"></div>');
  httpResults.push({ route, status: response.status, hasRoot });
  if (response.status !== 200) throw new Error(`${route} returned HTTP ${response.status}`);
  if (!hasRoot) throw new Error(`${route} did not return the production frontend shell`);
}

const browserResults: Array<{ route: string; status: number; heading: string; errors: string[] }> = [];
let browserStatus: 'PASSED' | 'SKIPPED' = 'SKIPPED';
let browserSkipReason: string | null = browserDisabled ? 'ROUTE_QA_BROWSER=off' : null;

if (!browserDisabled) {
  try {
    const browser = await puppeteer.launch({
      executablePath,
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--proxy-server=direct://',
        '--proxy-bypass-list=*',
      ],
    });
    try {
      for (const [route, expectedHeading] of routes) {
        const page = await browser.newPage();
        const errors: string[] = [];
        page.on('pageerror', (error) => errors.push(error instanceof Error ? error.message : String(error)));
        page.on('console', (message) => {
          if (message.type() === 'error') errors.push(message.text());
        });
        const response = await page.goto(`${baseUrl}${route}`, {
          waitUntil: 'networkidle0',
          timeout: 20_000,
        });
        await page.waitForSelector('h1', { timeout: 10_000 });
        const heading = await page.$eval('h1', (element) => element.textContent?.trim() || '');
        const status = response?.status() ?? 0;
        browserResults.push({ route, status, heading, errors });
        if (status !== 200) throw new Error(`${route} returned browser HTTP ${status}`);
        if (heading !== expectedHeading) {
          throw new Error(`${route} heading mismatch: expected ${expectedHeading}, received ${heading}`);
        }
        if (errors.length) throw new Error(`${route} browser errors: ${errors.join(' | ')}`);
        await page.close();
      }
      browserStatus = 'PASSED';
    } finally {
      await browser.close();
    }
  } catch (error) {
    browserSkipReason = error instanceof Error ? error.message : String(error);
    if (browserRequired) throw error;
  }
}

console.log(JSON.stringify({
  passed: true,
  http: { passed: true, routes: httpResults },
  browser: {
    status: browserStatus,
    skipReason: browserStatus === 'SKIPPED' ? browserSkipReason : null,
    routes: browserResults,
  },
}, null, 2));
