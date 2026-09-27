import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTypescriptModule} from './helpers/load-typescript-module.mjs';
const E=await loadTypescriptModule('src/components/resetRush/engine.ts');
const p=g=>g.players[0];
const job=g=>p(g).projects[0];
const studio=(g,patch)=>E.act(g,{type:'studio',...g.studio,...patch});
const setting=(g,id,development=null,collaboration=null)=>E.act(g,{type:'project-settings',project:id,settings:{development,collaboration}});
const custom={model:'astra',effort:'ultra',turbo:true};
function fresh(){
 const g=E.createGame(433,21);job(g).need=1000;job(g).understood=true;
 p(g).accounts[0].tier=200;p(g).accounts[0].quota=480;
 for(const m of Object.keys(E.MODELS))p(g).experience[m]={edition:E.modelEdition(g,m).name,work:60};
 return g;
}
const add=g=>{const j={...job(g),id:++g.serial,name:`项目 ${g.serial}`,settings:null};p(g).projects.push(j);return j.id;};

test('local model, effort and Turbo override all global strategies without changing other projects',()=>{
 let g=fresh();const first=job(g).id;const second=add(g);
 g=studio(g,{threads:2,configuration:'adaptive'});const global=structuredClone(g.development);
 g=setting(g,first,custom);assert.deepEqual(g.development,global);assert.equal(g.studio.configuration,'adaptive');
 assert.deepEqual(p(g).lanes.find(l=>l.projects[0]===first).development,custom);
 assert.equal(p(g).lanes.find(l=>l.projects[0]===second).development.model,'luna');
 g=studio(g,{configuration:'premium'});g=E.act(g,{type:'configure',development:{model:'luna',effort:'low',turbo:false}});
 assert.deepEqual(E.projectDevelopment(g,p(g),job(g)),custom);
 assert.deepEqual(p(g).lanes.find(l=>l.projects[0]===second).development,g.development);
 assert.equal(g.minute,0);assert.equal(p(g).accounts[0].quota,480);
 g=E.advanceMinutes(g,10);assert.ok(job(g).work>p(g).projects[1].work);
 assert.deepEqual(E.restoreGame(JSON.stringify(g)),g);
});

test('per-project collaboration caps share the global pool, spread projects first, and survive reload',()=>{
 let g=fresh();const first=job(g).id;const second=add(g);
 g=setting(g,first,null,1);g=setting(g,second,custom,3);g=studio(g,{threads:5,collaboration:1});
 const count=id=>p(g).lanes.filter(l=>l.projects[0]===id).length;
 assert.equal(count(first),1);assert.equal(count(second),3);assert.equal(p(g).lanes.filter(l=>l.enabled).length,4);
 assert.deepEqual(E.restoreGame(JSON.stringify(g)),g);
 g=studio(g,{threads:2});assert.equal(count(first),1);assert.equal(count(second),1);
 g=studio(g,{threads:0});assert.equal(p(g).lanes.filter(l=>l.enabled).length,0);
 g=studio(g,{threads:3});assert.equal(count(first),1);assert.equal(count(second),2);
 g=setting(g,second,custom,1);assert.equal(count(second),1);
});

test('resetting local settings immediately restores global model and collaboration defaults',()=>{
 let g=fresh();g=studio(g,{threads:3,collaboration:1,configuration:'adaptive'});g=setting(g,job(g).id,custom,3);
 assert.equal(p(g).lanes.filter(l=>l.projects.length).length,3);
 g=E.act(g,{type:'project-settings',project:job(g).id,settings:null});
 assert.equal(E.projectCollaboration(g,job(g)),1);assert.equal(E.projectDevelopment(g,p(g),job(g)).model,'luna');
 assert.equal(p(g).lanes.filter(l=>l.projects.length).length,1);assert.equal(p(g).energy,10);
});

