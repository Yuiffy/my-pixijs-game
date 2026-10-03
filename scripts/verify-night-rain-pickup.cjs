// Capture warm pickup frames and shader compilation; fixtures use ordinary engine inputs.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/yuiffy/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright');
const { inspectPng } = require('./lib/autochess-screenshot.cjs');
const { installVirtualPointerLock } = require('./lib/night-rain-virtual-pointer.cjs');
const base = process.env.NIGHT_RAIN_BASE_URL || 'http://localhost:3926';
const out = process.env.NIGHT_RAIN_QA_DIR || 'tmp/night-rain-pickup-verify';
const evidence = [], cases = [], errors = [];
fs.mkdirSync(out, { recursive: true });
async function capture(page, name) {
  const text = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
  const layout = await page.evaluate(() => ({ canvas:[...document.querySelectorAll('canvas')].map(c=>({width:c.width,height:c.height})), dom:document.body.innerText, width:innerWidth, scroll:document.documentElement.scrollWidth }));
  assert.equal(layout.canvas.length,1); assert.ok(layout.canvas[0].width>0); assert.ok(layout.scroll<=layout.width);
  const file = path.join(out,name+'.png');
  const pixels = inspectPng(await page.screenshot({path:file,fullPage:true,animations:'disabled'}));
  fs.writeFileSync(path.join(out,name+'.json'),JSON.stringify({text,layout,pixels},null,2));
  evidence.push({file,pixels});
}
async function main() {
  assert.equal((await fetch(base+'/game/night-rain')).status,200);
  const { loadTypescriptModule:load } = await import('./tests/helpers/load-typescript-module.mjs');
  const { walkTo } = await import('./tests/helpers/night-rain-pilot.mjs');
  const engine = await load('src/components/nightRain/engine.ts');
  const world = await load('src/components/nightRain/world.ts');
  const guide = await load('src/components/nightRain/companion.ts');
  const game = engine.createGame(); engine.startGame(game);
  const browser = await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--disable-speech-api']});
  try {
    for (const id of ['alley-cache','roof-charm','temple-flask']) {
      const l = world.LANDMARKS.find(l=>l.id===id);
      const route = guide.findPath(game.player,world.interactionPoint(l),game); assert.ok(route.length);
      for (const p of route.slice(1)) walkTo(engine,game,p,90000);
      assert.equal(game.collected.includes(id),false);
      assert.ok(engine.loadGame(engine.saveGame(game)));
      const page = await browser.newPage({viewport:{width:1440,height:900}});
      await page.route('https://pagead2.googlesyndication.com/**',r=>r.fulfill({contentType:'application/javascript',body:''}));
      await page.route('https://hm.baidu.com/**',r=>r.fulfill({contentType:'application/javascript',body:''}));
      page.on('pageerror',e=>errors.push(e.message)); page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
      await page.addInitScript(installVirtualPointerLock);
      await page.addInitScript(save=>{
        if(!localStorage.getItem('night-rain-v1'))localStorage.setItem('night-rain-v1',save);localStorage.setItem('night-rain-v1-settings',JSON.stringify({enabled:true,voice:false}));
        if('speechSynthesis' in window)window.speechSynthesis.speak=()=>{};
        window.pickupMetrics={calls:[],sources:[],frames:[],longTasks:[],active:false};
        for(const Type of [window.WebGLRenderingContext,window.WebGL2RenderingContext].filter(Boolean)){
          for(const name of ['compileShader','linkProgram','getProgramParameter','getShaderParameter','shaderSource']){
            const original=Type.prototype[name];Type.prototype[name]=function(...args){const start=performance.now();const result=original.apply(this,args);const m=window.pickupMetrics;if(m.active){if(name==='shaderSource'){const match=args[1].match(/pointLights\[\s*(\d+)\s*\]/);if(match)m.sources.push(Number(match[1]));}m.calls.push({name,ms:performance.now()-start});}return result;};
          }
        }
        const set=Storage.prototype.setItem;Storage.prototype.setItem=function(...args){const t=performance.now();const r=set.apply(this,args);if(window.pickupMetrics.active)window.pickupMetrics.calls.push({name:'storage:'+args[0],ms:performance.now()-t});return r;};
        new PerformanceObserver(list=>{if(window.pickupMetrics.active)window.pickupMetrics.longTasks.push(...list.getEntries().map(e=>({start:e.startTime,ms:e.duration})));}).observe({entryTypes:['longtask']});
        let last=0;function frame(t){if(window.pickupMetrics.active&&last)window.pickupMetrics.frames.push(t-last);last=t;requestAnimationFrame(frame);}requestAnimationFrame(frame);
      },engine.saveGame(game));
      await page.goto(base+'/game/night-rain',{waitUntil:'networkidle'});
      await page.waitForFunction(()=>window.nightRain&&document.querySelector('canvas')?.width>0);
      await page.getByRole('button',{name:'继续雨夜旅程 →',exact:true}).click();
      await page.evaluate(()=>{window.advanceTime(0);window.pickupFreeze=setInterval(()=>window.advanceTime(0),100);});
      await page.waitForTimeout(2200);
      assert.equal((await page.evaluate(()=>window.nightRain.getState())).nearbyId,id);
      if(id==='alley-cache')await capture(page,'01-before-pickup');
      const result=await page.evaluate(async()=>{
        const m=window.pickupMetrics;m.active=true;
        const t=performance.now();window.nightRain.input({x:0,z:0,interact:true});window.advanceTime(40);const updateMs=performance.now()-t;
        const firstFrameMs=await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r(performance.now()-t))));
        await new Promise(r=>setTimeout(r,1000));m.active=false;
        return {...m,updateMs,firstFrameMs,state:window.nightRain.getState()};
      });
      assert.ok(result.state.collected.includes(id));
      const compiled=result.calls.filter(c=>c.name==='compileShader').length;
      const summary={id,updateMs:result.updateMs,firstFrameMs:result.firstFrameMs,compileShaders:compiled,pointLightVariants:[...new Set(result.sources)],maxFrameMs:Math.max(...result.frames),longTasks:result.longTasks,storage:result.calls.filter(c=>c.name.startsWith('storage:')),slowCalls:result.calls.filter(c=>c.ms>10)};
      cases.push(summary);console.log(JSON.stringify(summary));
      fs.writeFileSync(path.join(out,id+'-trace.json'),JSON.stringify(result,null,2));
      if(!process.env.NIGHT_RAIN_PICKUP_ALLOW_COMPILE)assert.equal(compiled,0,'Pickup must not compile new shaders');
      await capture(page,id+'-after-pickup');
      engine.interact(game);
      assert.deepEqual({rice:result.state.rice,charm:result.state.charm,flaskUpgrade:result.state.flaskUpgrade,flasks:result.state.player.flasks},{rice:game.rice,charm:game.charm,flaskUpgrade:game.flaskUpgrade,flasks:game.player.flasks});
      const moved = await page.evaluate(direction=>{window.nightRain.input({x:direction.x,z:direction.z,interact:true});window.advanceTime(160);return window.nightRain.getState();},[{x:1,z:0},{x:-1,z:0},{x:0,z:1},{x:0,z:-1}].find(d=>world.canOccupy(game.player.x+d.x*.6,game.player.z+d.z*.6,game.player.y,game)));
      assert.ok(Math.hypot(moved.player.x-result.state.player.x,moved.player.z-result.state.player.z)>.1,'Movement continues after pickup');
      assert.equal(moved.collected.filter(value=>value===id).length,1);
      assert.equal(moved.rice,result.state.rice);
      assert.equal(moved.player.flasks,result.state.player.flasks);
      const stored=await page.evaluate(()=>localStorage.getItem('night-rain-v1-slot-1'));assert.ok(engine.loadGame(stored).collected.includes(id));
      await page.reload({waitUntil:'networkidle'});await page.getByRole('button',{name:'继续雨夜旅程 →',exact:true}).click();
      assert.ok((await page.evaluate(()=>window.nightRain.getState())).collected.includes(id));
      await page.close();
    }
    assert.deepEqual(errors,[]);
  } finally {await browser.close();fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({base,cases,evidence,errors},null,2));}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
