export type Phase='ready'|'playing'|'paused'|'won'|'lost';
export class Game {
 phase:Phase='ready';lane=1;score=0;readonly route=[0,2,1];
 start():void{this.phase='playing';this.lane=1;this.score=0;}
 move(direction:number):void{if(this.phase==='playing')this.lane=Math.max(0,Math.min(2,this.lane+Math.sign(direction)));}
 advance():void{if(this.phase!=='playing')return;if(this.lane!==this.route[this.score]){this.phase='lost';return;}this.score++;if(this.score===this.route.length)this.phase='won';}
 pause():void{if(this.phase==='playing')this.phase='paused';}
 resume():void{if(this.phase==='paused')this.phase='playing';}
}