test('backlogged projects retain settings and apply them on becoming the queue head',()=>{
 let g=fresh();job(g).need=0.01;const second=add(g);p(g).projects[1].need=100;
 g=studio(g,{threads:1,configuration:'adaptive'});g=setting(g,second,custom,3);
 assert.equal(p(g).lanes[0].development.model,'luna');g=E.advanceMinutes(g,1);
 assert.equal(p(g).shipped.length,1);assert.equal(job(g).id,second);assert.deepEqual(p(g).lanes[0].development,custom);
 assert.ok(job(g).work>0);assert.equal(p(g).lanes.filter(l=>l.enabled).length,1);
});

test('local settings cannot bypass attention top-ups or retroactively change quality',()=>{
 let g=fresh();g.development=custom;g=studio(g,{threads:1});g=E.advanceMinutes(g,10);
 const before={work:job(g).work,quality:job(g).qualityWork,quota:p(g).accounts[0].quota};p(g).energy=0;
 g=setting(g,job(g).id,{model:'luna',effort:'medium',turbo:false});g=E.advanceMinutes(g,10);
 assert.equal(E.laneStatus(g,p(g),p(g).lanes[0]),'等待精力');
 assert.equal(job(g).work,before.work);assert.equal(job(g).qualityWork,before.quality);assert.equal(p(g).accounts[0].quota,before.quota);
 g=setting(g,job(g).id,custom);g=E.advanceMinutes(g,10);assert.ok(job(g).work>before.work);assert.equal(p(g).energy,0);
});

test('old saves inherit defaults; malformed project settings and invalid targets are rejected',()=>{
 const g=fresh();assert.equal(job(g).settings,undefined);assert.deepEqual(E.restoreGame(JSON.stringify(g)),g);
 for(const settings of [{development:custom,collaboration:4},{development:{...custom,model:'fake'},collaboration:1},{development:null},{development:null,collaboration:0},'invalid']) {
  const bad=structuredClone(g);job(bad).settings=settings;assert.equal(E.restoreGame(JSON.stringify(bad)),null);
  const action={type:'project-settings',project:job(g).id,settings};assert.ok(E.actionError(g,0,action));
  assert.deepEqual(p(E.act(g,action)),p(g));
 }
 assert.ok(E.actionError(g,0,{type:'project-settings',project:g.market[0].id,settings:null}));
 const valid=setting(g,job(g).id,custom,3);assert.ok(E.restoreGame(JSON.stringify(valid)));
});

test('energy breakdown explains three conversations plus new projects, rest and next-day reservations',()=>{
 let g=E.createGame(433);g.development={model:'luna',effort:'medium',turbo:false};g=studio(g,{threads:3,collaboration:1});
 for(let n=0;n<6;n++)g=E.act(g,{type:'claim',project:g.market[0].id});
 assert.equal(p(g).energy,0);assert.deepEqual(E.energyBreakdown(g,p(g)),{day:1,hosting:6,claims:6,other:0,restored:0,previous:0});
 assert.match(E.actionError(g,0,{type:'claim',project:g.market[0].id}),/需要 1 精力.*只剩 0.*休息/);
 const ledger=E.energyBreakdown(g,p(g));g=studio(g,{threads:1});assert.equal(p(g).energy,4);assert.equal(E.energyBreakdown(g,p(g)).hosting,2);g=studio(g,{threads:3});assert.equal(p(g).energy,0);assert.deepEqual(E.energyBreakdown(g,p(g)),ledger);
 g=E.act(g,{type:'rest'});assert.equal(p(g).energy,3);assert.equal(E.energyBreakdown(g,p(g)).restored,3);
 for(let n=0;n<3;n++)g=E.act(g,{type:'claim',project:g.market[0].id});assert.equal(p(g).energy,0);
 assert.match(E.actionError(g,0,{type:'claim',project:g.market[0].id}),/无法再休息/);
 g=studio(g,{threads:1});assert.equal(p(g).energy,0);g=E.nextDay(E.endDay(g));assert.equal(p(g).energy,10);assert.deepEqual(E.energyBreakdown(g,p(g)),{day:2,hosting:2,claims:0,other:0,restored:0,previous:0});
 assert.deepEqual(E.restoreGame(JSON.stringify(g)),g);
});

