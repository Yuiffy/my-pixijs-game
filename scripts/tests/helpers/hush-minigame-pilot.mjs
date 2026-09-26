import assert from 'node:assert/strict';

export function solveActivity(s, daily, advance) {
  for(let n=0;n<5000&&['lock','cook'].includes(s.daily?.panel);n++){
    const m=s.daily.mini;
    if(m.kind==='dial'){
      if(Math.abs(m.angle-m.targets[m.score])<5&&m.travel>=10)daily.activityInput(s,'press');
      else daily.activityInput(s,'turn',m.direction*5);
    }else if(m.kind==='pick'){
      daily.activityInput(s,'release');daily.activityInput(s,'set',m.targets[m.score]);daily.activityInput(s,'press');
      advance(s,.7);
    }else if(m.kind==='pins'){
      daily.activityInput(s,'set',m.targets[m.score]);daily.activityInput(s,'press');
    }else{
      if(m.kind==='toss'&&!m.flight)daily.activityInput(s,'toss',.6);
      if(m.flight)daily.activityInput(s,'pan',m.x);
    }
    advance(s,.025);
  }
  assert.equal(s.daily.panel,null,JSON.stringify(s.daily.mini));
}
