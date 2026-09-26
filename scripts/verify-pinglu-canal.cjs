const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

let chromium;
try {
  ({ chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'));
} catch {
  ({ chromium } = require(path.join(os.homedir(), '.codex', 'skills', 'develop-web-game', 'node_modules', 'playwright')));
}
const url = process.env.PINGLU_URL || 'http://localhost:3191/game/pinglu-canal';
const output = path.join(process.cwd(), '.tmp', 'pinglu-canal');
fs.mkdirSync(output, { recursive: true });

async function readState(page) {
  return JSON.parse(await page.evaluate(() => window.render_game_to_text()));
}

async function captureMobile(page, name) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(output, name), fullPage: true });
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  if (width > 391) throw new Error(`Mobile horizontal overflow in ${name}: ${width}`);
  await page.setViewportSize({ width: 1280, height: 850 });
}

async function actForHuman(page, state, smart = false) {
  const player = state.players.find((item) => item.name === state.activePlayer);
  const tender = (id) => state.tenders.find((item) => item.id === id && item.claimedBy === null)?.reward ?? 0;
  if (state.phase === 'building' && state.digsRemaining > 0) {
    const options = state.frontier.filter((tile) => tile.affordable);
    if (options.length) {
      options.sort((a, b) => {
        const value = (tile) => tile.factoryNames.length * 8 - tile.cost - tile.impact * 2 - (tile.bend ? 1 : 0)
          + (smart && tile.terrain === 'rock' ? tender('rock') * 2 : 0)
          + (smart && tile.factoryNames.length ? tender('factory') * 2 : 0);
        return value(b) - value(a);
      });
      await page.locator('button[data-terrain]:visible').nth(options[0].index).click();
      return;
    }
    if (!player.financed) {
      await page.getByRole('button', { name: /工程融资/ }).click();
      return;
    }
  }
  if (state.phase === 'operating' && state.offers.length) {
    const canFreighter = state.water >= (state.upgrades.includes('water-saving') ? 1 : 2);
    const vessel = canFreighter ? '5000 吨货轮' : '2000 吨驳船';
    await page.getByRole('button', { name: new RegExp(vessel) }).click();
    const available = page.locator('button[class*="cargoOffer"]:visible:not(:disabled)');
    if (await available.count()) {
      if (smart) {
        const ranked = [...state.offers].sort((a, b) => {
          const value = (offer) => offer.price + offer.premium
            + (player.servedOffers.includes(offer.id) ? 0 : 4 + (player.servedOffers.length === 2 ? 8 : 0))
            + (offer.factoryId && canFreighter ? tender('heavy') : 0);
          return value(b) - value(a);
        });
        await page.locator(`button[data-offer-id="${ranked[0].id}"]:visible`).click();
      } else {
        await available.first().click();
      }
      return;
    }
  }
  await page.getByRole('button', { name: /岸线维护/ }).click();
}

async function playMatch(page, label, smart = false) {
  const snapshots = [];
  let previousTurn = '';
  for (let steps = 0; steps < 100; steps++) {
    const state = await readState(page);
    if (state.finished) {
      await page.screenshot({ path: path.join(output, `${label}-final.png`), fullPage: true });
      if (label === 'solo') await captureMobile(page, 'mobile-final.png');
      return { steps, score: state.players.map(({ name, score, dividends, servedOffers }) => ({ name, score, dividends, servedOffers })), route: state.route, snapshots };
    }
    const turn = `${state.round}:${state.activePlayer}`;
    if (turn !== previousTurn) {
      snapshots.push({ round: state.round, activePlayer: state.activePlayer, phase: state.phase, route: state.route.length, scores: state.players.map((player) => player.score) });
      previousTurn = turn;
    }
    if (state.phase === 'operating' && !snapshots.some((item) => item.screenshot)) {
      await page.screenshot({ path: path.join(output, `${label}-opened.png`), fullPage: true });
      if (label === 'solo') await captureMobile(page, 'mobile-operating.png');
      snapshots.push({ screenshot: 'opened' });
    }
    const current = state.players.find((item) => item.name === state.activePlayer);
    if (current.kind === 'ai') {
      await page.waitForTimeout(550);
    } else {
      await actForHuman(page, state, smart);
    }
    await page.waitForTimeout(40);
  }
  throw new Error(`${label} did not finish within 100 actions`);
}