test('claim preview includes newly started AI attention and never mutates the live state or random sequence',()=>{
 const g=E.createGame(133);const before=JSON.stringify(g);const preview=E.claimEnergyPreview(g,g.market[0].id);
 assert.deepEqual(preview,{hosting:2,waiting:false});assert.equal(JSON.stringify(g),before);
 const after=E.act(g,{type:'claim',project:g.market[0].id});assert.equal(p(after).energy,9);assert.equal(E.energyBreakdown(after,p(after)).hosting,2);assert.equal(E.energyBreakdown(after,p(after)).claims,1);
 const low=E.createGame(134);p(low).energy=1;const waiting=E.claimEnergyPreview(low,low.market[0].id);assert.deepEqual(waiting,{hosting:0,waiting:true});
});

test('manual communication and old energy usage are distinguished from AI follow-up and new claims',()=>{
 let g=E.createGame(211);const action={type:'dispatch',lane:null,projects:[job(g).id],account:p(g).accounts[0].id,model:'luna',effort:'medium',turbo:false};
 g=E.act(g,action);g=E.act(g,{...action,lane:p(g).lanes[0].id});assert.equal(E.energyBreakdown(g,p(g)).hosting,2);assert.equal(E.energyBreakdown(g,p(g)).other,1);
 g=E.advanceMinutes(g,1);delete p(g).energyLedger;const restored=E.restoreGame(JSON.stringify(g));assert.ok(restored);assert.equal(E.energyBreakdown(restored,p(restored)).previous,3);
 g=E.act(restored,{type:'claim',project:g.market[0].id});assert.equal(E.energyBreakdown(g,p(g)).previous,3);assert.equal(E.energyBreakdown(g,p(g)).claims,1);
 const ledger=E.energyBreakdown(g,p(g));assert.equal(12+ledger.restored-ledger.hosting-ledger.claims-ledger.other-ledger.previous,p(g).energy);
});

test('catalogue contains 60 distinct projects, evenly split across four categories and varied difficulties',()=>{
 assert.equal(E.TEMPLATES.length,60);assert.equal(new Set(E.TEMPLATES.map(t=>t[0])).size,60);
 for(const category of Object.keys(E.CATEGORIES))assert.equal(E.TEMPLATES.filter(t=>t[1]===category).length,15);
 for(const name of ['暖心晚安回复 AI','同人自走棋','直播投票插件'])assert.ok(E.TEMPLATES.some(t=>t[0]===name));
 for(const t of E.TEMPLATES)assert.ok(t[2]>0&&t[3]>0&&t[4]>0&&[1,2,3,4].includes(t[5]));
});

test('market avoids all players ongoing work and prefers previously unbuilt ideas until the catalogue is exhausted',()=>{
 let g=E.createGame(388);g=studio(g,{threads:0});const first=new Set();
 for(let n=0;n<55;n++) {
  const picked=g.market[0];assert.ok(!first.has(picked.name),picked.name);first.add(picked.name);
  p(g).energy=12;g=E.act(g,{type:'claim',project:picked.id});
  const busy=new Set(g.players.flatMap(p=>p.projects.map(j=>j.name)));
  assert.ok(g.market.every(j=>!busy.has(j.name)));
  assert.equal(new Set(g.market.map(j=>j.name)).size,4);
 }
 assert.equal(first.size,55);
 // Even if all ideas are in progress, refills remain bounded and keep the market unique.
 for(let n=0;n<10;n++){p(g).energy=12;g=E.act(g,{type:'claim',project:g.market[0].id});assert.equal(new Set(g.market.map(j=>j.name)).size,4);}
 assert.ok(E.restoreGame(JSON.stringify(g)));
});

