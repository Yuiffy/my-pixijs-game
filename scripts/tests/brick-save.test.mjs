import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTypescriptModule } from './helpers/load-typescript-module.mjs';
const { restoreExcavation } = await loadTypescriptModule('src/components/brickExcavation/save.ts');
const { createGame, strike, getCluster, shuffleRemaining } = await loadTypescriptModule('src/components/brickExcavation/engine.ts');
const encode = (seed, actions, previewFirst = false) => JSON.stringify({version:1, seed, actions, previewFirst});

test('replay preserves every legal board, treasure, score and undo state across 40 complete games', () => {
  for (let seed=0; seed<40; seed++) {
    let game=createGame(seed); const actions=[], history=[];
    while(game.status==='playing') {
      const groups=game.board.map((_,i)=>getCluster(game.board,i,game.cols));
      const group=groups.reduce((a,b)=>a.length>b.length?a:b,[]);
      const action=group.length>=2?group[0]:'shuffle';
      const next=action==='shuffle'?shuffleRemaining(game):strike(game,action);
      assert.notEqual(next,game); history.push(game); actions.push(action); game=next;
      const restored=restoreExcavation(encode(seed,actions,seed%2===0));
      assert.deepEqual(restored.game,game); assert.deepEqual(restored.history,history);
      assert.equal(restored.save.previewFirst,seed%2===0);
    }
    for(let i=actions.length-1;i>=0;i--) assert.deepEqual(restoreExcavation(encode(seed,actions.slice(0,i))).game,history[i]);
  }
});

test('shuffle replay, undo and branching retain deterministic random colors',()=>{
  let game=createGame(7);const actions=['shuffle']; game=shuffleRemaining(game);
  const index=game.board.findIndex((_,i)=>getCluster(game.board,i,game.cols).length>=2);
  actions.push(index); game=strike(game,index);
  assert.deepEqual(restoreExcavation(encode(7,actions)).game,game);
  assert.deepEqual(restoreExcavation(encode(7,['shuffle'])).game,shuffleRemaining(createGame(7)));
  assert.deepEqual(restoreExcavation(encode(7,[index])).game,strike(createGame(7),index));
});

test('malformed, incompatible, excessive and impossible actions never partially restore',()=>{
  const invalid=[null,[],{}, {version:2,seed:0,actions:[],previewFirst:false},
    ...[-1,1.5,'0',null,Number.MAX_VALUE].map(seed=>({version:1,seed,actions:[],previewFirst:false})),
    ...[null,{},[null],[false],[-1],[100],[0.5],['strike'],['shuffle','shuffle','shuffle'],[0,0],Array(53).fill('shuffle')].map(actions=>({version:1,seed:0,actions,previewFirst:false})),
    {version:1,seed:0,actions:[],previewFirst:'yes'}];
  for(const value of invalid) assert.equal(restoreExcavation(JSON.stringify(value)),null,JSON.stringify(value));
  for(const raw of ['', '{',' '.repeat(5000)]) assert.equal(restoreExcavation(raw),null);
});

test('stored arbitrary board and treasure fields cannot override reconstructed game',()=>{
  const raw=JSON.stringify({version:1,seed:0,actions:[],previewFirst:true,board:[],score:999999,treasures:[{portrait:'https://example.com/evil'}]});
  const restored=restoreExcavation(raw);assert.deepEqual(restored.game,createGame(0));assert.equal('board' in restored.save,false);
});
