import Phaser from 'phaser';
import {createGameUIKit,type GameUIComponent} from '../../../../../templates/game/ui-kit/index.js';
import {Game} from './model.js';
import {bindPageLifecycle} from '../../threejs-lifecycle/src/lifecycle.js';
const game=new Game();let scene:Garden,settings=false,resumeAfterSettings=false,motion=matchMedia('(prefers-reduced-motion: reduce)').matches?0:1,disposed=false;
const state=document.querySelector<HTMLElement>('#state')!,score=document.querySelector<HTMLElement>('#score')!,next=document.querySelector<HTMLElement>('#next')!;
const build=await fetch('/build.json').then(r=>r.json()) as {hash:string};document.querySelector('#build')!.textContent=build.hash.slice(0,12);document.querySelector('#engine-version')!.textContent=Phaser.VERSION;
const ui=createGameUIKit(document.querySelector<HTMLElement>('#interface')!,{tokens:{},actions:{onAction(id,value){
 if(id==='settings'){settings=true;resumeAfterSettings=game.phase==='playing';game.pause();}
 else if(id==='options'||id==='close-settings'){settings=false;if(resumeAfterSettings)game.resume();}
 else if(id==='contrast')document.documentElement.dataset.contrast=String(value);
 else if(id==='motion')motion=Number(value);
 else if(!settings){if(id==='start'){game.start();if(scene)scene.scene.restart();}if(id==='left')game.move(-1);if(id==='right')game.move(1);if(id==='advance')game.advance();if(id==='pause'){if(game.phase==='paused')game.resume();else game.pause();}}
 refresh();
}}});
function refresh():void{
 state.textContent=game.phase;score.textContent=`${game.score} / 3`;next.textContent=['LEFT','CENTRE','RIGHT'][game.route[Math.min(game.score,2)]];
 const components:GameUIComponent[]=settings?[{id:'options',kind:'dialog',label:'Settings'},{id:'contrast',kind:'toggle',label:'High contrast',value:document.documentElement.dataset.contrast==='true'},{id:'motion',kind:'slider',label:'Decorative motion',value:motion,min:0,max:1,step:.1},{id:'close-settings',kind:'button',label:'Back to game'}]:[
 {id:'start',kind:'button',label:game.phase==='ready'?'Start':'Restart'},{id:'left',kind:'button',label:'← Left',enabled:game.phase==='playing'},{id:'advance',kind:'button',label:'Cross ↑',enabled:game.phase==='playing'},{id:'right',kind:'button',label:'Right →',enabled:game.phase==='playing'},
 {id:'pause',kind:'button',label:game.phase==='paused'?'Resume':'Pause',enabled:['playing','paused'].includes(game.phase)},{id:'settings',kind:'button',label:'Settings'}];
 ui.render({screen:settings?'settings':game.phase,modal:settings?'options':undefined,components});scene?.sync();
}
class Garden extends Phaser.Scene{
 hero!:Phaser.GameObjects.Sprite;
 private key=(event:KeyboardEvent)=>{if(settings)return;if(event.code==='ArrowLeft')game.move(-1);else if(event.code==='ArrowRight')game.move(1);else if(event.code==='ArrowUp')game.advance();else return;event.preventDefault();refresh();};
 constructor(){super('garden');}
 preload():void{this.load.spritesheet('courier','/assets/hero.png',{frameWidth:16,frameHeight:16});this.load.image('garden','/assets/garden.svg');this.load.image('panel','/assets/panel.svg');}
 create():void{
  scene=this;this.game.canvas.dataset.sceneStarts=String(Number(this.game.canvas.dataset.sceneStarts??0)+1);this.add.image(320,240,'garden').setDisplaySize(640,480);this.add.nineslice(320,42,'panel',undefined,500,58,8,8,8,8);
  if(!this.anims.exists('idle'))this.anims.create({key:'idle',frames:this.anims.generateFrameNumbers('courier',{start:0,end:1}),frameRate:4,repeat:-1});
  this.hero=this.add.sprite(320,350,'courier').setOrigin(.5,1).setScale(5).play('idle');
  this.input.keyboard?.on('keydown',this.key);this.events.once(Phaser.Scenes.Events.SHUTDOWN,()=>this.input.keyboard?.off('keydown',this.key));
  refresh();
 }
 sync():void{if(!this.hero?.active)return;this.hero.setPosition((game.lane+1)*160,350);this.hero.anims.timeScale=motion;
  if(game.phase==='paused')this.hero.anims.pause();else this.hero.anims.resume();
  const canvas=this.game.canvas;canvas.dataset.phase=game.phase;canvas.dataset.lane=String(game.lane);canvas.dataset.score=String(game.score);canvas.dataset.assetLoaded=String(this.textures.exists('courier')&&this.anims.exists('idle'));canvas.dataset.engine=Phaser.VERSION;
 }
}
const app=new Phaser.Game({type:Phaser.AUTO,parent:'world',width:640,height:480,backgroundColor:'#173c50',scene:[Garden],render:{pixelArt:true},scale:{mode:Phaser.Scale.FIT,autoCenter:Phaser.Scale.CENTER_BOTH}});
const pauseOnBlur=()=>{if(game.phase==='playing'){game.pause();refresh();}};
const lifecycle=new AbortController();
const dispose=()=>{if(disposed)return;disposed=true;lifecycle.abort();ui.dispose();app.destroy(true);};
window.addEventListener('blur',pauseOnBlur,{signal:lifecycle.signal});
bindPageLifecycle(window,pauseOnBlur,dispose,lifecycle.signal);
