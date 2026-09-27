import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTypescriptModule } from './helpers/load-typescript-module.mjs';
const { MultiplayerBridge } = await loadTypescriptModule('src/components/autoChessGame/multiplayer/MultiplayerBridge.ts');
const rooms = await loadTypescriptModule('src/components/autoChessGame/multiplayer/room.ts');
const rules = await loadTypescriptModule('src/components/autoChessGame/multiplayer/match.ts');
const setup = (mode='coop', modify=()=>{}) => {
 let room=rooms.createRoom('LOCAL','token-a','A',{mode,seats:2,aiCount:0,prepSeconds:90,isPublic:false});
 room=rooms.joinRoom(room,'token-b','B');room=rooms.applyCommand(room,0,{kind:'start'},1234);modify(room);
 const commands=[];
 const session=()=>({room:rooms.viewRoom(room,0),busy:false,connected:true,message:'',send:async command=>{commands.push(command);const next=rooms.applyCommand(room,0,command,4321);assert.ok(next,'valid authoritative command');room={...next,revision:room.revision+1};bridge.syncSession(session());},leave:()=>{}});
 const bridge=new MultiplayerBridge(session());
 return {bridge,commands,room:()=>room,session,setRoom:r=>{room=r;bridge.syncSession(session());}};
};
const flush=()=>new Promise(resolve=>setImmediate(resolve));
test('native selections, purchases, drag moves, selling and economy use room authority',async()=>{
 const t=setup();const b=t.bridge;const gold=b.engine.state.gold;
 b.dispatch({type:'shop',index:0});await flush();assert.ok(b.engine.state.gold<gold);
 assert.equal(b.engine.state.gold,t.room().match.players[0].snapshot.state.gold);
 b.dispatch({type:'slot',location:{zone:'board',index:11}});assert.equal(t.commands.length,1);
 b.dispatch({type:'slot',location:{zone:'bench',index:0}});await flush();assert.equal(b.engine.state.bench[0].id,'nori');
 b.dispatch({type:'move',from:{zone:'bench',index:0},to:{zone:'board',index:5}});await flush();assert.equal(b.engine.state.board[5].id,'nori');
 b.dispatch({type:'sell',location:{zone:'board',index:5}});await flush();assert.equal(b.engine.state.board[5],null);
 b.dispatch({type:'lock'});await flush();assert.equal(b.engine.state.shopLocked,true);
 b.dispatch({type:'buyXp'});await flush();assert.ok(b.engine.state.playerLevel>3);
});
test('ready blocks mutations and autopilot but preserves inspection and cancellation',async()=>{
 const t=setup();const b=t.bridge;b.dispatch({type:'battle'});await flush();assert.equal(b.me.ready,true);assert.equal(b.canAutoplayAct,false);
 const gold=b.engine.state.gold;b.dispatch({type:'reroll'});await flush();assert.equal(b.engine.state.gold,gold);
 b.dispatch({type:'slot',location:{zone:'board',index:11}});assert.equal(b.engine.state.selected.index,11);
 b.dispatch({type:'restart'});assert.equal(b.engine.state.phase,'preparation');
 b.dispatch({type:'battle'});await flush();assert.equal(b.me.ready,false);assert.equal(b.canAutoplayAct,true);
});
test('forge unlocks without selection and upgrades through native controls',async()=>{
 const t=setup('coop',r=>{const s=r.match.players[0].snapshot.state;s.playerLevel=10;s.gold=200;});const b=t.bridge;
 b.dispatch({type:'starForge'});await flush();assert.equal(b.engine.isStarForgeUnlocked,true);
 const gold=b.engine.state.gold;b.dispatch({type:'starForge',location:{zone:'board',index:11}});await flush();assert.equal(b.engine.state.board[11].star,2);assert.ok(b.engine.state.gold<gold);
});
test('unrelated polls preserve selection and do not rebuild canvas',()=>{
 const t=setup();t.bridge.dispatch({type:'slot',location:{zone:'board',index:11}});
 const events=[];t.bridge.onEvent=e=>events.push(e.type);const r=structuredClone(t.room());r.revision++;r.match.players[1].ready=true;t.setRoom(r);
 assert.equal(t.bridge.engine.state.selected.index,11);assert.deepEqual(events,['hud']);
});
test('shared clock prevents pause and skip, preserves inspection and delays economy until settlement',ctx=>{
 let now=100000;ctx.mock.method(Date,'now',()=>now);
 const t=setup();const r=structuredClone(t.room());r.match=rules.settleRound(r.match,now);t.setRoom(r);const b=t.bridge;
 const opening=r.match.timeline.opening[0];assert.equal(b.stage,'battle');assert.equal(b.engine.state.battle.elapsed,0);
 b.setBattlePaused(true);b.skipBattle();b.confirmReport();assert.equal(b.battlePaused,false);assert.equal(t.commands.length,0);
 b.dispatch({type:'rankingToggle'});assert.equal(b.engine.state.battle.rankingOpen,true);
 b.dispatch({type:'metric',metric:'support'});assert.equal(b.engine.state.battle.rankingMetric,'support');
 b.dispatch({type:'inspectFighter',fid:b.engine.state.battle.player[0].fid});assert.ok(b.inspectedFighterId);
 now=r.match.timeline.startsAt+700;b.update(.05);assert.ok(b.engine.state.battle.elapsed>.65);
 assert.equal(b.engine.state.gold,opening.gold);assert.equal(b.engine.state.hp,opening.hp);
 now=r.match.timeline.combatEndsAt;b.update(.05);assert.equal(b.replayComplete,true);
 const expected=rules.simulate(b.battle.recipe);assert.equal(b.engine.state.battle.elapsed,expected.battle.elapsed);
 assert.equal(b.engine.state.gold,b.match.self.gold);assert.equal(b.engine.state.hp,b.me.hp);assert.ok(b.getBattleLog().length>0);
 assert.equal(b.engine.state.phase,'battle');assert.equal(t.commands.length,0);
});
test('spectating switches to current shared time and polls never restart battle',ctx=>{
 let now=100000;ctx.mock.method(Date,'now',()=>now);
 const t=setup();const r=structuredClone(t.room());r.match=rules.settleRound(r.match,now);t.setRoom(r);const b=t.bridge;
 now=r.match.timeline.startsAt+1000;b.update(.05);const elapsed=b.engine.state.battle.elapsed;
 b.watchSeat(1);assert.equal(b.battleIndex,1);assert.equal(b.watchedSeat,1);assert.equal(b.engine.state.battle.elapsed,elapsed);
 b.syncSession({...t.session(),room:structuredClone(t.session().room)});assert.equal(b.battleIndex,1);assert.equal(b.engine.state.battle.elapsed,elapsed);
 now+=500;b.setHidden(true);b.updateBackground();assert.ok(b.engine.state.battle.elapsed>elapsed);
});
test('short defense waits for longest line, rescue starts automatically and final result waits for combat',ctx=>{
 let now=100000;ctx.mock.method(Date,'now',()=>now);
 const t=setup('coop',r=>{
  r.match.players[0].snapshot.state.board.fill(null);
  const board=r.match.players[1].snapshot.state.board;board.fill(null);
  ['sui_cat','biscuit_sui','nori'].forEach((id,i)=>{board[i]={id,star:3,uid:i+10};});
 });
 const r=structuredClone(t.room());r.match=rules.settleRound(r.match,now);t.setRoom(r);const b=t.bridge;const timeline=r.match.timeline;
 assert.ok(r.match.battles.some(b=>b.rescueFor===0));
 now=timeline.startsAt+100;b.update(.1);assert.equal(b.replayComplete,true);assert.match(b.statusText,/等待.*战线/);
 b.playBattle(2);assert.equal(b.battleIndex,0,'cannot reveal rescue early');
 now=timeline.defenseEndsAt;b.update(.1);assert.equal(b.stage,'rescue');assert.equal(b.battle.rescueFor,0);assert.equal(b.engine.state.battle.elapsed,0);
 now=timeline.rescueStartsAt+100;b.update(.1);assert.ok(b.engine.state.battle.elapsed>0);
 now=timeline.endsAt;b.update(.1);assert.equal(b.engine.state.hp,20);assert.equal(b.replayComplete,true);
 const end=structuredClone(r);end.match.phase='finished';end.match.winners=[0,1];now=timeline.startsAt;t.setRoom(end);
 assert.equal(b.panelOpen,false);now=timeline.endsAt;b.update(.1);assert.equal(b.stage,'finished');assert.equal(b.panelOpen,true);
});
test('server time aligns skewed clients and reconnect catches up mid battle',ctx=>{
 let now=500000;ctx.mock.method(Date,'now',()=>now);
 const t=setup();const r=structuredClone(t.room());r.code='ABCDEFGH';r.match=rules.settleRound(r.match,100000);
 const view=rooms.viewRoom(r,0,r.match.timeline.startsAt+800);
 const first=new MultiplayerBridge({...t.session(),room:view});assert.ok(first.engine.state.battle.elapsed>.75);
 now=1000;
 const second=new MultiplayerBridge({...t.session(),room:rooms.viewRoom(r,1,view.serverNow)});
 assert.equal(first.engine.state.battle.elapsed,second.engine.state.battle.elapsed);assert.equal(second.stage,'battle');
});
test('scouting and AI planning use previous lineup, coop preview uses shared wave seed',()=>{
 const t=setup('versus');let r=structuredClone(t.room());r.match=rules.nextRound(rules.settleRound(r.match));t.setRoom(r);
 assert.deepEqual(t.bridge.engine.currentWave.units,t.bridge.opponentBoard.filter(Boolean).map(u=>({id:u.id,star:u.star})));
 assert.deepEqual(rules.engineFor(t.bridge.engine.getSimulationSnapshot()).currentWave,t.bridge.engine.currentWave);
 t.bridge.playBattle(0,true);assert.equal(t.bridge.engine.state.phase,'preparation','previous-round replay cannot replace the editable board');
 const c=setup();const guest=rooms.viewRoom(c.room(),1);assert.equal(guest.match.self.enemySeed,c.room().match.seed);assert.equal('snapshot' in guest.match.players[0],false);
});
test('deadline advances native UI and finished games remain reviewable',()=>{
 const t=setup();t.setRoom(rooms.tickRoom(t.room(),t.room().match.deadline+1));assert.equal(t.bridge.engine.state.phase,'battle');
 const r=structuredClone(t.room());r.match.phase='finished';r.match.winners=[0];t.setRoom(r);t.bridge.skipBattle();assert.equal(t.bridge.engine.state.phase,'battle');assert.deepEqual(t.bridge.match.winners,[0]);
});


