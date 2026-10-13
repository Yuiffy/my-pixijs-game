const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const qa=require('./verify-hush-3d.cjs');
const audioQa=require('./verify-hush-audio.cjs');
const base=process.env.HUSH_BASE_URL||'http://127.0.0.1:4090';
const out=process.env.HUSH_QA_DIR||'tmp/hush-audio-spatial';
const errors=[],checks=[];

// Render the real decoded vocal with the live panner/listener parameters.
// A fixed source removes differing syllable loudness from stereo/distance comparisons.
async function measure(page,distanceScale=1) {
  return page.evaluate(async distanceScale=>{
    const q=window.__audioQA,c=q.contexts[0],p=q.panners[0],l=c.listener;
    const spatial=JSON.parse(window.render_game_to_text()).audioSpatial;
    const position=[p.positionX.value,p.positionY.value,p.positionZ.value];
    const listener=[l.positionX.value,l.positionY.value,l.positionZ.value];
    const forward=[l.forwardX.value,l.forwardY.value,l.forwardZ.value];
    const up=[l.upX.value,l.upY.value,l.upZ.value];
    const bytes=await (await fetch('/games/hush-live/audio-v2/voice/talk-0.mp3')).arrayBuffer();
    const buffer=await c.decodeAudioData(bytes);
    const offline=new OfflineAudioContext(2,48000,48000);
    const source=offline.createBufferSource();source.buffer=buffer;
    const node=offline.createPanner();node.panningModel=p.panningModel;node.distanceModel=p.distanceModel;
    node.refDistance=p.refDistance;node.rolloffFactor=p.rolloffFactor;node.maxDistance=p.maxDistance;
    node.setPosition(...position);
    offline.listener.setPosition(...listener.map((v,i)=>position[i]+(v-position[i])*distanceScale));
    offline.listener.setOrientation(...forward,...up);
    source.connect(node);node.connect(offline.destination);source.start(0,1);
    const rendered=await offline.startRendering();
    const rms=Array.from({length:2},(_,i)=>Math.sqrt(rendered.getChannelData(i).reduce((sum,x)=>sum+x*x,0)/rendered.length));
    const left=rendered.getChannelData(0),right=rendered.getChannelData(1);
    let earDelay=0,best=-Infinity;
    for(let lag=-40;lag<=40;lag++){
      let cross=0,a=0,b=0;
      for(let i=80;i<12000;i++){cross+=left[i]*right[i+lag];a+=left[i]*left[i];b+=right[i+lag]*right[i+lag];}
      const correlation=cross/Math.sqrt(a*b);
      if(correlation>best){best=correlation;earDelay=lag;}
    }
    return {position,listener,forward,up,spatial,rms,earDelay,model:node.panningModel};
  },distanceScale);
}

async function main(){
  fs.mkdirSync(out,{recursive:true});assert.equal((await fetch(base+'/game/hush-live')).status,200);
  const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--disable-speech-api']});
  try{
    const page=await browser.newPage({viewport:{width:1280,height:850}});
    page.on('pageerror',e=>errors.push(e.message));
    await audioQa.instrument(page,'host');await audioQa.ready(page);
    await audioQa.pump(page,120);
    const first=await measure(page);assert.equal(first.model,'HRTF');
    first.position.forEach((v,i)=>assert.ok(Math.abs(v-first.spatial.emitter[i])<.02));
    first.listener.forEach((v,i)=>assert.ok(Math.abs(v-first.spatial.listener[i])<.02));
    // Ordinary arrow-key turning, without taking the user's mouse pointer.
    const s=await qa.state(page),[x,,z]=first.position,[ex,,ez]=first.listener;
    const bearing=Math.atan2(-(x-ex),-(z-ez));
    let turn=(bearing+Math.PI/2-s.camera.yaw)%(2*Math.PI);
    if(turn<0)turn+=2*Math.PI;
    await page.keyboard.down('ArrowLeft');await qa.advance(page,turn/1.7*1000);await page.keyboard.up('ArrowLeft');await audioQa.pump(page,120);
    const sideA=await measure(page);
    await page.keyboard.down('ArrowLeft');await qa.advance(page,Math.PI/1.7*1000);await page.keyboard.up('ArrowLeft');await audioQa.pump(page,120);
    const sideB=await measure(page);
    const ratioA=sideA.rms[0]/sideA.rms[1],ratioB=sideB.rms[0]/sideB.rms[1];
    assert.ok(sideA.earDelay*sideB.earDelay<0&&Math.abs(sideA.earDelay)>3&&Math.abs(sideB.earDelay)>3,'Turning reverses binaural arrival time, including soft low-frequency blips');
    const far=await measure(page,3);
    assert.ok(Math.hypot(...far.rms)<Math.hypot(...sideB.rms)*.75,'Actual decoded voice attenuates with distance');
    checks.push({sourceAtMouth:true,listenerAtCamera:true,turnReversesStereo:{ratioA,ratioB,earDelayA:sideA.earDelay,earDelayB:sideB.earDelay},distance:{near:sideB.rms,far:far.rms}});
    const setMix=async(voice,music)=>{
      await page.getByRole('button',{name:'音量',exact:true}).click();
      await page.getByRole('slider',{name:'人声音量'}).fill(String(voice));
      await page.getByRole('slider',{name:'音乐音量'}).fill(String(music));
      await page.getByRole('button',{name:'收起',exact:true}).click();
      await page.getByRole('button',{name:'继续今晚 →'}).click();
      const current=await qa.state(page);
      await qa.advance(page,(12.6-current.elapsed%22+22)%22*1000);
      await audioQa.pump(page,650);
      const state=await qa.state(page);
      assert.equal(state.audio.mode,'sing');
      const buses=await page.evaluate(()=>window.__audioQA.gains.slice(0,4).map(x=>x.gain.value));
      assert.ok(Math.abs(buses[1]-voice/100)<.005,JSON.stringify(buses));
      assert.ok(Math.abs(buses[2]-music/100*.5)<.01,JSON.stringify(buses));
      return {mix:state.audioMix,buses,voice:state.audio.voice,music:state.audio.music};
    };
    checks.push({vocalOnly:await setMix(85,0),instrumentalOnly:await setMix(0,32)});
    await qa.follow(page);
    const near=await qa.state(page);await qa.advance(page,(12.6-near.elapsed%22+22)%22*1000);await audioQa.pump(page,350);
    await qa.capture(page,'spatial-singing');
    assert.deepEqual(errors,[]);fs.writeFileSync(out+'/report.json',JSON.stringify({checks,errors,images:qa.images},null,2));console.log(JSON.stringify({checks,errors}));
  }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
