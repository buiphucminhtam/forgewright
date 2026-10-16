import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createGameUIKit} from './dist/templates/game/ui-kit/index.js';

function fixture(){
 const dom=new JSDOM('<button id="outside">Outside</button><main></main>');
 const root=dom.window.document.querySelector('main'),calls=[],modal=[];
 const ui=createGameUIKit(root,{tokens:{accent:'#ffd44d'},actions:{onAction:(...args)=>calls.push(args),onModalChange:open=>modal.push(open)}});
 return {dom,root,calls,modal,ui};
}
const button=(id,extra={})=>({id,kind:'button',label:id,...extra});
test('render updates retained controls; disabled/loading cannot activate and text is not interpreted as HTML',()=>{
 const f=fixture();const model={screen:'menu',components:[button('start',{label:'<img onerror=bad()>restart'})]};
 f.ui.render(model);const b=f.root.querySelector('button');f.ui.render(model);assert.equal(b,f.root.querySelector('button'));
 b.click();assert.deepEqual(f.calls,[['start',undefined]]);assert.equal(f.root.querySelector('img'),null);
 for(const state of ['disabled','loading']){f.ui.render({screen:'menu',components:[button('start',{state})]});b.click();}
 assert.equal(f.calls.length,1);f.ui.dispose();f.dom.window.close();
});
test('modal captures game keyboard, restores focus, and disposal never removes foreign nodes',()=>{
 const f=fixture(),doc=f.dom.window.document,outside=doc.querySelector('#outside');outside.focus();let gameKeys=0;
 f.dom.window.addEventListener('keydown',()=>gameKeys++);
 f.ui.render({screen:'paused',modal:'settings',components:[{id:'settings',kind:'dialog',label:'Settings'},button('resume')]});
 assert.equal(doc.activeElement.id,'resume');
 assert.equal(f.root.querySelector('#settings').contains(doc.activeElement),true);
 f.ui.render({screen:'paused',modal:'settings',components:[{id:'settings',kind:'dialog',label:'Settings'},button('resume')]});
 assert.equal(doc.activeElement.id,'resume');
 doc.activeElement.dispatchEvent(new f.dom.window.KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}));assert.equal(gameKeys,0);
 doc.activeElement.dispatchEvent(new f.dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.deepEqual(f.calls,[['settings','dismiss']]);
 f.ui.render({screen:'play',components:[button('pause')]});assert.equal(doc.activeElement,outside);assert.deepEqual(f.modal,[true,false]);
 f.ui.dispose();f.ui.dispose();assert.equal(outside.isConnected,true);
 outside.dispatchEvent(new f.dom.window.KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}));assert.equal(gameKeys,1);
 f.dom.window.close();
});
test('range and toggle emit semantic values; duplicate IDs and non-finite ranges are rejected',()=>{
 const f=fixture();f.ui.render({screen:'settings',components:[{id:'audio',kind:'toggle',label:'Audio',value:true},{id:'volume',kind:'slider',label:'Volume',value:0.5,min:0,max:1,step:0.1}]});
 const toggle=f.root.querySelector('input[type=checkbox]');toggle.click();assert.deepEqual(f.calls.pop(),['audio',false]);
 const range=f.root.querySelector('input[type=range]');range.value='0.8';range.dispatchEvent(new f.dom.window.Event('input',{bubbles:true}));assert.deepEqual(f.calls.pop(),['volume',0.8]);
 assert.throws(()=>f.ui.render({screen:'bad',components:[button('same'),button('same')]}),/duplicate/);
 assert.throws(()=>f.ui.render({screen:'bad',components:[{id:'bad',kind:'slider',label:'Bad',value:NaN}]}),/finite/);
 f.ui.dispose();f.dom.window.close();
});
test('closing a modal restores its trigger after the host replaces the screen model',()=>{
 const f=fixture();f.ui.render({screen:'play',components:[button('settings')]});f.root.querySelector('#settings').focus();
 f.ui.render({screen:'settings',modal:'options',components:[{id:'options',kind:'dialog',label:'Options'},button('close')]});
 f.ui.render({screen:'play',components:[button('settings')]});
 assert.equal(f.dom.window.document.activeElement.id,'settings');f.ui.dispose();f.dom.window.close();
});
test('switching retained modal IDs preserves the active dialog and returns focus on close',()=>{
 const f=fixture(),doc=f.dom.window.document;doc.querySelector('#outside').focus();
 const components=active=>[{id:'pause-dialog',kind:'dialog',label:'Pause',visible:active==='pause-dialog'},{id:'settings-dialog',kind:'dialog',label:'Settings',visible:active==='settings-dialog'},button('continue')];
 f.ui.render({screen:'pause',modal:'pause-dialog',components:components('pause-dialog')});
 f.ui.render({screen:'settings',modal:'settings-dialog',components:components('settings-dialog')});
 assert.equal(doc.activeElement.id,'continue');assert.equal(doc.querySelector('#settings-dialog').contains(doc.activeElement),true);
 assert.equal(doc.querySelector('#settings-dialog').parentElement.classList.contains('game-ui'),true);
 assert.deepEqual(f.modal,[true]);f.ui.render({screen:'play',components:[button('pause')]});
 assert.equal(doc.activeElement.id,'outside');assert.deepEqual(f.modal,[true,false]);f.ui.dispose();f.dom.window.close();
});
