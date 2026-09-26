// Run the skill's actual interaction client with this repository's quiet system-Chrome policy.
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { inspectPng } from './lib/autochess-screenshot.cjs';

const skillRoot = path.join(homedir(), '.codex', 'skills', 'develop-web-game');
const require = createRequire(path.join(skillRoot, 'scripts', 'web_game_playwright_client.js'));
const { chromium } = require('playwright');
const launch = chromium.launch.bind(chromium);
chromium.launch = async options => {
  const browser = await launch({ ...options, channel: 'chrome', args: ['--mute-audio', '--disable-features=SpeechSynthesis'] });
  const newPage = browser.newPage.bind(browser);
  browser.newPage = async pageOptions => {
    const page = await newPage(pageOptions);
    await page.addInitScript(() => { if (window.speechSynthesis) window.speechSynthesis.speak = () => {}; });
    const screenshot = page.screenshot.bind(page);
    page.screenshot = async options => {
      const png = await screenshot(options);
      inspectPng(png);
      return png;
    };
    const click = page.click.bind(page);
    page.click = async (selector, ...args) => {
      const result = await click(selector, ...args);
      if (selector === '#start-game') {
        await page.getByRole('button', { name: '开新号 · 只花钱', exact: true }).nth(1).click();
        await page.getByRole('button', { name: '关闭弹窗' }).click();
        await page.locator('#studio-policy').selectOption('most-quota');
        await page.evaluate(() => window.advanceTime(60 * 60000));
        await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).minute === 60);
        const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('reset-rush-v4')));
        assert.equal(saved.studio.accountPolicy, 'most-quota');
        assert.equal(saved.players[0].accounts[0].quota, 24);
        assert.ok(saved.players[0].accounts[1].quota < 90);
        await page.locator('#reset-command').scrollIntoViewIfNeeded();
      }
      return result;
    };
    return page;
  };
  return browser;
};
const client = path.join(skillRoot, 'scripts', 'web_game_playwright_client.js');
const base = process.env.RESET_BASE_URL || 'http://127.0.0.1:3888';
const screenshotDir = process.env.RESET_SHARED_DIR || 'tmp/reset-rush-shared';
assert.equal((await fetch(`${base}/game/reset-rush`)).status, 200);
process.argv = [process.execPath, client,
  '--url', `${base}/game/reset-rush`,
  '--click-selector', '#start-game', '--iterations', '1',
  '--actions-json', JSON.stringify({ steps: [{ buttons: [], frames: 2 }] }),
  '--screenshot-dir', screenshotDir];
await import(pathToFileURL(client).href);
