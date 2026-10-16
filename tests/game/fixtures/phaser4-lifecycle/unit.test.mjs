import test from 'node:test';import assert from 'node:assert/strict';
import {Game} from './dist/tests/game/fixtures/phaser4-lifecycle/src/model.js';
test('full route wins, wrong route loses, pause blocks moves and repeated restarts reset exactly',()=>{
 const game=new Game();assert.equal(game.phase,'ready');game.start();game.move(-1);game.pause();game.move(1);game.advance();assert.equal(game.lane,0);assert.equal(game.score,0);game.resume();
 for(const lane of [0,2,1]){while(game.lane!==lane)game.move(game.lane<lane?1:-1);game.advance();}
 assert.equal(game.phase,'won');assert.equal(game.score,3);
 game.start();game.advance();assert.equal(game.phase,'lost');
 for(let i=0;i<20;i++){game.start();assert.equal(game.lane,1);assert.equal(game.score,0);assert.equal(game.phase,'playing');}
});
