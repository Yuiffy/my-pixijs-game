import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTypescriptModule } from './helpers/load-typescript-module.mjs';

const E = await loadTypescriptModule('src/components/pingluCanal/construction.ts');
const funds = () => Array.from({ length: 3 }, () => ({ type: 'fund' }));
const normalize = game => ({
  companies: [...game.companies].sort((a,b)=>a.id-b.id),
  sites: Object.fromEntries(Object.entries(game.sites).map(([id,s])=>[id,{...s,inspectors:[...s.inspectors].sort()}])),
  phase: game.phase,
});
const complete = (g,id) => {g.sites[id].work=E.requiredWork(g,E.projectById(id));g.sites[id].contributions[0]=g.sites[id].work;};

test('one contiguous canal crosses the shared map; every remote worksite is immediately available',()=>{
  const g=E.createConstruction();
  const cells=E.MAIN_PROJECTS.flatMap(p=>p.cells);
  assert.equal(new Set(cells.map(c=>c.join(','))).size,cells.length);
  cells.slice(1).forEach((c,i)=>assert.equal(Math.abs(c[0]-cells[i][0])+Math.abs(c[1]-cells[i][1]),1));
  for(const p of E.MAIN_PROJECTS) assert.equal(E.quoteAction(g,g.companies[0],{type:'build',project:p.id}).error,null);
  assert.equal(E.quoteAction(g,g.companies[0],{type:'build',project:'H'}).work,1);
});

test('cut then haul is a legal three-step combination, with separate source inventory and no early grant spending',()=>{
 const g=E.createConstruction();const original=structuredClone(g);
 const actions=[{type:'build',project:'B'},{type:'haul',project:'E',source:'B'},{type:'fund'}];
 const r=E.previewPlan(g,g.companies[0],actions);
 assert.equal(r.error,null);assert.equal(r.company.soil.B,0);assert.equal(r.sites.E.work,2);assert.equal(r.company.hauled,2);
 assert.equal(r.company.cash,22);assert.deepEqual(g,original);assert.equal(g.sites.B.work,0);
});

test('soil cannot be borrowed from another company or consumed twice',()=>{
 const g=E.createConstruction();g.companies[1].soil.B=4;
 assert.match(E.quoteAction(g,g.companies[0],{type:'haul',project:'E',source:'B'}).error,/不足/);
 const r=E.previewPlan(g,g.companies[0],[{type:'build',project:'B'},{type:'haul',project:'E',source:'B'},{type:'haul',project:'wetland',source:'B'}]);
 assert.match(r.error,/不足/);
});

test('a jointly built site pays every contributor and produces identical results under seat permutations',()=>{
 const g=E.createConstruction(3,0);const plans={0:[{type:'build',project:'A'},...funds().slice(0,2)],1:[{type:'build',project:'A'},...funds().slice(0,2)],2:[{type:'build',project:'A'},...funds().slice(0,2)]};
 const a=E.resolvePlans(g,plans);const b=E.resolvePlans({...g,companies:[...g.companies].reverse()},plans);
 assert.deepEqual(normalize(a),normalize(b));assert.equal(a.sites.A.work,3);assert.equal(a.sites.A.accepted,false);
 assert.equal(a.companies[0].cash,a.companies[2].cash);assert.equal(a.companies[0].prestige,a.companies[1].prestige);
});

test('oversubscribed construction never cancels a later player or destroys their contribution',()=>{
 const g=E.createConstruction(2,0);const plans=Object.fromEntries(g.companies.map(c=>[c.id,[{type:'build',project:'A'},{type:'build',project:'A'},{type:'fund'}]]));
 const r=E.resolvePlans(g,plans);assert.deepEqual(r.sites.A.contributions,{0:2,1:2});assert.equal(r.sites.A.work,2);
 assert.deepEqual(r.reports[0].crowded,[{project:'A',offered:4,needed:2}]);assert.equal(r.companies[0].cash,r.companies[1].cash);
 assert.match(E.quoteAction(r,r.companies[0],{type:'build',project:'A'}).error,/已建成/);
});

test('wildlife, fishway and road bridge are real acceptance prerequisites',()=>{
 const g=E.createConstruction(1,0);
 for(const [main,needed] of [['B','wildlife'],['D','fishway'],['F','bridge']]){
  complete(g,main);assert.match(E.quoteAction(g,g.companies[0],{type:'inspect',project:main}).error,/先完成/);
  complete(g,needed);assert.equal(E.quoteAction(g,g.companies[0],{type:'inspect',project:main}).error,null);
 }
});

