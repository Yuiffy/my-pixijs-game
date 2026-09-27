const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require(require.resolve('playwright',{paths:[process.cwd(),'C:/Users/yuiffy/.codex/skills/develop-web-game']}));
const {inspectPng} = require('./lib/autochess-screenshot.cjs');
const base=process.env.RESET_BASE_URL||'http://127.0.0.1:3892';
const output=path.resolve('tmp/reset-rush-workflow-browser');
const report={checks:[],screenshots:[],errors:[]};
const saved=p=>p.evaluate(()=>JSON.parse(localStorage.getItem('reset-rush-v5')));
async function main(){
 assert.equal((await fetch(`${base}/game/reset-rush`)).status,200);
 fs.mkdirSync(output,{recursive:true});
 const E=await (await import('./tests/helpers/load-typescript-module.mjs')).loadTypescriptModule('src/components/resetRush/engine.ts');
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--disable-features=SpeechSynthesis']});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  await context.addInitScript(()=>{if(window.speechSynthesis)window.speechSynthesis.speak=()=>{};});
  const page=await context.newPage();
  page.on('pageerror',e=>report.errors.push(e.message));
  page.on('console',e=>{if(e.type()==='error')report.errors.push(e.text());});
  const load=async()=>{await page.goto(`${base}/game/reset-rush`,{waitUntil:'networkidle'});await page.waitForFunction(()=>window.render_game_to_text&&JSON.parse(window.render_game_to_text()).ready!==false);};
  const inject=async g=>{await page.evaluate(g=>localStorage.setItem('reset-rush-v5',JSON.stringify(g)),g);await load();};
  const shot=async name=>{
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
   const file=path.join(output,`${name}.png`);const pixels=inspectPng(await page.screenshot({path:file,animations:'disabled'}));
   report.screenshots.push({file,pixels,state:await page.evaluate(()=>JSON.parse(window.render_game_to_text()))});
  };
  const advance=async minutes=>{const old=await saved(page);await page.evaluate(n=>window.advanceTime(n*60000),minutes);await page.waitForFunction(minute=>JSON.parse(window.render_game_to_text()).minute===minute,Math.min(480,old.minute+minutes));};
  await load();await page.locator('#start-game').click();await page.getByRole('button',{name:'关闭弹窗'}).click();
  const long=E.createGame(1880,21);long.players[0].projects[0].need=1000;
  await inject(long);
  await page.locator('#studio-configuration').selectOption('adaptive');
  const slider=page.locator('#studio-threads');await slider.focus();await slider.press('ArrowRight');await slider.press('ArrowRight');
  await page.locator('#studio-collaboration').selectOption('3');
  assert.equal((await saved(page)).players[0].energy,6);
  assert.equal(await page.getByTestId('project-team').count(),1);
  assert.equal(await page.getByTestId('project-team').getAttribute('data-team-size'),'3');
  assert.match(await page.getByTestId('project-team').innerText(),/摸底中/);
  assert.doesNotMatch(await page.getByTestId('project-team').innerText(),/风险 0%/);
  await page.getByTestId('project-team').scrollIntoViewIfNeeded();await shot('01-shared-project-unknown');
  await advance(250);let g=await saved(page);
  assert.equal(g.players[0].projects[0].understood,true);assert.equal(g.players[0].lanes[0].development.effort,'high');
  assert.ok(g.players[0].experience.luna.work<60);
  await page.locator('#end-day').click();await page.locator('#confirm-end-day').click();await page.locator('#next-day').click();
  g=await saved(page);assert.equal(g.players[0].experience.luna.work,60);
  assert.equal(g.players[0].lanes[0].development.effort,'medium');
  assert.match(await page.getByTestId('project-team').innerText(),/0% \/ 20/);
  await page.getByTestId('project-team').scrollIntoViewIfNeeded();await shot('02-learned-and-downshifted');
  report.checks.push('UI controls form a single three-agent team; real work reveals complexity and calibrates Luna, auto downshifts XHigh -> High -> Medium');

  const pair=E.createGame(1881,21);pair.players[0].projects[0].need=1000;pair.players[0].projects[0].understood=true;
  pair.players[0].projects.push({...pair.players[0].projects[0],id:++pair.serial,name:'复杂工具链',difficulty:3,challenge:0});
  for(const m of Object.keys(E.MODELS))pair.players[0].experience[m]={edition:E.modelEdition(pair,m).name,work:60};
  await inject(pair);await page.locator('#studio-configuration').selectOption('adaptive');
  await page.locator('#studio-threads').focus();await page.locator('#studio-threads').press('ArrowRight');
  const teams=page.getByTestId('project-team');assert.equal(await teams.count(),2);
  assert.match(await teams.nth(0).innerText(),/Luna · Medium/);assert.match(await teams.nth(1).innerText(),/Sol · XHigh/);
  await teams.nth(0).scrollIntoViewIfNeeded();await shot('03-different-project-configs');
  await page.locator('#studio-turbo').check();g=await saved(page);assert.equal(g.studio.configuration,'adaptive');assert.ok(g.players[0].lanes.every(l=>l.development.turbo));
  await page.getByTestId('experience-notes').locator('summary').click();
  await page.locator('#reset-command').scrollIntoViewIfNeeded();await shot('04-simple-global-strategies');
  const before=await saved(page);await load();assert.deepEqual(await saved(page),before);
  await page.getByRole('button',{name:'重置冲刺',exact:true}).click();assert.equal((await saved(page)).studio.configuration,'fixed');
  report.checks.push('Different project configurations, separate Turbo, fixed preset fallback and reload persistence');

  for(const width of [390,320]){
   await page.setViewportSize({width,height:844});await inject(long);
   await page.locator('#studio-configuration').selectOption('adaptive');await page.locator('#studio-collaboration').selectOption('3');
   await page.locator('#studio-threads').focus();await page.locator('#studio-threads').press('ArrowRight');await page.locator('#studio-threads').press('ArrowRight');
   await page.locator('#studio-configuration').scrollIntoViewIfNeeded();await shot(`05-mobile-${width}-strategies`);
   await page.locator('#end-day').click();await page.locator('#confirm-end-day').click();assert.equal((await saved(page)).phase,'reveal');await page.locator('#next-day').click();
   assert.equal((await saved(page)).players[0].lanes.filter(l=>l.projects.length).length,3);
  }
  report.checks.push('390px and 320px layouts: configure cooperative auto mode and advance the day without horizontal overflow');

  await page.setViewportSize({width:1440,height:1000});await inject(E.createGame(1882,21));
  await page.locator('#studio-configuration').selectOption('adaptive');await page.locator('#studio-turbo').check();
  await page.locator('#studio-threads').focus();await page.locator('#studio-threads').press('ArrowRight');
  for(let day=1;day<=21;day++){
   g=await saved(page);assert.equal(g.day,day);
   if(g.players[0].projects.length<3&&g.players[0].energy>0)await page.locator(`[data-project="${g.market[0].id}"]`).click();
   await page.locator('#end-day').click();await page.locator('#confirm-end-day').click();assert.equal((await saved(page)).phase,'reveal');await page.locator('#next-day').click();
  }
  g=await saved(page);assert.equal(g.phase,'over');assert.ok(g.players[0].shipped.length>=4);
  await page.evaluate(()=>window.scrollTo(0,0));await shot('06-full-season-ranking');
  report.checks.push(`21-day UI season: ${g.players[0].shipped.length} works, ${E.score(g.players[0]).total} VP`);
  assert.deepEqual(report.errors,[]);
 }finally{await browser.close();}
}
main().then(()=>{fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({checks:report.checks,screenshots:report.screenshots.map(x=>x.file),errors:report.errors},null,2));}).catch(e=>{fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'failure.json'),JSON.stringify({error:e.stack,...report},null,2));console.error(e);process.exitCode=1;});
