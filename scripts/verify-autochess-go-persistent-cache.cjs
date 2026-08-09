const { createRequire } = require('node:module');
const { existsSync, mkdirSync } = require('node:fs');

const localRequire = createRequire(__filename);
const playwrightCandidates = [
  process.env.PLAYWRIGHT_MODULE,
  'playwright',
  'C:/Users/apple/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright',
  'C:/Users/yuiffy/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright',
].filter(Boolean);

const loadPlaywright = () => {
  for (const candidate of playwrightCandidates) {
    try {
      if (candidate.includes('/') || candidate.includes('\\')) {
        if (!existsSync(candidate)) continue;
        return localRequire(candidate);
      }
      return localRequire(candidate);
    } catch {
      // Try the next known local Playwright installation.
    }
  }
  throw new Error('Unable to load Playwright');
};

const { chromium } = loadPlaywright();
const outputDirectory = '.tmp/autochess-go-cache';
mkdirSync(outputDirectory, { recursive: true });

const databaseName = 'rift-line-go-rollout-cache';
const storeName = 'cache';
const recordKey = 'latest';
const cacheSchema = 'combat-go-v4';
const requestedBase = process.argv[2] || process.env.AUTOCHESS_BASE_URL;
const baseUrl = /^\d+$/.test(requestedBase || '')
  ? `http://127.0.0.1:${requestedBase}`
  : requestedBase || 'http://127.0.0.1:3101';

const deleteDatabase = (page) => page.evaluate((name) => new Promise((resolve, reject) => {
  const request = window.indexedDB.deleteDatabase(name);
  request.onsuccess = () => resolve();
  request.onerror = () => reject(request.error);
  request.onblocked = () => {};
}), databaseName);

const readPersistedCache = (page) => page.evaluate(
  ({ name, store, key }) => new Promise((resolve, reject) => {
    const open = window.indexedDB.open(name, 1);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const database = open.result;
      const request = database.transaction(store, 'readonly').objectStore(store).get(key);
      request.onsuccess = () => {
        database.close();
        resolve(request.result || null);
      };
      request.onerror = () => {
        database.close();
        reject(request.error);
      };
    };
  }),
  { name: databaseName, store: storeName, key: recordKey },
);

const startGoRun = async (page) => {
  await page.getByRole('button', { name: /AI 观战/ }).click();
  await page.getByRole('button', { name: /由 AI 自选协议并开局/ }).click();
};

let browser;

(async () => {
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(() => {
    window.localStorage.setItem('rift-line-autopilot-strategy', JSON.stringify({
      version: 3,
      style: 'go',
    }));
  });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto(`${baseUrl}/game/autochess?seed=152101`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-game-canvas="rift-line"]').waitFor();
  await deleteDatabase(page);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('[data-game-canvas="rift-line"]').waitFor();
  await page.waitForFunction(() => typeof window.getAutoChessRolloutCacheStats === 'function');

  await startGoRun(page);
  await page.waitForFunction(() => {
    const stats = window.getAutoChessRolloutCacheStats?.();
    return stats && stats.entries > 0 && stats.misses > 0;
  }, null, { timeout: 120_000 });
  const coldStats = await page.evaluate(() => window.getAutoChessRolloutCacheStats());
  await page.screenshot({ path: `${outputDirectory}/cold-cache.png`, fullPage: true });

  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await page.waitForTimeout(1_000);
  const persisted = await readPersistedCache(page);
  if (!persisted || persisted.schema !== cacheSchema || persisted.entries.length === 0) {
    throw new Error(`Go rollout cache was not persisted: ${JSON.stringify(persisted)}`);
  }
  const invalidKeys = persisted.entries
    .map(([key]) => key)
    .filter((key) => {
      const parts = key.split('/');
      const placementPart = parts.at(-2);
      return !new RegExp(`^${cacheSchema}/hz:(20|60)/`).test(key)
        || !placementPart
        || !/^\d+:[a-z0-9_]+:[123](,\d+:[a-z0-9_]+:[123])*$/.test(placementPart);
    });
  if (invalidKeys.length > 0) {
    throw new Error(`Persistent Go cache contains non-canonical keys: ${invalidKeys[0]}`);
  }

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('[data-game-canvas="rift-line"]').waitFor();
  await page.waitForFunction(
    (minimum) => (window.getAutoChessRolloutCacheStats?.().entries || 0) >= minimum,
    persisted.entries.length,
  );
  const hydratedStats = await page.evaluate(() => window.getAutoChessRolloutCacheStats());
  await startGoRun(page);
  await page.waitForFunction(() => (window.getAutoChessRolloutCacheStats?.().hits || 0) > 0, null, {
    timeout: 120_000,
  });
  const warmStats = await page.evaluate(() => window.getAutoChessRolloutCacheStats());
  const textState = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  await page.screenshot({ path: `${outputDirectory}/warm-cache-after-reload.png`, fullPage: true });

  if (errors.length > 0) throw new Error(`Browser errors: ${errors.join(' | ')}`);
  console.log(JSON.stringify({
    coldStats,
    persistedEntries: persisted.entries.length,
    hydratedStats,
    warmStats,
    state: { phase: textState.phase, round: textState.round },
    errors,
  }, null, 2));
  await browser.close();
})().catch((error) => {
  console.error(error);
  Promise.resolve(browser?.close()).finally(() => process.exit(1));
});