test('aftermath advances visual time and expires effects without changing combat or rescue state',ctx=>{
 let now=100000;ctx.mock.method(Date,'now',()=>now);
 const t=setup();const r=structuredClone(t.room());r.match=rules.settleRound(r.match,now);t.setRoom(r);const b=t.bridge;
 now=r.match.timeline.combatEndsAt;b.tickRoundClock();assert.equal(b.replayComplete,true);
 const combat=()=>structuredClone({fighters:[...b.engine.state.battle.player,...b.engine.state.battle.enemy],elapsed:b.engine.state.battle.elapsed,report:b.me.report,gold:b.engine.state.gold,hp:b.engine.state.hp,recipe:b.battle.recipe,random:b.engine.getSimulationSnapshot().randomState});
 const before=combat();const visual=b.engine.state.visualTime;
 b.engine.state.battle.effects.push({kind:'text',x:0,y:0,color:'#fff',text:'末次伤害',life:.5,maxLife:.5,size:12});
 now+=300;b.tickRoundClock();assert.ok(b.battleAftermath.elapsed>=.3);assert.ok(b.engine.state.visualTime>=visual+.29);assert.ok(b.engine.state.battle.effects.some(e=>e.text==='末次伤害'));
 now+=500;b.tickRoundClock();assert.ok(!b.engine.state.battle.effects.some(e=>e.text==='末次伤害'));assert.deepEqual(b.engine.state.battle.projectiles,[]);assert.deepEqual(combat(),before);
 const after=b.engine.state.visualTime;b.tickRoundClock();assert.equal(b.engine.state.visualTime,after,'repeated HUD tick must not double advance animation');
 b.watchSeat(1);assert.ok(b.battleAftermath.elapsed>0,'finished spectated lines keep animating too');
 t.setRoom(rooms.tickRoom(r,r.match.deadline));assert.equal(b.battleAftermath,null,'new preparation clears celebration');
});
