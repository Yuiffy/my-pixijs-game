const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const qa=require('./verify-hush-3d.cjs');
const audioQa=require('./verify-hush-audio.cjs');
const {state,advance,follow,hold,cover,capture,images}=qa;
const base=process.env.HUSH_BASE_URL||'http://127.0.0.1:4090';
const out=process.env.HUSH_QA_DIR||'tmp/hush-audio-story';
const checks=[],errors=[];

async function audible(page,suffix) {
  await audioQa.pump(page,250);
  const s=await state(page);
  assert.ok(s.audio.voice?.endsWith('/'+suffix),JSON.stringify(s.audio));
  assert.ok(await page.evaluate(clip=>window.__audioQA.samples.slice(-6).some(x=>x.audio.voice===clip&&x.audio.rms>1e-6),s.audio.voice),'Blips must produce real energy, with natural gaps between syllables');
  assert.equal(s.audio.errors.length,0);
  return s.audio;
}

async function story(page) {
  for(let n=0;n<65;n++) {
    const s=await state(page); if(s.daily.panel==='story')return;
    if(s.daily.stage==='sleep') {
      await audible(page,'off-air');
      // Complete the off-air line at its real pace instead of simulating past it.
      await audioQa.pump(page,5500);
      assert.ok((await state(page)).audio.voice?.includes('/after-'));
      continue;
    }
    if(await qa.activity(page))continue;
    if(s.daily.arrival!=='done'){await qa.timing(page);continue;}
    await follow(page);
    const next=await state(page);if(next.action.key!==next.objective.key)continue;
    if(['pickup-charger','food','hug','kiss'].includes(next.action.key))await cover(page);
    await hold(page);
  }
  throw Error('Unable to reach story choice');
}

async function main() {
  fs.mkdirSync(out,{recursive:true});assert.equal((await fetch(base+'/game/hush-live')).status,200);
  const {loadTypescriptModule}=await import('./tests/helpers/load-typescript-module.mjs');
  const e=await loadTypescriptModule('src/components/hushLive/engine.ts');
  const ending=await loadTypescriptModule('src/components/hushLive/endings.ts');
  const seeds=Array.from({length:3000},(_,i)=>i+1);
  const supper=seeds.find(seed=>{const d=e.createGame(5,seed,5).daily;return d.after==='supper'&&d.events.repair.stage==='none'&&!d.homemade&&!d.outing.trip&&!d.entryLock;});
  const cases=[
    {level:1,seed:2,skin:'sui',button:'拿两把勺子，一起吃',id:'rice-share',music:'lamplight'},
    {level:1,seed:2,skin:'mizuki',button:'接过锅铲：我来，你歇着',id:'kitchen-care',music:'lamplight'},
    {level:1,seed:1,skin:'nana7mi',button:'递杯温水，陪你坐一会儿',id:'warm-water',music:'bedside'},
    {level:1,seed:1,skin:'shiori',button:'拿干毛巾，帮你擦头发',id:'dry-hair',music:'bedside'},
    {level:5,seed:supper,skin:'host',button:'一起去吃烧鹅和热汤',id:'supper-table',music:'night-walk'},
    {level:5,seed:supper,skin:'sui',button:'披上外套，牵手出门',id:'night-walk',music:'night-walk'},
  ];
  const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--disable-speech-api']});
  try {
    for(const item of cases) {
      const page=await browser.newPage({viewport:{width:1280,height:850}});
      page.on('pageerror',error=>errors.push(error.message));
      await audioQa.instrument(page,item.skin,item.level);await audioQa.ready(page,item.seed);
      await story(page);
      await page.getByRole('button',{name:item.button,exact:true}).click();
      if(item.level===5)await advance(page,4200);else await advance(page,0);
      const audio=await audible(page,'ending-'+item.id);
      assert.equal(audio.music,'music/'+item.music);
      const current=await state(page),shot=ending.endingCamera(current,false);
      current.audioSpatial.listener.forEach((v,i)=>assert.ok(Math.abs(v-shot.position[i])<.02,'Ending listener follows actual camera'));
      assert.ok(Math.abs(current.audioSpatial.emitter[0]-current.endingScene.partner.x)<.5);
      assert.ok(Math.abs(current.audioSpatial.emitter[2]-current.endingScene.partner.z)<.5);
      await capture(page,'ending-audio-'+item.id);
      await audioQa.pump(page,5500);assert.equal((await state(page)).audio.voice,null);
      await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await advance(page,0);
      assert.equal((await state(page)).audio.mode,'silent','Result audio remains silent while focus is away');
      await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await advance(page,0);
      await page.getByRole('button',{name:/回忆相册/}).click();assert.equal((await state(page)).audio.mode,'silent');
      await page.getByRole('button',{name:'关闭相册',exact:true}).click();await advance(page,0);await audioQa.pump(page,400);
      assert.equal((await state(page)).audio.voice,null,'Completed ending must not repeat after gallery');
      const sources=await page.evaluate(()=>window.__audioQA.sources);
      assert.ok(sources.some(s=>s.started&&s.duration<1),'Foley must actually create decoded sources during chores');
      await page.getByRole('button',{name:item.level===5?'再开一个加班夜 →':'下一个夜晚 →',exact:true}).click();await audioQa.pump(page,400);
      const next=await state(page);assert.equal(next.phase,'playing');assert.equal(next.skin,item.skin);assert.equal(next.audio.errors.length,0);
      assert.equal(await page.evaluate(()=>window.__audioQA.contexts.length),1,'Next night must reuse its context');
      assert.ok(!next.audio.voice?.includes('ending-'));
      checks.push({id:item.id,skin:item.skin,audio,offAirFinishes:true,endingOneShot:true,gallerySilent:true,nextNight:true,foley:true});
      await page.close();
    }
    // Spatial audibility follows the same door state as the game, via real gameplay.
    const page=await browser.newPage();await audioQa.instrument(page,'host',2);await audioQa.ready(page);
    assert.equal((await state(page)).audio.wallHz,2000);
    await qa.reachAction(page,'door');await hold(page);await audioQa.pump(page,150);
    assert.equal((await state(page)).audio.wallHz,550);
    // Walk across the room through the door with ordinary controls.
    await page.keyboard.press('e');await advance(page,0);
    await page.keyboard.down('w');await advance(page,1400);await page.keyboard.up('w');await audioQa.pump(page,150);
    assert.equal((await state(page)).audio.wallHz,6500);
    checks.push({doorAndDistance:true});await page.close();
    assert.deepEqual(errors,[]);
    fs.writeFileSync(out+'/report.json',JSON.stringify({checks,errors,images},null,2));console.log(JSON.stringify({checks,errors,images:images.map(i=>i.file)}));
  } finally {await browser.close();}
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
