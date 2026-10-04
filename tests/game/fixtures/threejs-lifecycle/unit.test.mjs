import test from 'node:test';
import assert from 'node:assert/strict';
import {BoxGeometry,MeshBasicMaterial,Mesh} from 'three';
import {Game,damage} from './dist/model.js';
import {ObjectPool} from './dist/pool.js';
test('damage formula and floor are exact',()=>{
 assert.equal(damage(50,20,1.5,true),130);
 assert.equal(damage(5,100,1,false),1);
});
test('fixed-step seeded route supports win lose pause and repeated restart',()=>{
 const g=new Game(7);assert.deepEqual(g.route,new Game(7).route);
 for(let n=0;n<20;n++){
  g.start();g.pause();g.step();assert.equal(g.ticks,0);g.resume();
  for(const lane of g.route){g.move(lane-g.lane);for(let i=0;i<120;i++)g.step();}
  assert.equal(g.phase,'won');assert.equal(g.score,3);
 }
 g.start();g.move((g.route[0]+1)%3-g.lane);
 for(let i=0;i<120;i++)g.step();assert.equal(g.phase,'lost');
});
test('bounded typed mesh pool reuses instances and rejects use after disposal',()=>{
 const geometry=new BoxGeometry();const material=new MeshBasicMaterial();
 let destroyed=0;const pool=new ObjectPool(()=>new Mesh(geometry,material),m=>m.position.set(0,0,0),()=>destroyed++,2);
 const a=pool.acquire(),b=pool.acquire();assert.throws(()=>pool.acquire(),/exhausted/);
 assert.equal(pool.release(a),true);assert.equal(pool.release(a),false);
 for(let i=0;i<1000;i++){const m=pool.acquire();assert.equal(m,a);pool.release(m);}
 assert.equal(pool.created,2);assert.equal(pool.activeCount,1);pool.release(b);
 pool.dispose();pool.dispose();assert.equal(destroyed,2);assert.throws(()=>pool.acquire(),/disposed/);
 let geometryDisposals=0,materialDisposals=0;
 geometry.addEventListener('dispose',()=>geometryDisposals++);material.addEventListener('dispose',()=>materialDisposals++);
 geometry.dispose();material.dispose();assert.equal(geometryDisposals,1);assert.equal(materialDisposals,1);
 // Disposal events prove calls, not GPU driver reclamation or mobile performance.
});

test('cached navigation preserves listeners until final leave', async()=>{
 const {bindPageLifecycle}=await import('./dist/lifecycle.js');
 const target=new EventTarget(), controller=new AbortController();
 let paused=0,disposed=0;
 bindPageLifecycle(target,()=>paused++,()=>{disposed++;controller.abort();},controller.signal);
 const hide=persisted=>target.dispatchEvent(Object.assign(new Event('pagehide'),{persisted}));
 hide(true);hide(true);assert.equal(paused,2);assert.equal(disposed,0);
 hide(false);hide(false);assert.equal(disposed,1);
});
