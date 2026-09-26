// Run the skill's actual interaction client with this repository's quiet system-Chrome policy.
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

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
    return page;
  };
  return browser;
};
const client = path.join(skillRoot, 'scripts', 'web_game_playwright_client.js');
process.argv = [process.execPath, client,
  '--url', `${process.env.RESET_BASE_URL || 'http://127.0.0.1:3888'}/game/reset-rush`,
  '--click-selector', '#start-game', '--iterations', '1',
  '--actions-json', JSON.stringify({ steps: [{ buttons: [], frames: 2 }] }),
  '--screenshot-dir', process.env.RESET_SHARED_DIR || 'tmp/reset-rush-shared'];
await import(pathToFileURL(client).href);