test('one account can consume several banked resets in a day after spending quota, without extra energy or shifting natural reset',()=>{
 let g=E.createGame(888);job(g).need=1000;p(g).accounts[0].banks=[31,32,33];g.development=custom;
 g=studio(g,{threads:1,collaboration:1});const energy=p(g).energy;const cash=p(g).cash;const resetDay=p(g).accounts[0].nextReset;
 for(let n=0;n<3;n++){
  g=E.advanceMinutes(g,10);const account=p(g).accounts[0];assert.equal(account.quota,0);
  assert.equal(E.actionError(g,0,{type:'bank',account:account.id}),null);
  g=E.act(g,{type:'bank',account:account.id});assert.equal(p(g).accounts[0].quota,24);assert.equal(p(g).accounts[0].banks.length,2-n);
  assert.equal(p(g).energy,energy);assert.equal(p(g).cash,cash);assert.equal(p(g).accounts[0].nextReset,resetDay);assert.equal(g.day,1);
 }
 assert.equal(p(g).banksUsed,3);assert.deepEqual(E.restoreGame(JSON.stringify(g)),g);
 g=E.advanceMinutes(g,10);assert.match(E.actionError(g,0,{type:'bank',account:p(g).accounts[0].id}),/没有有效/);
 const bot=g.players[1];bot.cash=0;bot.accounts[0].quota=0;bot.accounts[0].banks=[31,32];bot.accounts[0].nextReset=10;bot.accounts[0].lastBankDay=g.day;
 assert.equal(E.chooseAction(g,1).type,'bank');
});

test('a zero-energy morning remains editable: fewer conversations or a stronger model release unused reservations',()=>{
 let g=E.createGame(223);job(g).need=1000;
 for(let n=0;n<5;n++)add(g);
 g.development={model:'luna',effort:'medium',turbo:false};g=studio(g,{threads:6,collaboration:1});
 g=E.nextDay(E.endDay(g));assert.equal(g.minute,0);assert.equal(p(g).energy,0);assert.equal(E.energyBreakdown(g,p(g)).hosting,12);
 const before=structuredClone(g);g=studio(g,{threads:3});assert.equal(p(g).energy,6);assert.equal(g.minute,0);
 assert.equal(E.energyBreakdown(g,p(g)).hosting,6);assert.deepEqual(p(g).projects,p(before).projects);assert.deepEqual(p(g).accounts,p(before).accounts);
 g=E.act(g,{type:'claim',project:g.market[0].id});assert.equal(p(g).energy,5);
 for(let n=0;n<4;n++){g=studio(g,{threads:0});assert.equal(p(g).energy,11);g=studio(g,{threads:3});assert.equal(p(g).energy,5);}
 let strong=E.act(before,{type:'configure',development:custom});assert.equal(p(strong).energy,6);assert.equal(strong.minute,0);
 strong=E.advanceMinutes(strong,1);const spent=p(strong).energy;strong=studio(strong,{threads:0});assert.equal(p(strong).energy,spent);
 // Existing v0.7 saves have no ledger: paidDay/attentionPaid are enough to release morning reservations.
 const legacy=structuredClone(before);for(const pl of legacy.players)delete pl.energyLedger;
 const restored=E.restoreGame(JSON.stringify(legacy));assert.ok(restored);assert.equal(E.energyBreakdown(restored,p(restored)).hosting,12);
 const recovered=studio(restored,{threads:3});assert.equal(p(recovered).energy,6);assert.deepEqual(E.restoreGame(JSON.stringify(recovered)),recovered);
});


