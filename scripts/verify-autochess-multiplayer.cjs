const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
let chromium;
for (const module of [process.env.PLAYWRIGHT_MODULE,'playwright','C:/Users/yuiffy/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright'].filter(Boolean)) {
 try { ({chromium}=require(module)); break; } catch { /* next installed copy */ }
}
if (!chromium) throw new Error('Playwright unavailable');
const base=process.env.AUTOCHESS_BASE_URL||'http://127.0.0.1:3891';
const out='tmp/autochess-native';const errors=[];const captures=[];
const state=p=>p.evaluate(()=>JSON.parse(window.render_game_to_text()));
const phase=(p,expected)=>p.waitForFunction(v=>window.render_game_to_text&&(JSON.parse(window.render_game_to_text()).multiplayer?.phase||JSON.parse(window.render_game_to_text()).phase)===v,expected,{timeout:45000});
const idle=p=>p.waitForFunction(()=>!JSON.parse(window.render_game_to_text()).multiplayer?.busy);
async function capture(p,name) {
 await p.waitForTimeout(350);
 await p.waitForFunction(()=>[...document.images].filter(i=>{const r=i.getBoundingClientRect();return r.width&&r.height&&r.top<innerHeight&&r.bottom>0;}).every(i=>i.complete&&i.naturalWidth>0));
 const metrics=inspectPng(await p.screenshot({path:path.join(out,name+'.png'),fullPage:true}));
 assert.ok(metrics.nearBlackRatio<.95);assert.ok(metrics.colors>20);assert.equal(metrics.transparentRatio,0);
 const layout=await p.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+2,canvas:[...document.querySelectorAll('canvas')].map(c=>({w:c.width,h:c.height,rect:c.getBoundingClientRect().toJSON()}))}));
 assert.equal(layout.overflow,false);layout.canvas.forEach(c=>assert.ok(c.w>0&&c.h>0));
 const entry={name,metrics,layout,state:await state(p)};captures.push(entry);fs.writeFileSync(path.join(out,name+'.json'),JSON.stringify(entry,null,2));
}
async function buy(p,count=1) {
 for(let i=0;i<count;i++) {await idle(p);const button=p.locator('.rift-shop-list button.rift-dom-shop-card:not(:disabled)').first();if(!await button.count())break;const before=(await state(p)).player.gold;await button.click();await p.waitForFunction(g=>JSON.parse(window.render_game_to_text()).player.gold<g,before);await idle(p);}
}
async function point(p,x,y) {
 const c=p.locator('[data-game-canvas="rift-line"]');const box=await c.boundingBox();const logical=await c.evaluate(c=>({w:Number(c.dataset.logicalWidth),h:Number(c.dataset.logicalHeight)}));const scale=Math.min(box.width/logical.w,box.height/logical.h);return {x:box.x+(box.width-logical.w*scale)/2+x*scale,y:box.y+(box.height-logical.h*scale)/2+y*scale};
}
async function drag(p,from,to) {const a=await point(p,...from),b=await point(p,...to);await p.mouse.move(a.x,a.y);await p.mouse.down();await p.mouse.move(b.x,b.y,{steps:16});await p.mouse.up();await idle(p);}
async function lobby(p) {await p.getByRole('button',{name:'房间 / 战报',exact:true}).click();await p.getByRole('button',{name:'返回多人大厅',exact:true}).click();await phase(p,'lobby');}
(async()=>{
 assert.equal((await fetch(base+'/game/autochess',{signal:AbortSignal.timeout(15000)})).status,200);
 fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({channel:'chrome',headless:process.env.AUTOCHESS_HEADED!=='1',args:['--mute-audio','--disable-speech-api']});
 async function page(url='/game/autochess',init) {
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  await context.addInitScript(()=>{if(window.speechSynthesis)window.speechSynthesis.speak=()=>{};});if(init)await context.addInitScript(init.fn,init.value);
  const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));p.on('console',e=>{if(e.type()==='error')errors.push(e.text());});await p.goto(base+url);return p;
 }
 try {
 const host=await page();await phase(host,'title');await capture(host,'01-default-classic');
 await host.locator('.rift-dom-choice').first().click();await phase(host,'preparation');
 const campaignSave=await host.evaluate(()=>localStorage.getItem('rift-line-active-run'));assert.ok(campaignSave);
 await host.getByRole('link',{name:'多人模式beta',exact:true}).click();await phase(host,'lobby');await capture(host,'02-beta-lobby');
 await host.getByRole('button',{name:'开始本地对局',exact:true}).click();await phase(host,'preparation');await capture(host,'03-native-preparation');
 // Actual pointer drag through original Phaser input, not debug move calls.
 await drag(host,[696,329],[96,261]);await host.waitForFunction(()=>window.autoChessAI.bridge.engine.state.board[0]?.id==='nori');
 await drag(host,[96,261],[696,570]);await host.waitForFunction(()=>window.autoChessAI.bridge.engine.state.board[0]===null);
 assert.equal((await state(host)).player.gold,11);
 await buy(host,2);
 await host.locator('.rift-shop-list .rift-shop-card-wrap').filter({has:host.locator('button')}).first().hover();await capture(host,'04-native-shop-details');await host.mouse.move(10,10);
 await host.getByRole('button',{name:'阵容羁绊',exact:true}).click();await capture(host,'05-native-traits');await host.getByRole('button',{name:'关闭面板',exact:true}).click();
 await host.getByRole('button',{name:'图鉴 / 本局天赋',exact:true}).click();await capture(host,'06-native-codex');await host.keyboard.press('Escape');
 await host.getByRole('button',{name:'游戏设置',exact:true}).first().click();await capture(host,'07-native-settings');await host.getByRole('button',{name:'关闭设置',exact:true}).click();
 await host.getByRole('button',{name:/准备好了/}).first().click();await phase(host,'review');
 assert.equal(await host.getByRole('button',{name:'暂停战斗',exact:true}).count(),0);await host.getByRole('button',{name:'查看统计',exact:true}).click();await capture(host,'08-native-statistics');
 await host.getByRole('button',{name:'收起统计',exact:true}).click();
 await host.evaluate(()=>{const b=window.autoChessAI.bridge;b.dispatch({type:'inspectFighter',fid:b.engine.state.battle.player[0].fid});});await capture(host,'09-native-inspector');await host.getByRole('button',{name:'关闭角色战况',exact:true}).click();
 await host.waitForFunction(()=>JSON.parse(window.render_game_to_text()).multiplayer.stage==='settlement');assert.equal((await state(host)).multiplayer.replayComplete,true);
 await host.getByRole('button',{name:'本轮战报',exact:true}).click();await capture(host,'10-native-report');await host.getByRole('button',{name:'关闭房间面板',exact:true}).click();
 await phase(host,'preparation');assert.equal((await state(host)).round,2);
 for(const width of [390,320]) {
  await host.setViewportSize({width,height:844});await capture(host,`11-mobile-${width}`);
  await host.getByRole('button',{name:'房间 / 战报',exact:true}).click();await capture(host,`12b-mobile-room-${width}`);await host.getByRole('button',{name:'关闭房间面板',exact:true}).click();
  await host.locator('.rift-dom-mobile-actions button').first().click();await host.locator('.rift-shop-card-info').first().click();await capture(host,`12-mobile-shop-${width}`);await host.getByRole('button',{name:'关闭面板',exact:true}).click();
 }
 await host.setViewportSize({width:1440,height:1000});await host.reload();await phase(host,'lobby');await host.getByRole('button',{name:'恢复上次本地对局',exact:true}).click();await phase(host,'preparation');assert.equal((await state(host)).round,2);
 assert.equal(await host.evaluate(()=>localStorage.getItem('rift-line-active-run')),campaignSave,'multiplayer never overwrites the traditional campaign');
 await lobby(host);
 await host.getByRole('button',{name:/多人混战/}).click();await host.getByRole('button',{name:'在线联机',exact:true}).click();await host.getByLabel('你的名字',{exact:true}).fill('原版界面房主');await host.getByLabel('总人数',{exact:true}).selectOption('3');await host.getByLabel('电脑人数',{exact:true}).selectOption('1');
 await host.getByRole('button',{name:'创建在线房间',exact:true}).click();await phase(host,'room');const code=(await state(host)).code;
 fs.writeFileSync(path.join(out,'created-room.json'),JSON.stringify({code}));
 const guest=await page(`/game/autochess?room=${code}`);await phase(guest,'lobby');await guest.getByLabel('你的名字',{exact:true}).fill('原版界面队友');await guest.getByRole('button',{name:'加入',exact:true}).click();await phase(guest,'room');
 const start=host.getByRole('button',{name:'全员到齐，开始对局',exact:true});await start.click();await Promise.all([phase(host,'preparation'),phase(guest,'preparation')]);
 await Promise.all([buy(host),buy(guest)]);assert.equal((await state(host)).multiplayer.pairings.filter(p=>p.ghost).length,1);
 await host.getByRole('button',{name:/准备好了/}).first().click();await host.getByRole('button',{name:/取消准备/}).first().waitFor();
 const gold=(await state(host)).player.gold;await host.evaluate(()=>window.autoChessAI.bridge.dispatch({type:'reroll'}));assert.equal((await state(host)).player.gold,gold);
 await host.getByRole('button',{name:/取消准备/}).first().click();await idle(host);await capture(guest,'13-online-native');
 await Promise.all([host.getByRole('button',{name:/准备好了/}).first().click(),guest.getByRole('button',{name:/准备好了/}).first().click()]);await Promise.all([phase(host,'review'),phase(guest,'review')]);
 assert.deepEqual((await state(host)).multiplayer.players.map(p=>p.hp),(await state(guest)).multiplayer.players.map(p=>p.hp));
 assert.equal(await host.getByRole('button',{name:'暂停战斗',exact:true}).count(),0);await host.waitForTimeout(1200);assert.ok((await state(host)).multiplayer.timeline);
 await capture(host,'14-online-battle');await Promise.all([phase(host,'preparation'),phase(guest,'preparation')]);
 await host.evaluate(()=>window.autoChessAI.bridge.setEnemyFormationOpen(true));await capture(host,'15-native-scout');await host.getByRole('button',{name:'关闭敌方部署图',exact:true}).click();
 await host.reload();await phase(host,'lobby');await host.getByRole('button',{name:new RegExp(`恢复.*${code}`)}).click();await phase(host,'preparation');assert.equal((await state(host)).round,2);
 // Deterministic local rescue and forge fixtures enter via supported save restore.
 const {loadTypescriptModule}=await import('./tests/helpers/load-typescript-module.mjs');const r=await loadTypescriptModule('src/components/autoChessGame/multiplayer/room.ts');
 let fixture=r.createRoom('LOCAL','local','救援验证',{mode:'coop',seats:2,aiCount:1,prepSeconds:120,isPublic:false});fixture=r.applyCommand(fixture,0,{kind:'start'},927);
 fixture.match.players[0].snapshot.state.board.fill(null);const board=fixture.match.players[1].snapshot.state.board;board.fill(null);['sui_cat','biscuit_sui','nori'].forEach((id,i)=>{board[i]={id,star:3,uid:i+10};});
 const rescue=await page('/game/autochess?mode=multiplayer',{fn:v=>localStorage.setItem('rift-multiplayer-local-v1',JSON.stringify(v)),value:fixture});await rescue.getByRole('button',{name:'恢复上次本地对局',exact:true}).click();await phase(rescue,'preparation');await rescue.getByRole('button',{name:/准备好了/}).first().click();await phase(rescue,'review');
 await rescue.waitForFunction(()=>JSON.parse(window.render_game_to_text()).multiplayer.stage==='rescue');assert.equal((await state(rescue)).multiplayer.battleIndex,2);await rescue.waitForFunction(()=>JSON.parse(window.render_game_to_text()).multiplayer.stage==='settlement');assert.equal((await state(rescue)).multiplayer.players[0].hp,20);await rescue.getByRole('button',{name:'本轮战报',exact:true}).click();await capture(rescue,'16-native-rescue');
 const ai=await page('/game/autochess?mode=multiplayer');await ai.getByRole('button',{name:'开始本地对局',exact:true}).click();await phase(ai,'preparation');
 await ai.getByRole('button',{name:'游戏设置',exact:true}).click();await ai.getByRole('radio',{name:'稳健',exact:true}).click();await ai.getByRole('radio',{name:'老手',exact:true}).click();await ai.getByRole('button',{name:'关闭设置',exact:true}).click();
 const aiRevision=(await state(ai)).multiplayer.players[0].revision;await ai.getByRole('button',{name:'手动指挥',exact:true}).click();
 await ai.waitForFunction(r=>JSON.parse(window.render_game_to_text()).multiplayer.players[0].revision>r,aiRevision,{timeout:45000});
 await phase(ai,'review');assert.equal((await state(ai)).interface.autoplayEnabled,true);assert.equal((await state(ai)).interface.autoplayPreferenceStyle,'survival');
 await ai.locator('.rift-toolbar button[aria-pressed="true"]').first().click();assert.equal((await state(ai)).interface.autoplayEnabled,false);await capture(ai,'17-native-autoplay');
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({realApi:true,code,captures,errors},null,2));console.log('Native UI, controls, mobile, campaign save isolation, dual-browser multiplayer and rescue verified.');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
