const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || require.resolve('playwright', { paths: [process.cwd(), path.join(os.homedir(), '.codex', 'skills', 'develop-web-game')] }));
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const base = process.env.RESET_BASE_URL || 'http://127.0.0.1:3888';
const output = path.resolve(process.env.RESET_QA_DIR || 'tmp/reset-rush-v3-verify');
const report = { screenshots: [], errors: [], checks: [], actions: {}, reveals: {} };
const read = p => p.evaluate(() => JSON.parse(window.render_game_to_text()));
const saved = p => p.evaluate(() => JSON.parse(localStorage.getItem('reset-rush-v3')));
let E;
async function load(p) {
  await p.goto(`${base}/game/reset-rush`, { waitUntil: 'networkidle' });
  await p.waitForFunction(() => window.render_game_to_text && JSON.parse(window.render_game_to_text()).ready !== false);
}
async function shot(p, name, fullPage = true) {
  await p.evaluate(() => document.fonts.ready);
  if (fullPage) await p.evaluate(() => window.scrollTo({top:0,behavior:'instant'}));
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),false,`${name}: horizontal overflow`);
  const file=path.join(output,`${name}.png`);
  const pixels=inspectPng(await p.screenshot({path:file,fullPage,animations:'disabled'}));
  report.screenshots.push({file,pixels,state:await read(p)});
}
async function quiet(context) { await context.addInitScript(() => { if(window.speechSynthesis)window.speechSynthesis.speak=()=>{}; }); }
function errors(p) { p.on('pageerror',e=>report.errors.push(e.message));p.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());}); }
async function inject(p, state, key='reset-rush-v3') {
  await p.evaluate(({state,key})=>{localStorage.removeItem('reset-rush-v1');localStorage.removeItem('reset-rush-v2');localStorage.removeItem('reset-rush-v3');localStorage.setItem(key,JSON.stringify(state));},{state,key});
  await load(p);
}
async function perform(p,a) {
  let before=await saved(p);assert.equal(E.actionError(before,0,a),null,JSON.stringify(a));
  report.actions[a.type]=(report.actions[a.type]||0)+1;
  if(a.type==='dispatch') {
    await p.getByRole('button',{name:'＋ 新线程',exact:true}).click();
    if(a.lane!==null)await p.locator('#reset-lane').selectOption(String(a.lane));
    for(const j of before.players[0].projects){
      const button=p.locator(`[data-project="${j.id}"]`);const selected=await button.getAttribute('aria-pressed')==='true';
      if(selected!==a.projects.includes(j.id))await button.click();
    }
    await p.locator('#reset-account').selectOption(String(a.account));
    await p.locator(`[data-model="${a.model}"]`).click();await p.locator('#reset-effort').selectOption(a.effort);await p.locator('#reset-turbo').setChecked(a.turbo);
    before=await saved(p);await p.locator('#develop').click();
  } else if(a.type==='claim')await p.locator(`[data-project="${a.project}"]`).click();
  else if(a.type==='bank'){
    const index=before.players[0].accounts.findIndex(x=>x.id===a.account);await p.getByRole('button',{name:`选择账号 ${index+1}`,exact:true}).click();await p.getByRole('button',{name:/使用银行券/}).click();
  } else if(a.type==='pause'||a.type==='remove-lane')await p.locator(`[data-lane="${a.lane}"]`).getByRole('button',{name:a.type==='pause'?'暂停':'解散',exact:true}).click();
  else if(a.type==='test'||a.type==='abandon'){
    const button=p.locator(`[data-project="${a.project}"]`);
    if(await button.getAttribute('aria-pressed')!=='true')await button.click();
    await p.getByRole('button',{name:a.type==='test'?/亲自排障/:/放弃选中首项/}).click();
  }
  else if(a.type==='rest'||a.type==='freelance')await p.locator(`#${a.type}`).click();
  else if(a.type==='next')await p.locator('#next-node').click();
  else if(a.type==='advance')await p.locator(a.minutes===30?'#advance-30':'#advance-120').click();
  else if(['buy','upgrade','renew','renewal'].includes(a.type)){
    const already=await p.locator('dialog[open]').count();if(!already)await p.getByRole('button',{name:'账号管理',exact:true}).click();
    if(a.type==='buy')await p.getByRole('button',{name:'开新号 · 只花钱',exact:true}).nth([20,100,200].indexOf(a.tier)).click();
    else if(a.type==='renewal')await p.locator(`[data-renewal="${a.account}"]`).selectOption(String(a.tier??0));
    else {
      const row=p.locator(`[data-managed-account="${a.account}"]`);
      if(a.type==='upgrade')await row.getByRole('button',{name:new RegExp(`→ ${E.PLANS[a.tier].name}`)}).click();
      else await row.getByRole('button',{name:'$'+a.tier+' 续开 '+E.PLANS[a.tier].name,exact:true}).click();
    }
    if(!already)await p.getByRole('button',{name:'关闭弹窗'}).click();
  } else throw new Error(`Unhandled action ${a.type}`);
  await p.waitForFunction(() => window.render_game_to_text && JSON.parse(window.render_game_to_text()).version===3);
  assert.deepEqual(await saved(p),E.act(before,a),`UI matches reducer: ${a.type}`);
}
(async()=>{
  fs.mkdirSync(output,{recursive:true});
  assert.equal((await fetch(`${base}/game/reset-rush`)).status,200,'responsive server before launching browser');
  E=await (await import('./tests/helpers/load-typescript-module.mjs')).loadTypescriptModule('src/components/resetRush/engine.ts');
  const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--disable-features=SpeechSynthesis']});
  try{
    const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});await quiet(context);const p=await context.newPage();errors(p);await load(p);
    await shot(p,'01-intro');await p.locator('#reset-length').selectOption('21');await p.locator('#start-game').click();await p.locator('dialog[open]').waitFor();
    let g=await saved(p);await perform(p,{type:'upgrade',account:g.players[0].accounts[0].id,tier:200});await perform(p,{type:'buy',tier:200});
    g=await saved(p);assert.equal(g.minute,0);assert.equal(g.players[0].energy,12);assert.equal(g.players[0].cash,100);
    await perform(p,{type:'renewal',account:g.players[0].accounts[0].id,tier:20});await perform(p,{type:'renewal',account:g.players[0].accounts[1].id,tier:null});await shot(p,'02-free-account-management',false);await p.getByRole('button',{name:'关闭弹窗'}).click();
    for(let i=0;i<3;i++){g=await saved(p);await perform(p,{type:'claim',project:g.market[0].id});}
    g=await saved(p);const paidIds=g.players[0].projects.slice(0,3).map(j=>j.id);const freeId=g.players[0].projects[3].id;
    await perform(p,{type:'dispatch',lane:null,projects:paidIds,account:g.players[0].accounts[0].id,model:'astra',effort:'ultra',turbo:true});
    await perform(p,{type:'dispatch',lane:null,projects:[freeId],account:g.players[0].accounts[0].id,model:'luna',effort:'medium',turbo:false});
    const start=await saved(p);assert.equal(start.minute,0);assert.equal(start.players[0].used,0);await shot(p,'03-parallel-queues');
    await perform(p,{type:'advance',minutes:120});g=await saved(p);assert.equal(g.minute,120);assert.equal(g.players[0].accounts[0].quota,0);assert.equal(g.players[0].shipped.length,1);assert.ok(g.players[0].projects.find(j=>j.id===freeId).work>0);await shot(p,'04-continuous-quota-and-completion');
    await perform(p,{type:'bank',account:g.players[0].accounts[0].id});await perform(p,{type:'advance',minutes:30});await perform(p,{type:'rest'});
    g=await saved(p);const lane=g.players[0].lanes[0];await perform(p,{type:'pause',lane:lane.id});const paused=await saved(p);assert.equal(paused.minute,g.minute);assert.equal(paused.players[0].energy,g.players[0].energy);
    await perform(p,{type:'dispatch',lane:lane.id,account:g.players[0].accounts[1].id,projects:lane.projects,model:'astra',effort:'xhigh',turbo:false});await perform(p,{type:'freelance'});
    g=await saved(p);await load(p);assert.deepEqual(await saved(p),g,'reload keeps clock, queues and partial quota');report.checks.push('free account management, many projects, shared account, continuous completion, bank resume, pause/reassign, background rest/freelance, save reload');
    // Independently change all configuration controls without executing work.
    const configurationBaseline=await saved(p);
    for(const model of Object.keys(E.MODELS))for(const effort of Object.keys(E.EFFORTS))for(const turbo of [false,true]){
      await p.locator(`[data-model="${model}"]`).click();await p.locator('#reset-effort').selectOption(effort);await p.locator('#reset-turbo').setChecked(turbo);
      const s=await saved(p);assert.deepEqual(s.development,{model,effort,turbo});assert.equal(s.minute,configurationBaseline.minute);assert.deepEqual(s.players,configurationBaseline.players);
    }
    await p.locator('#reset-command').scrollIntoViewIfNeeded();await shot(p,'05-model-effort-turbo-planner',false);report.checks.push('36 independent configurations with no time or energy charge');
    await p.locator('#end-day').click();await shot(p,'06-night-reveal');await p.locator('#next-day').click();assert.equal((await read(p)).day,2);
    // Old saves stay present after v3 migration.
    const v2=JSON.parse(fs.readFileSync(path.join(__dirname,'tests/fixtures/reset-rush-v2.json'),'utf8'));v2.cursor=4;
    await inject(p,v2,'reset-rush-v2');assert.equal((await saved(p)).version,3);assert.equal((await saved(p)).minute,160);assert.equal(await p.evaluate(()=>JSON.parse(localStorage.getItem('reset-rush-v2')).version),2);
    await perform(p,{type:'dispatch',lane:null,projects:[(await saved(p)).players[0].projects[0].id],account:(await saved(p)).players[0].accounts[0].id,model:'luna',effort:'medium',turbo:false});await perform(p,{type:'advance',minutes:30});report.checks.push('actual v2 migration preserves old key and resumes development');
    // Timing controls, human intervention, reorder and lane removal get independent scenarios.
    let edge=E.createGame(864,21);edge.players[0].projects[0].need=1;
    edge=E.act(edge,{type:'dispatch',lane:null,projects:[edge.players[0].projects[0].id],account:edge.players[0].accounts[0].id,model:'sol',effort:'medium',turbo:false});
    await inject(p,edge);await perform(p,{type:'next'});assert.equal((await saved(p)).minute,6);assert.equal((await saved(p)).players[0].shipped.length,1);
    edge=E.createGame(19,21);edge.players[0].projects[0].bugs=2;
    await inject(p,edge);await perform(p,{type:'test',project:edge.players[0].projects[0].id});assert.equal((await saved(p)).minute,30);assert.equal((await saved(p)).players[0].projects[0].bugs,0);
    await perform(p,{type:'abandon',project:edge.players[0].projects[0].id});assert.equal((await saved(p)).players[0].projects.length,0);
    edge=E.createGame(119,21);edge=E.act(edge,{type:'claim',project:edge.market[0].id});await inject(p,edge);
    await p.getByRole('button',{name:'全选可安排项目',exact:true}).click();await p.getByRole('button',{name:/优先处理/}).first().click();
    const ordered=[edge.players[0].projects[1].id,edge.players[0].projects[0].id];await p.locator('#develop').click();assert.deepEqual((await saved(p)).players[0].lanes[0].projects,ordered);
    await perform(p,{type:'remove-lane',lane:(await saved(p)).players[0].lanes[0].id});assert.equal((await saved(p)).players[0].lanes.length,0);assert.equal((await saved(p)).players[0].projects.length,2);
    const hookBefore=await saved(p);await p.evaluate(()=>window.advanceTime(60000));assert.deepEqual(await saved(p),E.advanceMinutes(hookBefore,1));
    report.checks.push('next-node, manual repair, abandonment, queue reorder, lane dissolution and deterministic time hook');
    // Start a fresh season and play using actual controls, with public-state bot guidance for the human.
    if(process.env.RESET_SKIP_SEASON!=='1'){
      await inject(p,E.createGame(5194,21));let turns=0;
      while((g=await saved(p)).phase!=='over' && turns++<1200){
        if(g.phase==='reveal'){report.reveals[g.receipt.kind]=(report.reveals[g.receipt.kind]||0)+1;await p.locator('#next-day').click();if(g.day%5===0)console.log(`Played ${g.day}/21 days through UI`);}
        else {const a=E.chooseAction(g,0,'balanced');if(a.type==='pass')await perform(p,{type:'advance',minutes:120});else await perform(p,a);}
      }
      assert.equal(g.phase,'over');assert.equal(g.day,21);assert.ok(g.players[0].shipped.length>8);report.checks.push(`complete 21-day season: ${g.players[0].shipped.length} releases, ${E.score(g.players[0]).total} VP`);await shot(p,'07-season-ranking');
    }
    // Mobile uses the same playable state and actual touch events.
    for(const width of [390,320]){
      const touch=await browser.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1,reducedMotion:'reduce'});await quiet(touch);const m=await touch.newPage();errors(m);await load(m);await m.locator('#start-game').tap();await m.getByRole('button',{name:'关闭弹窗'}).tap();
      await m.locator('#develop').tap();await m.locator('#advance-30').tap();assert.equal((await read(m)).minute,30);await shot(m,`08-mobile-${width}-board`);
      await m.getByRole('link',{name:'调度 ↓',exact:true}).tap();await m.locator('#reset-command').scrollIntoViewIfNeeded();await shot(m,`09-mobile-${width}-planner`,false);
      await m.getByRole('button',{name:'账号管理',exact:true}).tap();await m.locator('[data-renewal]').first().selectOption('0');await m.getByRole('button',{name:'关闭弹窗'}).tap();assert.equal((await saved(m)).players[0].accounts[0].renewal,null);await touch.close();
    }
    report.checks.push('390/320 touch: start, dispatch, time, account policy, queue navigation; no horizontal overflow');
    await inject(p,E.createGame(888,21));await p.keyboard.press('f');await p.waitForFunction(()=>!!document.fullscreenElement);await p.keyboard.press('Escape');await p.getByRole('button',{name:/玩法说明/}).click();assert.match(await p.locator('dialog').innerText(),/480 分钟/);await p.keyboard.press('Escape');assert.equal(await p.locator('dialog[open]').count(),0);
    await p.getByRole('button',{name:'重新开局'}).click();await p.getByRole('button',{name:'回到准备页'}).click();assert.equal((await read(p)).phase,'intro');report.checks.push('fullscreen, keyboard dialogs, confirmed restart');
    assert.deepEqual(report.errors,[]);console.log(JSON.stringify({checks:report.checks,actions:report.actions,reveals:report.reveals,screenshots:report.screenshots.map(s=>s.file),errors:report.errors},null,2));
  }finally{await browser.close();fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));}
})().catch(e=>{report.errors.push(e.stack);fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));console.error(e);process.exitCode=1;});
