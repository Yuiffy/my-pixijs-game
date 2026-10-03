const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require(require.resolve('playwright',{paths:[process.cwd(),path.join(require('node:os').homedir(),'.codex/skills/develop-web-game')]}));
const {inspectPng}=require('./lib/autochess-screenshot.cjs');
const url=process.env.BRICK_EXCAVATION_URL || 'http://localhost:3996/game/brick-excavation';
const output=process.env.BRICK_EXCAVATION_QA_DIR || 'tmp/brick-save-dev';
const key='brick-excavation-session-v1';
const captures=[], checks=[], errors=[];
fs.mkdirSync(output,{recursive:true});
const state=p=>p.evaluate(()=>JSON.parse(window.render_game_to_text()));
const game=s=>{const {focused,selected,previewFirst,rulesOpen,...rest}=s;return rest};
const open=async p=>{await p.goto(url,{waitUntil:'networkidle'});await p.waitForFunction(()=>!!window.render_game_to_text);await p.getByTestId('save-notice').filter({hasText:/自动续局|无法读取|保存失败/}).waitFor()};
const reload=async p=>{await p.reload({waitUntil:'networkidle'});await p.waitForFunction(()=>!!window.render_game_to_text);await p.getByTestId('save-notice').filter({hasText:/自动续局|无法读取|保存失败/}).waitFor()};
async function capture(p,name){const file=path.join(output,name+'.png');const dom=await p.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,canvasCount:document.querySelectorAll('canvas').length,notice:document.querySelector('[data-testid="save-notice"]').textContent}));assert.ok(dom.scrollWidth<=dom.width+1);captures.push({name,file,dom,pixels:inspectPng(await p.screenshot({path:file,fullPage:true,animations:'disabled'})),state:await state(p)})}
(async()=>{
 assert.equal((await fetch(url,{signal:AbortSignal.timeout(60000)})).status,200);
 const {loadTypescriptModule}=await import('./tests/helpers/load-typescript-module.mjs');
 const {getCluster}=await loadTypescriptModule('src/components/brickExcavation/engine.ts');
 const browser=await chromium.launch({channel:'chrome',headless:!process.env.HEADED,args:['--mute-audio','--disable-speech-api']});
 async function context(options={}){const ctx=await browser.newContext({viewport:{width:1440,height:960},reducedMotion:'reduce',...options});await ctx.addInitScript(()=>{if(window.speechSynthesis) window.speechSynthesis.speak=()=>{}});await ctx.route('**/api/record',r=>r.fulfill({json:{success:true}}));await ctx.route(/https:\/\/(pagead2\.googlesyndication\.com|hm\.baidu\.com)\//,r=>r.fulfill({body:''}));ctx.on('page',p=>{p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text())})});return ctx}
 let passed=false;
 try{
 const ctx=await context(),p=await ctx.newPage();await open(p);
 const initial=game(await state(p));
 await p.locator('button[data-index]:enabled').first().click();const first=game(await state(p));
 await p.locator('[data-shuffle]').click();const shuffled=game(await state(p));
 await p.getByTestId('preview-mode').click();await reload(p);
 assert.deepEqual(game(await state(p)),shuffled);assert.equal((await state(p)).previewFirst,true);
 await capture(p,'01-resumed-shuffle');
 await p.getByRole('button',{name:'撤销',exact:true}).click();assert.deepEqual(game(await state(p)),first);await reload(p);assert.deepEqual(game(await state(p)),first);
 await p.getByRole('button',{name:'撤销',exact:true}).click();assert.deepEqual(game(await state(p)),initial);await reload(p);assert.equal(await p.getByRole('button',{name:'撤销',exact:true}).isDisabled(),true);
 checks.push('strike and shuffle survive refresh; undo persists through repeated refresh; preview preference retained');
 // Use real DOM keyboard activation and public board colors for a complete legal campaign.
 await p.getByTestId('preview-mode').click();
 for(let i=0;i<60;i++){const s=await state(p);if(s.status!=='playing')break;const groups=s.board.map((_,j)=>getCluster(s.board,j,s.cols));const largest=groups.reduce((a,b)=>a.length>=b.length?a:b,[]);if(largest.length<2)await p.locator('[data-shuffle]').click();else{await p.locator(`button[data-index="${largest[0]}"]`).focus();await p.keyboard.press(i%2?'Enter':'Space')};if(i%4===1){const before=game(await state(p));await reload(p);assert.deepEqual(game(await state(p)),before)}}
 const won=game(await state(p));assert.equal(won.status,'won');await reload(p);assert.deepEqual(game(await state(p)),won);await capture(p,'02-resumed-victory');await p.getByRole('button',{name:'撤销',exact:true}).click();assert.equal((await state(p)).status,'playing');await reload(p);assert.equal((await state(p)).status,'playing');
 await p.getByRole('button',{name:/^新地图/}).click();assert.equal((await state(p)).seed,1);await reload(p);assert.equal((await state(p)).seed,1);assert.equal((await state(p)).turns,0);await p.locator('button[data-index]:enabled').first().click();await p.getByRole('button',{name:'重开',exact:true}).click();await reload(p);assert.equal((await state(p)).seed,1);assert.equal((await state(p)).turns,0);checks.push('normal input victory with periodic refresh; completed game resumes and can undo; new map and restart saved');
 // Deny session writes only, preserving pre-existing saved progress.
 await p.evaluate(key=>{const set=Storage.prototype.setItem;window.allowSave=false;Storage.prototype.setItem=function(k,v){if(k===key&&!window.allowSave)throw new DOMException('full','QuotaExceededError');return set.call(this,k,v)}},key);
 await p.locator('button[data-index]:enabled').first().click();const unsaved=game(await state(p));assert.match(await p.getByTestId('save-notice').innerText(),/保存失败/);assert.equal(JSON.parse(await p.evaluate(k=>localStorage.getItem(k),key)).actions.length,0);await capture(p,'03-write-failure');await p.evaluate(()=>window.allowSave=true);await p.getByRole('button',{name:'重试保存',exact:true}).click();await reload(p);assert.deepEqual(game(await state(p)),unsaved);checks.push('write failure leaves live game and prior save intact; retry restores persistence');
 const badctx=await context({viewport:{width:320,height:740},hasTouch:true,isMobile:true});
 await badctx.addInitScript(({key})=>{if(location.pathname==='/game/brick-excavation'&&!sessionStorage.getItem('fixture')){localStorage.setItem(key,'{"broken":');sessionStorage.setItem('fixture','1')}},{key});
 const bad=await badctx.newPage();await open(bad);assert.match(await bad.getByTestId('save-notice').innerText(),/原存档已保留/);const candidate=await bad.locator('button[data-index]:enabled').first().getAttribute('data-index');await bad.locator(`button[data-index="${candidate}"]`).tap();await bad.getByTestId('confirm-strike').tap();assert.equal(await bad.evaluate(k=>localStorage.getItem(k),key),'{"broken":');
 const downloadPromise=bad.waitForEvent('download');await bad.getByRole('button',{name:'下载原存档',exact:true}).tap();const download=await downloadPromise;assert.equal(fs.readFileSync(await download.path(),'utf8'),'{"broken":');await capture(bad,'04-corrupt-save-320');const current=game(await state(bad));await bad.getByRole('button',{name:'保存本局并替换旧进度',exact:true}).tap();await reload(bad);assert.deepEqual(game(await state(bad)),current);assert.equal((await state(bad)).selected,null);await bad.getByRole('button',{name:'撤销',exact:true}).tap();assert.equal((await state(bad)).turns,0);await bad.setViewportSize({width:390,height:844});await bad.locator('button[data-index]:enabled').first().tap();await bad.getByTestId('confirm-strike').tap();const phone=game(await state(bad));await reload(bad);assert.deepEqual(game(await state(bad)),phone);await capture(bad,'05-touch-resume-390');checks.push('corrupt save retained during play; exact original download; explicit replacement; real touch resume and undo at 320/390px');
 const blockedctx=await context({viewport:{width:844,height:390}});await blockedctx.addInitScript(key=>{const get=Storage.prototype.getItem;Storage.prototype.getItem=function(k){if(k===key)throw new DOMException('blocked','SecurityError');return get.call(this,k)}},key);const blocked=await blockedctx.newPage();await open(blocked);assert.match(await blocked.getByTestId('save-notice').innerText(),/无法读取本机/);await blocked.locator('button[data-index]:enabled').first().click();assert.equal((await state(blocked)).turns,1);assert.equal(await blocked.evaluate(k=>Object.prototype.hasOwnProperty.call(localStorage,k),key),false);await capture(blocked,'06-read-blocked-landscape');checks.push('storage read denial keeps gameplay available and does not overwrite unseen save');
 assert.deepEqual(errors,[]);passed=true;
 }finally{fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({passed,checks,captures,errors},null,2));await browser.close()}
 console.log(JSON.stringify({passed,checks,screenshots:captures.length,errors},null,2));
})().catch(e=>{console.error(e);process.exitCode=1});
