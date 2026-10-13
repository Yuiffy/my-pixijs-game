import {loadTypescriptModule} from './tests/helpers/load-typescript-module.mjs';
import {fitnessDecision,fitnessUpgrade} from './tests/helpers/fitness-pilot.mjs';
import fs from 'node:fs';
const engine=await loadTypescriptModule('src/components/suiFitness/engine.ts');
const rows=[];
for(const talent of ['strength','swimmer','rhythm']) for(const delay of [1,6,12]) for(let seed=31;seed<=50;seed++) {
 const s=engine.createFitness(seed,talent), memo={}; engine.startFitness(s);let input={x:0,y:0};
 for(let frame=0;frame<20000;frame++) {
  if(s.phase==='upgrade'){engine.chooseUpgrade(s,fitnessUpgrade(s));continue}
  if(s.phase!=='playing')break;
  if(frame%delay===0) input=fitnessDecision(s,memo);
  engine.stepFitness(s,1/60,input);
 }
 rows.push({talent,delay,seed,phase:s.phase,seconds:s.elapsed,weight:s.weight,muscle:s.muscle,level:s.level,circuits:s.circuits,defeats:s.defeats});
}
const groups=[];
for(const talent of ['strength','swimmer','rhythm']) for(const delay of [1,6,12]){
 const r=rows.filter(x=>x.talent===talent&&x.delay===delay);groups.push({talent,reactionMs:delay*1000/60,wins:r.filter(x=>x.phase==='won').length,runs:r.length,meanSeconds:r.reduce((a,x)=>a+x.seconds,0)/r.length,minMuscle:Math.min(...r.map(x=>x.muscle)),maxWeight:Math.max(...r.map(x=>x.weight))});
}
fs.mkdirSync('tmp/fitness-refresh',{recursive:true});fs.writeFileSync('tmp/fitness-refresh/balance.json',JSON.stringify({groups,rows},null,2));console.log(JSON.stringify(groups,null,2));