test('advance development stops at exhaustion, repeated clicks preserve the day, and coupons resume work',()=>{
 let g=E.createGame(883,21);job(g).need=1000;g.development=custom;g=studio(g,{threads:1,collaboration:1});
 p(g).accounts[0].banks=[31,32];
 for(let n=0;n<2;n++){
  g=E.act(g,{type:'next'});assert.equal(p(g).accounts[0].quota,0);assert.equal(g.phase,'plan');assert.equal(g.day,1);assert.ok(g.minute<60);
  const before=structuredClone(g);for(let i=0;i<3;i++)g=E.act(g,{type:'next'});
  assert.equal(g.minute,before.minute);assert.equal(g.rng,before.rng);assert.deepEqual(g.players,before.players);assert.match(g.message,/免费 Luna/);
  g=E.act(g,{type:'bank',account:p(g).accounts[0].id});assert.equal(p(g).accounts[0].quota,24);assert.equal(g.minute,before.minute);
 }
 g=E.act(g,{type:'next'});const minute=g.minute;const cash=p(g).cash;const energy=p(g).energy;
 g=E.act(g,{type:'freelance'});assert.equal(g.minute,minute+60);assert.equal(p(g).cash,cash+25);assert.equal(p(g).energy,energy-1);assert.equal(g.phase,'plan');
 // Even with a paused subscription, free Luna needs no quota and can finish a simple project.
 p(g).accounts[0].paidUntil=0;job(g).need=job(g).work+5;job(g).difficulty=1;job(g).bugs=0;
 g=E.act(g,{type:'configure',development:{model:'luna',effort:'medium',turbo:false}});
 assert.equal(E.developmentBlocker(g),null);const shipped=p(g).shipped.length;g=E.act(g,{type:'next'});
 assert.equal(p(g).shipped.length,shipped+1);assert.equal(g.phase,'plan');assert.equal(g.day,1);assert.equal(p(g).accounts[0].quota,0);
 const finished=g.minute;g=E.act(g,{type:'next'});assert.equal(g.minute,finished);
 g=E.endDay(g);assert.equal(g.phase,'reveal');assert.equal(g.day,1);g=E.nextDay(g);assert.equal(g.day,2);
});

test('mixed free and paid conversations pause for quota decisions but free work can then continue',()=>{
 let g=E.createGame(884,21);job(g).need=1000;const first=job(g).id;const second=add(g);g.development=custom;
 g=setting(g,second,{model:'luna',effort:'medium',turbo:false});g=studio(g,{threads:2,collaboration:1});
 g=E.act(g,{type:'next'});assert.equal(g.phase,'plan');assert.ok(g.minute<60);assert.equal(p(g).accounts[0].quota,0);
 const statuses=p(g).lanes.map(l=>E.laneStatus(g,p(g),l));assert.ok(statuses.includes('等待额度'));assert.ok(statuses.includes('开发中'));
 const paidWork=p(g).projects.find(j=>j.id===first).work;p(g).projects.find(j=>j.id===second).need=p(g).projects.find(j=>j.id===second).work+5;
 const before=g.minute;g=E.act(g,{type:'next'});assert.ok(g.minute>before);assert.equal(g.phase,'plan');
 assert.equal(p(g).projects.find(j=>j.id===first).work,paidWork);assert.equal(p(g).shipped.length,1);
});

test('idle, paused or energy-starved work never consumes remaining time on advance development',()=>{
 let g=fresh();g=studio(g,{threads:0});let before=g.minute;g=E.act(g,{type:'next'});assert.equal(g.minute,before);
 g=studio(g,{threads:1});g=E.advanceMinutes(g,1);p(g).energy=0;p(g).lanes[0].attentionPaid=0;
 assert.match(E.developmentBlocker(g),/等待精力/);before=g.minute;g=E.act(g,{type:'next'});assert.equal(g.minute,before);
});


test('rest wakes conversations waiting for attention so advance development can resume immediately',()=>{
 let g=fresh();p(g).energy=0;g=studio(g,{threads:1});assert.match(E.developmentBlocker(g),/等待精力/);
 g=E.act(g,{type:'rest'});assert.equal(g.minute,60);assert.equal(g.phase,'plan');assert.equal(E.developmentBlocker(g),null);
 assert.equal(p(g).energy,3-E.attentionCost(g,p(g),g.development,job(g)));assert.equal(E.energyBreakdown(g,p(g)).restored,3);
 const work=job(g).work;g=E.act(g,{type:'next'});assert.ok(job(g).work>work);
});


test('the first advance starts the default workspace without requiring a settings change',()=>{
 const initial=E.createGame(883,21);const before=JSON.stringify(initial);assert.equal(E.developmentBlocker(initial),null);assert.equal(JSON.stringify(initial),before);
 const g=E.act(initial,{type:'next'});assert.ok(g.minute>0);assert.ok(p(g).shipped.length||job(g).work>0);assert.equal(g.day,1);
});