async function playPlanning(page) {
  await page.getByRole('button', { name: '单人规划' }).click();
  await page.screenshot({ path: path.join(output, 'planning-start.png'), fullPage: true });
  let opened = false;
  for (let steps = 0; steps < 21; steps++) {
    const state = await readState(page);
    if (state.phase === 'finished') {
      await page.screenshot({ path: path.join(output, 'planning-final.png'), fullPage: true });
      return { steps, score: state.score, grade: state.grade, route: state.route };
    }
    if (state.phase === 'building') {
      const options = state.frontier.filter((tile) => tile.affordable)
        .sort((a, b) => a.cost + a.impact - a.factoryNames.length * 5 - (b.cost + b.impact - b.factoryNames.length * 5));
      if (options.length) await page.locator('button[data-terrain]:visible').nth(options[0].index).click();
      else if (!state.bondsUsed) await page.getByRole('button', { name: /工程融资/ }).click();
      else throw new Error('Planning route became unaffordable');
    } else {
      if (!opened) {
        await page.screenshot({ path: path.join(output, 'planning-opened.png'), fullPage: true });
        opened = true;
      }
      await page.getByRole('button', { name: new RegExp(state.water >= 2 ? '5000 吨货轮' : '2000 吨驳船') }).click();
      const cargo = page.locator('button[class*="cargoOffer"]:visible:not(:disabled)');
      if (await cargo.count()) await cargo.first().click();
      else await page.getByRole('button', { name: /维护闸池/ }).click();
    }
    await page.waitForTimeout(40);
  }
  throw new Error('Planning game did not finish');
}

async function main() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio'] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 850 } });
  await context.addInitScript(() => {
    window.speechSynthesis.speak = () => {};
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  try {
    const response = await page.goto(url, { waitUntil: 'networkidle' });
    if (!response || response.status() !== 200) throw new Error(`Unexpected HTTP ${response?.status()}`);
    await page.screenshot({ path: path.join(output, 'desktop-start.png'), fullPage: true });

    await page.getByRole('button', { name: '对局设置' }).click();
    await page.locator('#ai-count').selectOption('0');
    await page.getByRole('button', { name: /开始新对局/ }).click();
    const solo = await playMatch(page, 'solo');
    await page.getByRole('button', { name: /再来一局/ }).click();
    const solo2 = await playMatch(page, 'solo-2');
    await page.getByRole('button', { name: /再来一局/ }).click();
    const solo3 = await playMatch(page, 'solo-3');

    await page.reload({ waitUntil: 'networkidle' });
    await page.getByRole('button', { name: '对局设置' }).click();
    await page.locator('#human-count').selectOption('4');
    await page.locator('#ai-count').selectOption('0');
    await page.getByRole('button', { name: /开始新对局/ }).click();
    const hotseat = await playMatch(page, 'hotseat');

    await page.reload({ waitUntil: 'networkidle' });
    const ai = await playMatch(page, 'ai');
    await page.reload({ waitUntil: 'networkidle' });
    const aiSmart = await playMatch(page, 'ai-smart', true);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload({ waitUntil: 'networkidle' });
    await page.screenshot({ path: path.join(output, 'mobile-start.png'), fullPage: true });
    const layout = await page.evaluate(() => ({ documentWidth: document.documentElement.scrollWidth, viewportWidth: window.innerWidth }));
    if (layout.documentWidth > layout.viewportWidth + 1) throw new Error(`Mobile horizontal overflow: ${JSON.stringify(layout)}`);
    await page.setViewportSize({ width: 1280, height: 850 });
    await page.reload({ waitUntil: 'networkidle' });
    const planning = await playPlanning(page);
    if (errors.length) throw new Error(`Browser errors: ${JSON.stringify(errors)}`);
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ solo, solo2, solo3, hotseat, ai, aiSmart, planning, layout, errors }, null, 2));
    console.log(JSON.stringify({
      solo: { steps: solo.steps, score: solo.score, route: solo.route },
      solo2: { steps: solo2.steps, score: solo2.score, route: solo2.route },
      solo3: { steps: solo3.steps, score: solo3.score, route: solo3.route },
      hotseat: { steps: hotseat.steps, score: hotseat.score, route: hotseat.route },
      ai: { steps: ai.steps, score: ai.score, route: ai.route },
      aiSmart: { steps: aiSmart.steps, score: aiSmart.score, route: aiSmart.route },
      planning,
      layout,
      errors,
    }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
