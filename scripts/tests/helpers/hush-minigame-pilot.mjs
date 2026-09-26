import assert from 'node:assert/strict';
import { loadTypescriptModule } from './load-typescript-module.mjs';
const { bottomFace, turnedRotation } = await loadTypescriptModule('src/components/hushLive/minigames.ts');

export function nextTurn(m) {
  const queue = [{ rotation: m.rotation, turns: [] }], seen = new Set();
  while (queue.length) {
    const item = queue.shift(), key = item.rotation.map(x => Math.round(x * 1000)).join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    if (item.turns.length && m.faces[bottomFace(item.rotation)] < 1) return item.turns[0];
    for (const turn of [0, 2, -1, 1]) queue.push({ rotation: turnedRotation(item.rotation, turn), turns: [...item.turns, turn] });
  }
  return 0;
}

export function solveActivity(s, daily, advance) {
  if (s.daily?.arrival === 'intro') daily.arrivalAction(s);
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
      if(m.kind==='toss') {
        if(!m.flight && m.faces[m.face]>=1)daily.activityInput(s,'toss',.6,nextTurn(m));
        if(m.flight)daily.activityInput(s,'pan',m.x);
      } else daily.activityInput(s,'tilt',Math.sin(m.clock*2)*.8,Math.cos(m.clock*2)*.8);
    }
    advance(s,.025);
  }
  assert.equal(s.daily.panel,null,JSON.stringify(s.daily.mini));
  if (s.daily.arrival === 'unlocked') {
    daily.arrivalAction(s);daily.arrivalAction(s);advance(s,1.5);daily.arrivalAction(s);
    assert.equal(s.daily.arrival,'done');
  }
}
