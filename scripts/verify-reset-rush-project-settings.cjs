const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require(require.resolve('playwright',{paths:[process.cwd(),'C:/Users/yuiffy/.codex/skills/develop-web-game']}));
const {inspectPng} = require('./lib/autochess-screenshot.cjs');
const base=process.env.RESET_BASE_URL||'http://127.0.0.1:3892';
const output=path.resolve('tmp/reset-rush-project-browser');
const report={checks:[],screenshots:[],errors:[]};
async function main(){
 assert.equal((await fetch(`${base}/game/reset-rush`)).status,200);
 fs.mkdirSync(output,{recursive:true});
 const E=await (await import('./tests/helpers/load-typescript-module.mjs')).loadTypescriptModule('src/components/resetRush/engine.ts');
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--disable-features=SpeechSynthesis']});
 try {
  const context=await browser.newContext({locale:'zh-CN',viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  await context.addInitScript(()=>{if(window.speechSynthesis)window.speechSynthesis.speak=()=>{};});
  const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));page.on('console',e=>{if(e.type()==='error')report.errors.push(e.text());});
  const saved=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('reset-rush-v5')));
  const load=async()=>{await page.goto(`${base}/game/reset-rush`,{waitUntil:'networkidle'});await page.waitForFunction(()=>window.render_game_to_text&&JSON.parse(window.render_game_to_text()).ready!==false);};
  const inject=async g=>{await page.evaluate(g=>localStorage.setItem('reset-rush-v5',JSON.stringify(g)),g);await load();};
  const shot=async name=>{
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
   const file=path.join(output,`${name}.png`);const pixels=inspectPng(await page.screenshot({path:file,animations:'disabled'}));
   report.screenshots.push({file,pixels,state:await page.evaluate(()=>JSON.parse(window.render_game_to_text()))});
  };
  const fresh=()=>{
   let g=E.createGame(433,21);const p=g.players[0];p.projects[0].need=1000;p.projects[0].understood=true;
   p.projects.push({...p.projects[0],id:++g.serial,name:'另一个项目'});
   for(const m of Object.keys(E.MODELS))p.experience[m]={edition:E.modelEdition(g,m).name,work:60};
   g=E.act(g,{type:'buy',tier:200});g=E.act(g,{type:'buy',tier:100});g.studio.collaboration=1;
   const other=g.players[1];const template={...other.projects[0]};
   for(let i=0;i<30;i++)other.shipped.push({...template,id:++g.serial,name:`作品 ${i+1}：长列表关闭测试`,work:template.need,checked:template.need,understood:true,qualityWork:0,delivery:{grade:'合格',cash:25,vp:6}});
   assert.ok(E.restoreGame(JSON.stringify(g)));return g;
  };
  await load();await page.locator('#start-game').click();await page.getByRole('button',{name:'关闭弹窗'}).click();await page.locator('#next-node').click();assert.ok((await saved()).minute>0);
  for(const width of [1440,390,320]) {
   await page.setViewportSize({width,height:width===1440?1000:844});await inject(fresh());
   assert.equal(await page.locator('#reset-project-settings').getAttribute('open'),null);
   assert.match(await page.locator('label[for="studio-threads"]').innerText(),/同时开几个 AI 对话/);
   assert.match(await page.locator('label[for="studio-collaboration"]').innerText(),/单个项目最多几个 AI 对话合作/);
   await page.locator('#studio-threads').focus();for(let i=0;i<3;i++)await page.locator('#studio-threads').press('ArrowRight');
   await page.getByTestId('project-team').first().getByRole('link',{name:/项目设置/}).click();
   assert.notEqual(await page.locator('#reset-project-settings').getAttribute('open'),null);
   await page.locator('#project-config-mode').selectOption('custom');await page.locator('#project-model').selectOption('astra');await page.locator('#project-effort').selectOption('ultra');await page.locator('#project-turbo').check();
   await page.locator('#project-collaboration').selectOption('3');
   let g=await saved();const first=g.players[0].projects[0].id;const second=g.players[0].projects[1].id;
   assert.equal(g.studio.threads,4);assert.equal(g.studio.collaboration,1);
   assert.equal(g.players[0].lanes.filter(l=>l.projects[0]===first).length,3);assert.equal(g.players[0].lanes.filter(l=>l.projects[0]===second).length,1);
   assert.ok(g.players[0].lanes.filter(l=>l.projects[0]===first).every(l=>l.development.model==='astra'&&l.development.effort==='ultra'&&l.development.turbo));
   assert.equal(g.players[0].lanes.find(l=>l.projects[0]===second).development.model,'sol');
   await page.locator('#reset-project-settings').scrollIntoViewIfNeeded();await shot(`01-project-settings-${width}`);
   await page.evaluate(()=>window.advanceTime(10*60000));await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).minute===10);
   g=await saved();assert.ok(g.players[0].projects[0].work>g.players[0].projects[1].work);await load();assert.deepEqual(await saved(),g);
   await page.locator(`[data-project="${second}"]`).click();await page.locator('#reset-project-settings > summary').click();assert.equal(await page.locator('#project-config-mode').inputValue(),'global');
   await page.locator(`[data-project="${first}"]`).click();assert.equal(await page.locator('#project-config-mode').inputValue(),'custom');
   await page.getByRole('button',{name:'恢复全部跟随全局'}).click();g=await saved();assert.equal(g.players[0].projects[0].settings,null);assert.equal(g.players[0].lanes.filter(l=>l.projects[0]===first).length,1);

   // Scroll actual dialog content with the pointer, then click the still-visible close button.
   const testModal=async (button,name)=>{
    await page.getByRole('button',{name:button,exact:true}).click();const close=page.getByRole('button',{name:'关闭弹窗'});const before=await close.boundingBox();
    const body=page.getByTestId('modal-scroll-body');assert.ok(await body.evaluate(e=>e.scrollHeight>e.clientHeight+30),`${name} should overflow`);
    await body.hover();await page.mouse.wheel(0,6000);await page.waitForFunction(()=>document.querySelector('[data-testid="modal-scroll-body"]').scrollTop>50);
    const after=await close.boundingBox();assert.ok(after.y>=0&&after.y+after.height<=await page.evaluate(()=>innerHeight));assert.ok(Math.abs(after.y-before.y)<1);
    assert.equal(await page.getByRole('dialog').evaluate(e=>e.scrollWidth>e.clientWidth+1),false);
    if(name==='portfolio'||width===390)await shot(`02-${name}-scrolled-${width}`);
    await close.click();await page.getByRole('dialog').waitFor({state:'hidden'});
   };
   await testModal('查看林工的作品与计分','portfolio');await testModal('账号管理','accounts');await testModal(/^玩法说明/,'rules');
   report.checks.push(`${width}px: collapsed per-project settings, local model/effort/Turbo, 3+1 allocation within total 4, simulation/reload, project switch and restore defaults; portfolio/shop/rules content scroll while close button stays fixed and usable`);
  }
  await page.setViewportSize({width:390,height:844});
  let tired=E.createGame(433,21);tired.development={model:'luna',effort:'medium',turbo:false};
  tired=E.act(tired,{type:'studio',...tired.studio,threads:3,collaboration:1});
  for(let i=0;i<6;i++)tired=E.act(tired,{type:'claim',project:tired.market[0].id});
  await inject(tired);const guide=page.getByTestId('energy-guide');
  assert.match(await guide.innerText(),/AI 预留 6 − 接单 6 − 其他操作 0 = 剩 0/);
  assert.match(await guide.innerText(),/现在不能接新项目/);
  for(const j of tired.market)assert.equal(await page.locator(`[data-project="${j.id}"]`).isDisabled(),true);
  await guide.locator('summary').click();await guide.scrollIntoViewIfNeeded();await shot('03-energy-empty-390');
  await guide.getByRole('button',{name:'休息恢复 3 精力 · 60 分钟'}).click();
  let rested=await saved();assert.equal(rested.players[0].energy,3);assert.equal(rested.players[0].energyLedger.restored,3);
  assert.match(await guide.innerText(),/12 \+ 休息 3/);
  for(let i=0;i<3;i++){rested=await saved();await page.locator(`[data-project="${rested.market[0].id}"]`).click();}
  assert.match(await guide.innerText(),/今天已经休息过/);await guide.scrollIntoViewIfNeeded();await shot('04-energy-after-rest-390');
  await page.locator('#end-day').click();await page.locator('#confirm-end-day').click();await page.locator('#next-day').click();rested=await saved();
  assert.equal(rested.players[0].energyLedger.claims,0);assert.equal(rested.players[0].energyLedger.restored,0);assert.equal(rested.players[0].energy,6);
  report.checks.push('Energy: 3 AI conversations cost 6, 6 new jobs cost 6, empty-state reason and disabled market, rest +3 then no second rest, next day resets ledger and reserves follow-up');

  const starter=E.createGame(434,21);await inject(starter);const expected=E.claimEnergyPreview(starter,starter.market[0].id);
  assert.equal(expected.hosting,2);assert.match(await page.locator(`[data-project="${starter.market[0].id}"]`).innerText(),/接单 1 \+ AI 跟进 2 = 3 精力/);
  await page.locator(`[data-project="${starter.market[0].id}"]`).click();assert.equal((await saved()).players[0].energy,9);
  let varied=E.createGame(435,21);varied=E.act(varied,{type:'studio',...varied.studio,threads:0});
  for(let i=0;i<7;i++)varied=E.act(varied,{type:'claim',project:varied.market[0].id});
  assert.equal(new Set(varied.players[0].projects.map(j=>j.name)).size,8);
  await page.setViewportSize({width:1440,height:1000});await inject(varied);
  await page.locator(`[data-project="${varied.players[0].projects[0].id}"]`).scrollIntoViewIfNeeded();await shot('05-varied-projects');
  assert.match(await page.locator('body').innerText(),/60 种题材/);
  report.checks.push('Market: truthful claim + new conversation cost preview; 8 distinct held projects and 60-topic catalogue');

  let morning=E.createGame(223,21);morning.players[0].projects[0].need=1000;
  for(let n=0;n<5;n++)morning.players[0].projects.push({...morning.players[0].projects[0],id:++morning.serial,name:`长项目 ${n}`});
  morning.development={model:'luna',effort:'medium',turbo:false};morning=E.act(morning,{type:'studio',...morning.studio,threads:6,collaboration:1});morning=E.nextDay(E.endDay(morning));
  assert.equal(morning.players[0].energy,0);for(const p of morning.players)delete p.energyLedger;
  await page.setViewportSize({width:390,height:844});await inject(morning);
  assert.match(await guide.innerText(),/还没开工，可调少 AI 对话立即释放预留精力/);
  await page.locator('#studio-threads').focus();for(let n=0;n<3;n++)await page.locator('#studio-threads').press('ArrowLeft');
  let rearranged=await saved();assert.equal(rearranged.players[0].energy,6);assert.equal(rearranged.minute,0);assert.equal(rearranged.players[0].energyLedger.hosting,6);
  await page.locator(`[data-project="${rearranged.market[0].id}"]`).click();rearranged=await saved();assert.equal(rearranged.players[0].energy,5);
  await guide.scrollIntoViewIfNeeded();await shot('06-morning-reservation-recovered-390');
  report.checks.push('Old save at 09:00 with 0/12 energy: decrease 6 conversations to 3, immediately release 6 energy and claim a project without advancing time');

  let coupons=E.createGame(888,21);coupons.players[0].projects[0].need=1000;coupons.players[0].accounts[0].banks=[31,32,33];coupons.development={model:'astra',effort:'ultra',turbo:true};coupons=E.act(coupons,{type:'studio',...coupons.studio,threads:1,collaboration:1});
  await inject(coupons);
  for(let n=0;n<3;n++){
   await page.evaluate(()=>window.advanceTime(10*60000));await page.waitForFunction(n=>JSON.parse(window.render_game_to_text()).minute===n,(n+1)*10);
   const button=page.getByRole('button',{name:/使用银行券/});assert.equal(await button.isEnabled(),true);await button.click();
   const now=await saved();assert.equal(now.players[0].accounts[0].banks.length,2-n);assert.equal(now.players[0].accounts[0].quota,24);assert.equal(now.day,1);
  }
  assert.equal((await saved()).players[0].banksUsed,3);
  report.checks.push('Same account uses three coupons in one day through the UI, refilling after each quota spend');
  let depleted=E.createGame(883,21);depleted.players[0].projects[0].need=1000;depleted.development={model:'astra',effort:'ultra',turbo:true};depleted=E.act(depleted,{type:'studio',...depleted.studio,threads:1,collaboration:1});
  await inject(depleted);await page.locator('#next-node').click();let stopped=await saved();
  assert.equal(stopped.phase,'plan');assert.equal(stopped.players[0].accounts[0].quota,0);assert.ok(stopped.minute<60);
  await page.locator('#next-node').click();assert.equal((await saved()).minute,stopped.minute);assert.match(await page.getByTestId('clock-help').innerText(),/免费 Luna/);
  await page.getByTestId('clock-help').scrollIntoViewIfNeeded();await shot('07-quota-stop-390');
  await page.locator('#end-day').click();assert.match(await page.getByRole('dialog').innerText(),/免费 Luna/);assert.equal((await saved()).minute,stopped.minute);
  await shot('08-finish-confirm-390');await page.getByRole('button',{name:'继续安排今天'}).click();assert.equal((await saved()).phase,'plan');
  await page.getByRole('button',{name:'账号与银行券',exact:true}).click();await page.getByRole('button',{name:'为此账号补满 · 用 1 张券',exact:true}).click();
  assert.equal((await saved()).players[0].accounts[0].quota,24);assert.equal((await saved()).minute,stopped.minute);await page.getByRole('button',{name:'关闭弹窗'}).click();
  await page.locator('#next-node').click();stopped=await saved();assert.equal(stopped.phase,'plan');assert.equal(stopped.players[0].accounts[0].quota,0);
  await page.locator('#freelance').click();assert.equal((await saved()).minute,stopped.minute+60);assert.equal((await saved()).players[0].cash,stopped.players[0].cash+25);
  await page.getByRole('button',{name:'慢跑省额',exact:true}).click();let free=await saved();assert.equal(free.development.model,'luna');
  const beforeWork=free.players[0].projects[0].work;await page.evaluate(()=>window.advanceTime(10*60000));await page.waitForFunction(m=>JSON.parse(window.render_game_to_text()).minute===m,free.minute+10);
  free=await saved();assert.ok(free.players[0].projects[0].work>beforeWork);assert.equal(free.players[0].accounts[0].quota,0);assert.equal(free.day,1);assert.equal(free.phase,'plan');
  await page.locator('#development-presets').scrollIntoViewIfNeeded();await shot('09-free-luna-390');
  await page.locator('#end-day').click();await page.locator('#confirm-end-day').click();assert.equal((await saved()).phase,'reveal');assert.equal((await saved()).day,1);
  await page.locator('#next-day').click();assert.equal((await saved()).day,2);
  report.checks.push('Clock: quota exhaustion stops on same day; repeated advance leaves time unchanged; finish can be cancelled; coupon from account dialog resumes; quota-free manual work and free Luna still work; only explicit finish reveals and next-day enters tomorrow');
  let waiting=E.createGame(885,21);waiting.players[0].energy=0;waiting.players[0].projects[0].need=1000;waiting=E.act(waiting,{type:'studio',...waiting.studio,threads:1});await inject(waiting);
  await page.locator('#rest').click();assert.equal((await saved()).minute,60);assert.equal((await saved()).players[0].energy,1);await page.locator('#next-node').click();assert.ok((await saved()).players[0].projects[0].work>0);
  report.checks.push('First default advance starts the workspace directly; resting wakes attention-starved conversations and advance resumes without another settings change');
  assert.deepEqual(report.errors,[]);
 }finally{await browser.close();}
}
main().then(()=>{fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({checks:report.checks,screenshots:report.screenshots.map(x=>x.file),errors:report.errors},null,2));}).catch(e=>{fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'failure.json'),JSON.stringify({error:e.stack,...report},null,2));console.error(e);process.exitCode=1;});
