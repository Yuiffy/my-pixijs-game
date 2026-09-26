const assert=require('node:assert/strict');
const read=page=>page.evaluate(()=>JSON.parse(window.render_game_to_text()));
const mini=s=>s.practice||s.daily.mini;
const active=s=>s.practice?!s.practice.won:['lock','cook'].includes(s.daily?.panel);
const advance=(page,ms)=>page.evaluate(ms=>window.advanceTime(ms),ms);
async function range(page,label,value){
  const control=page.getByLabel(label,{exact:true});
  await control.evaluate((el,value)=>{
    const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
    setter.call(el,String(value));el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));
  },value);
}
async function activity(page,touch=false,onFrame=async()=>{},realtime=false){
  const tick=ms=>realtime?page.waitForTimeout(ms):advance(page,ms);
  const click=async loc=>{await loc.scrollIntoViewIfNeeded();if(touch){await page.waitForTimeout(150);await loc.tap();}else await loc.click();};
  let initial=await read(page);
  if(!initial.practice&&initial.daily?.arrival==='intro')await click(page.getByRole('button',{name:'拿出钥匙，轻轻开锁',exact:true}));
  const {nextTurn}=await import('../tests/helpers/hush-minigame-pilot.mjs');
  let cdp,down=false;
  const surface=page.locator('[data-mini-surface]');
  const point=async(x,y,start=false)=>{
    const b=await surface.boundingBox(),p={x:b.x+x/100*b.width,y:b.y+y/100*b.height};
    if(touch){cdp ||=await page.context().newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:down?'touchMove':'touchStart',touchPoints:[p]});down=true;}
    else {await page.mouse.move(p.x,p.y);if(start&&!down){await page.mouse.down();down=true;}}
  };
  const up=async()=>{if(down){if(touch)await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});else await page.mouse.up();down=false;}};
  for(let n=0;n<800&&active(await read(page));n++){
    let m=mini(await read(page));await surface.scrollIntoViewIfNeeded();
    if(m.kind==='dial'){
      const pos=a=>[50+Math.sin(a*Math.PI/180)*14,47.5-Math.cos(a*Math.PI/180)*24.5];
      await point(...pos(m.angle),true);
      for(let j=0;j<80;j++){
        m=mini(await read(page));const diff=Math.abs(((m.angle-m.targets[m.score]+540)%360)-180);
        if(diff<=14&&m.travel>=10)break;
        await point(...pos(m.angle+m.direction*8));await tick(15);
      }
      await onFrame(page,m.kind);await up();
    }else if(m.kind==='pick'){
      await up();await point((m.targets[m.score]+90)/1.8,28);await up();
      await point(50,80,true);await tick(350);await onFrame(page,m.kind);await tick(350);await up();
    }else if(m.kind==='pins'){
      await point((210+m.score*140)/7,85,true);await point((210+m.score*140)/7,85-m.targets[m.score]*.375);await onFrame(page,m.kind);await up();
    }else if(m.kind==='eggs'){
      await point(50+Math.sin(m.clock*2)*28.8,50+Math.cos(m.clock*2)*28.8);await tick(80);await onFrame(page,m.kind);
    }else if(m.kind==='toss'){
      if(!m.flight&&m.faces[m.face]>=1&&m.cooldown===0){
        const turn=nextTurn(m);await up();
        if(!touch){const b=await surface.boundingBox();await page.mouse.move(b.x-3,b.y+b.height/2);}
        await point(50,turn===2?35:65);await page.waitForTimeout(25);
        await point(50+(Math.abs(turn)===1?turn*22:0),turn===2?57:43);
        await up();
      }
      m=mini(await read(page));if(m.flight)await point(m.x,65);
      await tick(80);await onFrame(page,m.kind);
    }
    await tick(30);
  }
  await up();if(cdp)await cdp.detach();
  const final=await read(page);
  if(final.practice)assert.equal(final.practice.won,true,JSON.stringify(final.practice));
  else {
    assert.equal(final.daily.panel,null,JSON.stringify(final.daily.mini));
    assert.ok(['unlocked','done'].includes(final.daily.arrival),JSON.stringify({arrival:final.daily.arrival,kind:final.daily.mini.kind}));
    if(final.daily.arrival==='unlocked'){
      await click(page.getByRole('button',{name:'扶住门把，轻轻开门',exact:true}));await tick(400);await onFrame(page,'arrival-open');
      await click(page.getByRole('button',{name:'悄悄走进家里',exact:true}));await tick(1500);
      await onFrame(page,'arrival-inside');await click(page.getByRole('button',{name:'轻轻关上大门',exact:true}));
      assert.equal((await read(page)).daily.arrival,'done');
    }
  }
}
module.exports={activity,range};
