const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require(require.resolve('playwright',{paths:[process.cwd(),'C:/Users/yuiffy/.codex/skills/develop-web-game']}));
const {inspectPng} = require('./lib/autochess-screenshot.cjs');
const base=process.env.RESET_BASE_URL||'http://127.0.0.1:3892';
const output=path.resolve('tmp/reset-rush-quality-browser');
const report={checks:[],screenshots:[],errors:[]};
async function main(){
 assert.equal((await fetch(`${base}/game/reset-rush`)).status,200);
 fs.mkdirSync(output,{recursive:true});
 const E=await (await import('./tests/helpers/load-typescript-module.mjs')).loadTypescriptModule('src/components/resetRush/engine.ts');
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--disable-features=SpeechSynthesis']});
 try {
  const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  await context.addInitScript(()=>{if(window.speechSynthesis)window.speechSynthesis.speak=()=>{};});
  const page=await context.newPage();
  page.on('pageerror',e=>report.errors.push(e.message));
  page.on('console',e=>{if(e.type()==='error')report.errors.push(e.text());});
  const saved=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('reset-rush-v5')));
  const load=async()=>{await page.goto(`${base}/game/reset-rush`,{waitUntil:'networkidle'});await page.waitForFunction(()=>window.render_game_to_text&&JSON.parse(window.render_game_to_text()).ready!==false);};
  const inject=async g=>{await page.evaluate(g=>localStorage.setItem('reset-rush-v5',JSON.stringify(g)),g);await load();};
  const advance=async minutes=>{const before=await saved();await page.evaluate(n=>window.advanceTime(n*60000),minutes);await page.waitForFunction(n=>JSON.parse(window.render_game_to_text()).minute===n,Math.min(480,before.minute+minutes));};
  const shot=async name=>{
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
   const file=path.join(output,`${name}.png`);const pixels=inspectPng(await page.screenshot({path:file,animations:'disabled'}));
   report.screenshots.push({file,pixels,state:await page.evaluate(()=>JSON.parse(window.render_game_to_text()))});
  };
  const fresh=(need=30)=>{
   const g=E.createGame(1888,21);g.players[0].projects[0].need=need;g.players[0].projects[0].understood=true;
   for(const m of Object.keys(E.MODELS))g.players[0].experience[m]={edition:E.modelEdition(g,m).name,work:60};
   g.players[0].accounts[0].tier=200;g.players[0].accounts[0].quota=480;return g;
  };
  await load();await page.locator('#start-game').click();await page.getByRole('button',{name:'关闭弹窗'}).click();
  await inject(fresh());await page.locator('#studio-configuration').selectOption('adaptive');
  assert.equal((await saved()).players[0].energy,10);
  assert.match(await page.getByTestId('quality-note').innerText(),/合格.*基础收益/s);
  assert.match(await page.getByTestId('quality-note').innerText(),/人工跟进 · 2 精力/);
  await page.getByTestId('project-team').scrollIntoViewIfNeeded();await shot('01-budget-work');
  await advance(410);const cheap=(await saved()).players[0].shipped[0];assert.equal(cheap.delivery.grade,'合格');
  await inject(fresh());await page.locator('#studio-configuration').selectOption('premium');
  assert.equal((await saved()).players[0].energy,11);
  assert.match(await page.getByTestId('quality-note').innerText(),/精品.*40%/s);
  assert.match(await page.getByTestId('quality-note').innerText(),/省心托管 · 1 精力/);
  await page.getByTestId('project-team').scrollIntoViewIfNeeded();await shot('02-premium-work');
  await page.locator('#studio-turbo').check();assert.equal((await saved()).studio.configuration,'premium');
  await advance(240);const premium=(await saved()).players[0].shipped[0];assert.equal(premium.delivery.grade,'精品');
  assert.ok(premium.delivery.cash>cheap.delivery.cash);assert.ok(premium.delivery.vp>cheap.delivery.vp);
  const before=await saved();await load();assert.deepEqual(await saved(),before);
  await page.locator('button').filter({hasText:'独立开发者'}).first().click();
  assert.match(await page.getByRole('dialog').innerText(),/精品.*35/s);
  await shot('03-delivered-rewards');await page.getByRole('button',{name:'关闭弹窗'}).click();
  report.checks.push({sameJob:{budget:cheap.delivery,premium:premium.delivery},attention:{budget:2,premium:1},turboAndReload:true});

  let blocked=fresh(1000);blocked.development={model:'astra',effort:'medium',turbo:false};blocked=E.act(blocked,{type:'studio',...blocked.studio});blocked=E.advanceMinutes(blocked,1);blocked.players[0].energy=0;
  await inject(blocked);await page.getByRole('button',{name:'慢跑省额',exact:true}).click();
  assert.match(await page.getByTestId('project-team').innerText(),/等待精力/);await advance(5);assert.equal((await saved()).players[0].projects[0].work,blocked.players[0].projects[0].work);
  await page.getByTestId('project-team').scrollIntoViewIfNeeded();await shot('04-attention-wait');
  await page.getByRole('button',{name:'重置冲刺',exact:true}).click();await advance(5);assert.ok((await saved()).players[0].projects[0].work>0);
  report.checks.push('Unfunded downgrade visibly waits; switching back resumes using existing attention reserve');

  for(const width of [390,320]) {
   await page.setViewportSize({width,height:844});await inject(fresh(1000));await page.locator('#studio-configuration').selectOption('premium');
   await page.locator('#studio-turbo').check();await page.locator('#studio-configuration').scrollIntoViewIfNeeded();await shot(`05-mobile-${width}-strategy`);
   await page.getByTestId('project-team').scrollIntoViewIfNeeded();await shot(`06-mobile-${width}-quality`);
   await page.locator('#end-day').click();await page.locator('#confirm-end-day').click();await page.locator('#next-day').click();assert.equal((await saved()).day,2);
  }
  report.checks.push('390/320px: premium strategy, independent Turbo, readable quality/attention, day transitions, no horizontal overflow');
  assert.deepEqual(report.errors,[]);
 } finally {await browser.close();}
}
main().then(()=>{fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({checks:report.checks,screenshots:report.screenshots.map(x=>x.file),errors:report.errors},null,2));}).catch(e=>{fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'failure.json'),JSON.stringify({error:e.stack,...report},null,2));console.error(e);process.exitCode=1;});
