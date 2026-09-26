const assert=require('node:assert/strict');
const read=page=>page.evaluate(()=>JSON.parse(window.render_game_to_text()));
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
  const surface=page.locator('[data-mini-surface]');
  const click=async locator=>{if(touch)await locator.tap();else await locator.click();};
  let pointer=false,cdp;
  for(let n=0;n<600&&['lock','cook'].includes((await read(page)).daily?.panel);n++){
    let m=(await read(page)).daily.mini;
    if(m.kind==='dial'){
      if(Math.abs(m.angle-m.targets[m.score])<5&&m.travel>=10)await click(page.getByRole('button',{name:/记住这一格/}));
      else await click(page.getByRole('button',{name:m.direction===1?'顺时针转动':'逆时针转动',exact:true}));
    }else if(m.kind==='pick'){
      await range(page,'铁丝角度',m.targets[m.score]);
      const b=await page.getByRole('button',{name:/按住扳手轻转/}).boundingBox();
      if(touch){cdp ||= await page.context().newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:b.x+b.width/2,y:b.y+b.height/2}]});}
      else{await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();}
      await tick(350);await onFrame(page,m.kind);await tick(350);
      if(touch)await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});else await page.mouse.up();
    }else if(m.kind==='pins'){
      await range(page,'弹子高度',m.targets[m.score]);await onFrame(page,m.kind);await click(page.getByRole('button',{name:/锁住这枚弹子/}));
    }else{
      if(m.kind==='toss'&&!m.flight)await click(page.getByRole('button',{name:'颠锅 ↑',exact:true}));
      m=(await read(page)).daily.mini;
      if(m.flight){
        const b=await surface.boundingBox(),x=b.x+Math.max(8,Math.min(92,m.x))/100*b.width,y=b.y+b.height*.7;
        if(touch){cdp ||=await page.context().newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:pointer?'touchMove':'touchStart',touchPoints:[{x,y}]});}
        else{await page.mouse.move(x,y);if(!pointer)await page.mouse.down();}
        pointer=true;
      }
      await tick(80);await onFrame(page,m.kind);
      if(m.kind==='toss'&&!(await read(page)).daily.mini.flight&&pointer){
        if(touch)await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});else await page.mouse.up();pointer=false;
      }
    }
    await tick(30);
  }
  if(pointer){if(touch)await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});else await page.mouse.up();}
  if(cdp)await cdp.detach();
  assert.equal((await read(page)).daily.panel,null,JSON.stringify((await read(page)).daily.mini));
}
module.exports={activity,range};
