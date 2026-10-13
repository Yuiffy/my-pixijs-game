const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const qa = require('./verify-hush-3d.cjs');
const { state, advance, capture, images } = qa;
const base = process.env.HUSH_BASE_URL || 'http://127.0.0.1:4090';
const out = process.env.HUSH_QA_DIR || 'tmp/hush-audio-browser';
const checks = [], errors = [];

async function pump(page, ms) {
  await page.evaluate(ms => new Promise(resolve => {
    let last = performance.now(); const end = last + ms;
    const timer = setInterval(() => {
      const now = performance.now(); window.advanceTime(now-last);last=now;
      if(now>=end){clearInterval(timer);resolve();}
    },25);
  }), ms);
}

async function instrument(page, skin, level=0) {
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if(message.type()==='error') errors.push(message.text()); });
  await page.addInitScript(({skin,level}) => {
    localStorage.setItem('hush-live-v1', JSON.stringify({version:1,unlocked:level,skin,best:[0,0,0,0,0],stars:[0,0,0,0,0],endlessBest:0,player:'男友',partner:'她',cgs:['host-lamp','sui-repair','nana7mi-supper','shiori-home','mizuki-computer']}));
    if(window.speechSynthesis)window.speechSynthesis.speak=()=>{throw Error('Browser TTS must not replace character audio');};
    window.__audioQA={contexts:[],sources:[],samples:[],speaks:0,gains:[],panners:[]};
    const Original=window.AudioContext;
    window.AudioContext=class extends Original {
      constructor(...args) {
        super(...args); window.__audioQA.contexts.push(this);
        const gain=this.createGain.bind(this),panner=this.createPanner.bind(this);
        this.createGain=()=>{const node=gain();window.__audioQA.gains.push(node);return node;};
        this.createPanner=()=>{const node=panner();window.__audioQA.panners.push(node);return node;};
        const create=this.createBufferSource.bind(this);
        this.createBufferSource=()=>{
          const source=create();const record={started:false,stopped:false,ended:false,loop:false,duration:0,offset:0};
          window.__audioQA.sources.push(record);
          const start=source.start.bind(source),stop=source.stop.bind(source);
          source.start=(at=0,offset=0)=>{record.started=true;record.loop=source.loop;record.duration=source.buffer?.duration;record.offset=offset;return start(at,offset);};
          source.stop=(...args)=>{record.stopped=true;return stop(...args);};
          source.addEventListener('ended',()=>{record.ended=true;});return source;
        };
      }
    };
    setInterval(()=>{
      if(!window.render_game_to_text)return;
      const s=JSON.parse(window.render_game_to_text());const q=window.__audioQA;
      q.samples.push({time:s.elapsed,phase:s.phase,audio:s.audio,tracking:s.tracking.mouth,
        active:q.sources.filter(x=>x.started&&!x.stopped&&!x.ended&&!x.loop&&x.duration>=2).length});
    },80);
  },{skin,level});
}

async function ready(page, seed=2) {
  await page.goto(`${base}/game/hush-live?seed=${seed}`,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.render_game_to_text&&JSON.parse(window.render_game_to_text()).webglReady);
  assert.equal(await page.evaluate(()=>window.__audioQA.contexts.length),0,'Autoplay requires user gesture');
  await advance(page,0);await page.locator('#hush-start').click();
  await pump(page,650);
  await page.waitForFunction(()=>{window.advanceTime(0);return JSON.parse(window.render_game_to_text()).audio.loaded>=49;},{},{timeout:25000});
}

async function main() {
  fs.mkdirSync(out,{recursive:true});assert.equal((await fetch(base+'/game/hush-live')).status,200);
  const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--disable-speech-api']});
  try {
    for(const skin of ['host','sui','nana7mi','shiori','mizuki']) {
      const page=await browser.newPage({viewport:{width:1280,height:850}});
      await instrument(page,skin);await ready(page);
      const start=(await state(page)).elapsed;
      await pump(page,24000);
      const samples=await page.evaluate(()=>window.__audioQA.samples);
      fs.writeFileSync(out+`/${skin}-samples.json`,JSON.stringify({state:await state(page),samples},null,2));
      for(const mode of ['talk','sing','whisper']) {
        const selected=samples.filter(s=>s.audio.mode===mode && s.time>=start);
        assert.ok(selected.length>6,`${skin}/${mode} missing`);
        assert.ok(selected.some(s=>s.audio.rms>.0002),`${skin}/${mode} must contain actual decoded voice energy`);
        assert.ok(selected.some(s=>s.audio.mouth>.05&&s.tracking>.2),`${skin}/${mode} mouth must follow voice`);
        assert.ok(selected.every(s=>s.active<=2),'Voice must not stack outside short crossfades');
        assert.ok(selected.every(s=>s.audio.errors.length===0),JSON.stringify(selected));
        assert.ok(selected.every(s=>!s.audio.voice||s.audio.voice.startsWith('voice/')),'All actors use the shared cartoon voice bank');
        if(mode==='sing')assert.ok(selected.every(s=>s.audio.music==='music/'+s.audio.voice?.split('/')[1]),'Song accompaniment follows the vocal on its independent music bus');
      }
      assert.equal(await page.evaluate(()=>window.__audioQA.contexts.length),1);
      await page.keyboard.press('p');await advance(page,0);
      assert.equal((await state(page)).audio.mode,'silent');
      assert.ok(await page.evaluate(()=>window.__audioQA.sources.every(s=>!s.started||s.ended||s.stopped)));
      if(skin==='host') {
        await page.getByRole('button',{name:'音量',exact:true}).click();
        for(const [label,value] of [['人声音量','61'],['音乐音量','18'],['音效音量','43']]) await page.getByRole('slider',{name:label}).fill(value);
        assert.deepEqual((await state(page)).audioMix,{voice:.61,music:.18,effects:.43});
        await capture(page,'desktop-audio-settings');
        await page.getByRole('button',{name:'收起',exact:true}).click();
      }
      await page.getByRole('button',{name:'继续今晚 →'}).click();await pump(page,350);
      await page.getByRole('button',{name:'声音 开',exact:true}).click();await advance(page,0);
      assert.equal((await state(page)).audio.mode,'silent');
      await page.getByRole('button',{name:'声音 关',exact:true}).click();await pump(page,450);
      assert.notEqual((await state(page)).audio.mode,'silent');
      await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
      assert.equal((await state(page)).phase,'paused');assert.equal((await state(page)).audio.mode,'silent');
      await page.getByRole('button',{name:'继续今晚 →'}).click();await pump(page,350);
      const after=await state(page);assert.equal(after.audio.loaded,49);assert.equal(after.audio.errors.length,0);
      checks.push({skin,modes:['talk','sing','whisper'],singleContext:true,pauseMuteBlur:true,samples:samples.length});
      if(skin==='host') {
        await page.reload();await page.waitForFunction(()=>window.render_game_to_text&&JSON.parse(window.render_game_to_text()).webglReady);
        assert.deepEqual((await state(page)).audioMix,{voice:.61,music:.18,effects:.43});checks.push({settingsPersist:true});
        await page.setViewportSize({width:320,height:740});await page.getByRole('button',{name:'音量',exact:true}).click();await capture(page,'phone-audio-settings');
      }
      await page.close();
    }
    assert.deepEqual(errors,[]);
    fs.writeFileSync(out+'/report.json',JSON.stringify({checks,errors,images},null,2));
    console.log(JSON.stringify({checks,errors,images:images.map(i=>i.file)}));
  } finally {await browser.close();}
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={instrument,ready,pump};
