const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require(require.resolve('playwright',{paths:[process.cwd(),'C:/Users/yuiffy/.codex/skills/develop-web-game']}));
const {inspectPng}=require('./lib/autochess-screenshot.cjs');
const base=process.env.RESET_BASE_URL||'http://127.0.0.1:3892';
const out=path.resolve('tmp/reset-rush-models-browser');
const report={checks:[],screenshots:[],errors:[]};
async function main(){
 assert.equal((await fetch(`${base}/game/reset-rush`)).status,200);fs.mkdirSync(out,{recursive:true});
 const E=await(await import('./tests/helpers/load-typescript-module.mjs')).loadTypescriptModule('src/components/resetRush/engine.ts');
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--disable-features=SpeechSynthesis']});
 try{
  for(const locale of ['zh-CN','en-US']){
   const ctx=await browser.newContext({locale,viewport:{width:1440,height:960},reducedMotion:'reduce'});
   await ctx.addInitScript(()=>{if(window.speechSynthesis)window.speechSynthesis.speak=()=>{};});
   const page=await ctx.newPage();page.on('pageerror',e=>report.errors.push(e.message));page.on('console',e=>{if(e.type()==='error')report.errors.push(e.text());});
   const load=()=>page.goto(`${base}/game/reset-rush`,{waitUntil:'networkidle'});
   const saved=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('reset-rush-v5')));
   const shot=async name=>{
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
    const file=path.join(out,name+'.png');const pixels=inspectPng(await page.screenshot({path:file,animations:'disabled'}));
    report.screenshots.push({file,pixels,state:JSON.parse(await page.evaluate(()=>window.render_game_to_text()))});
   };
   await load();await page.locator('#start-game').click();await page.getByRole('button',{name:locale==='zh-CN'?'关闭弹窗':'Close dialog',exact:true}).click();
   await page.locator('#reset-command').scrollIntoViewIfNeeded();await shot(`initial-${locale}`);
   for(let stage=2;stage<=5;stage++){
    let g=E.createGame(99,42);g.platform.stage=stage;g.players[0].projects[0].need=1000;
    if(stage>2)g.event={...E.EVENTS.find(e=>e.id===`tech-${stage}`)};
    g=E.act(g,{type:'studio',...g.studio,threads:1});
    await page.evaluate(g=>localStorage.setItem('reset-rush-v5',JSON.stringify(g)),g);await load();
    const body=await page.locator('main').innerText();assert.doesNotMatch(body,/5\.0|GPT-4o|GPT-5 mini/);
    const displayName=m=>E.modelEdition(g,m).name.replace('虚构推演',locale==='en-US'?'fictional':'虚构推演');
    for(const m of ['luna','sol','astra'])assert.ok(body.includes(displayName(m)), `${locale} stage ${stage} missing ${displayName(m)}: ${body}`);
    await page.locator('#reset-project-settings summary').click();await page.locator('#project-config-mode').selectOption('custom');
    assert.deepEqual(await page.locator('#project-model option').allTextContents(),['luna','sol','astra'].map(displayName));
    await page.locator('#project-model').selectOption('astra');await page.locator('#project-effort').selectOption('ultra');await page.locator('#project-turbo').check();
    assert.equal((await saved()).players[0].projects[0].settings.development.model,'astra');
    if(locale==='en-US'){
     const chinese=await page.locator('main').evaluate(root=>{const w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);const found=[];while(w.nextNode()){if(w.currentNode.parentElement.closest('[aria-label="Language"]'))continue;const t=w.currentNode.textContent;if(/[\u3400-\u9fff]/.test(t))found.push(t.trim());}return found;});assert.deepEqual(chinese,[]);
    }
    if(stage===5){
     await page.setViewportSize({width:320,height:844});await page.locator('#reset-project-settings').scrollIntoViewIfNeeded();await shot(`late-project-${locale}`);
     await page.setViewportSize({width:390,height:844});await page.getByTestId('model-roadmap').locator('summary').click();await page.getByTestId('model-roadmap').scrollIntoViewIfNeeded();await shot(`roadmap-${locale}`);
     await page.getByRole('button',{name:locale==='zh-CN'?'慢跑省额':'Steady saver',exact:true}).click();
     // Restore the local model override to let the free global preset take effect.
     await page.getByRole('button',{name:locale==='zh-CN'?'恢复全部跟随全局':'Reset to studio defaults',exact:true}).click();
     let before=await saved();before.players[0].accounts[0].quota=0;await page.evaluate(g=>localStorage.setItem('reset-rush-v5',JSON.stringify(g)),before);await load();
     await page.evaluate(()=>window.advanceTime(10*60000));await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).minute===10);
     const after=await saved();assert.ok(after.players[0].projects[0].work>0);assert.equal(after.players[0].accounts[0].quota,0);
    }
   }
   report.checks.push(`${locale}: all four stages show recent models and labeled fictional future in events, global controls and per-project choices; 320/390px layouts, roadmap, independent effort/Turbo and zero-quota Luna development work`);
   await ctx.close();
  }
  assert.deepEqual(report.errors,[]);
 }finally{await browser.close();}
}
main().then(()=>{fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({checks:report.checks,screenshots:report.screenshots.map(s=>s.file),errors:report.errors},null,2));}).catch(e=>{fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({error:e.stack,...report},null,2));console.error(e);process.exitCode=1;});