test('saving pools and survey equipment measurably reduce lock commissioning water',()=>{
 const g=E.createConstruction(1,0);complete(g,'D');complete(g,'fishway');
 assert.equal(E.quoteAction(g,g.companies[0],{type:'inspect',project:'D'}).water,-3);
 complete(g,'saving');assert.equal(E.quoteAction(g,g.companies[0],{type:'inspect',project:'D'}).water,-1);
 g.companies[0].equipment.push('surveyor');const q=E.quoteAction(g,g.companies[0],{type:'inspect',project:'D'});assert.equal(q.water,0);assert.equal(q.cost,0);
});

test('same-round shared inspection splits the award equally without draining another company water',()=>{
 const g=E.createConstruction(2,0);complete(g,'A');
 const plans={0:[{type:'inspect',project:'A'},...funds().slice(0,2)],1:[{type:'inspect',project:'A'},...funds().slice(0,2)]};
 const a=E.resolvePlans(g,plans);const b=E.resolvePlans({...g,companies:[...g.companies].reverse()},plans);
 assert.deepEqual(normalize(a),normalize(b));assert.equal(a.companies[0].prestige,2);assert.equal(a.companies[1].prestige,2);
 assert.equal(a.companies[0].water,2);assert.equal(a.companies[1].water,2);
});

test('work completion without inspection is not canal completion; final acceptance ends the game',()=>{
 const g=E.createConstruction(1,0);for(const p of E.PROJECTS)complete(g,p.id);
 assert.equal(E.allConnected(g),false);
 for(const p of E.MAIN_PROJECTS)g.sites[p.id].accepted=true;
 g.sites.H.accepted=false;
 const r=E.resolvePlans(g,{0:[{type:'inspect',project:'H'},...funds().slice(0,2)]});assert.equal(r.phase,'finished');assert.equal(E.allConnected(r),true);assert.match(E.quality(r),/^S/);
});

test('public region ties split control points, and an owned camp can change control',()=>{
 const g=E.createConstruction(2,0);g.sites.A.contributions={0:1,1:1};
 let r=E.regionStandings(g).find(r=>r.region==='upper');assert.deepEqual(r.leaders,[0,1]);assert.equal(r.points,4);
 g.companies[1].camps.upper=1;r=E.regionStandings(g).find(r=>r.region==='upper');assert.deepEqual(r.leaders,[1]);assert.equal(r.points,8);
});

test('sealed hotseat plans neither mutate the shared map nor reveal contents in the public summary',()=>{
 const g=E.createConstruction(2,0);const next=E.submitPlan(g,0,[{type:'build',project:'B'},...funds().slice(0,2)]);
 assert.equal(next.sites.B.work,0);assert.equal(E.activeCompany(next).id,1);
 const publicState=E.gameSummary(next);assert.equal(publicState.plans,undefined);assert.equal(publicState.companies[0].sealed,true);
 assert.equal(E.submitPlan(next,0,funds()),next);
});

test('AI never reads submitted private plans',()=>{
 const g=E.createConstruction(1,1);const ai=g.companies[1];const a=E.chooseAiPlan(g,ai);
 assert.deepEqual(a,E.chooseAiPlan({...g,plans:{0:[{type:'build',project:'B'},{type:'build',project:'B'},{type:'fund'}]}},ai));
});

test('equipment changes efficiency and previews stay reversible',()=>{
 const g=E.createConstruction();const snapshot=structuredClone(g);
 const r=E.previewPlan(g,g.companies[0],[{type:'equipment',equipment:'excavator'},{type:'build',project:'B'},{type:'haul',project:'E',source:'B'}]);
 assert.equal(r.error,null);assert.equal(r.sites.B.work,2);assert.equal(r.company.soil.B,2);assert.deepEqual(g,snapshot);
 const undone=E.previewPlan(g,g.companies[0],[]);assert.deepEqual(undone.company,g.companies[0]);
});

test('all supported player counts finish legal complete games; resources stay finite and nonnegative',()=>{
 for(const count of [1,2,3,4])for(const seed of [1,2,3]){
  let g=E.createConstruction(1,count-1,seed);let steps=0;
  while(g.phase!=='finished'){
   const plans=Object.fromEntries(g.companies.map(c=>[c.id,E.chooseAiPlan(g,c)]));
   for(const c of g.companies)assert.equal(E.previewPlan(g,c,plans[c.id]).error,null);
   const next=E.resolvePlans(g,plans);assert.notEqual(next,g);g=next;
   for(const c of g.companies){assert.ok(Number.isFinite(c.cash)&&c.cash>=0);assert.ok(c.water>=0&&c.water<=5);assert.ok(Object.values(c.soil).every(n=>n>=0));}
   if(g.phase==='review')g=E.nextRound(g);assert.ok(++steps<=10);
  }
  assert.equal(E.allConnected(g),true,`count ${count}, seed ${seed}`);
  if(count===1)assert.ok(E.scoreCompany(g,g.companies[0]).total>=E.SOLO_TARGET);
 }
});
