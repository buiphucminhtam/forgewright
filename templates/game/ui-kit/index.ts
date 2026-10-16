/** Small renderer-neutral DOM kit. The host owns game state and control mode. */
export interface GameUITokens { background?: string; surface?: string; text?: string; accent?: string; danger?: string; font?: string; radius?: string }
export type GameUIKind = 'button'|'icon'|'panel'|'dialog'|'tab'|'toggle'|'slider'|'progress'|'tooltip'|'toast'|'text';
export interface GameUIComponent { id: string; kind: GameUIKind; label: string; visible?: boolean; enabled?: boolean; state?: 'default'|'pressed'|'focus'|'disabled'|'loading'|'error'; value?: number|boolean|string; min?: number; max?: number; step?: number; selected?: boolean }
export interface GameUIModel { screen: string; modal?: string; components: GameUIComponent[] }
export interface GameUIActions { onAction(id: string, value?: string|number|boolean): void; onModalChange?(open: boolean): void }

export function createGameUIKit(root: HTMLElement, options: {tokens: GameUITokens; actions: GameUIActions}): {render(model: GameUIModel): void; dispose(): void} {
 const doc=root.ownerDocument;
 const host=doc.createElement('section'); host.className='game-ui';host.setAttribute('aria-label','Game interface');root.append(host);
 const allowed=['background','surface','text','accent','danger','font','radius'] as const;
 for(const key of allowed)if(options.tokens[key])host.style.setProperty('--game-'+key,options.tokens[key]!);
 const nodes=new Map<string,{node:HTMLElement;control:HTMLElement;kind:GameUIKind}>();
 let model:GameUIModel={screen:'boot',components:[]},disposed=false,returnFocus:Element|null=null;
 const owned:Array<[EventTarget,string,EventListener,boolean]>=[];
 const listen=(target:EventTarget,name:string,handler:EventListener,capture=false)=>{target.addEventListener(name,handler,capture);owned.push([target,name,handler,capture]);};
 function act(event:Event):void {
  const target=event.target as HTMLElement;
  const id=target?.dataset?.gameAction;
  if(!id)return;
  const spec=model.components.find(c=>c.id===id);
  if(!spec||spec.visible===false||spec.enabled===false||spec.state==='disabled'||spec.state==='loading')return;
  if((spec.kind==='button'||spec.kind==='icon'||spec.kind==='tab')&&event.type==='click')options.actions.onAction(id,undefined);
  if(spec.kind==='toggle'&&event.type==='change')options.actions.onAction(id,(target as HTMLInputElement).checked);
  if(spec.kind==='slider'&&event.type==='input')options.actions.onAction(id,Number((target as HTMLInputElement).value));
 }
 listen(host,'click',act);listen(host,'change',act);listen(host,'input',act);
 const focusables=()=>Array.from(host.querySelectorAll<HTMLElement>('button,input,[tabindex="0"]')).filter(el=>!el.closest('[hidden]')&&!(el as HTMLButtonElement).disabled);
 listen(doc,'keydown',event=>{
  if(!model.modal)return;
  const key=event as KeyboardEvent;key.stopPropagation();
  if(key.key==='Escape'){key.preventDefault();options.actions.onAction(model.modal,'dismiss');}
  if(key.key==='Tab'){
   const list=focusables();const index=list.indexOf(doc.activeElement as HTMLElement);
   const next=key.shiftKey?(index<=0?list.length-1:index-1):(index+1)%list.length;
   key.preventDefault();list[next]?.focus();
  }
 },true);
 listen(doc,'pointerdown',event=>{if(model.modal&&!host.contains(event.target as Node)){event.preventDefault();event.stopPropagation();}},true);
 function create(spec:GameUIComponent){
  let node:HTMLElement,control:HTMLElement;
  if(spec.kind==='toggle'||spec.kind==='slider'){
   node=doc.createElement('label');const text=doc.createElement('span');text.dataset.label='';node.append(text);
   const input=doc.createElement('input');input.type=spec.kind==='toggle'?'checkbox':'range';node.append(input);control=input;
  }else{
   node=doc.createElement(['button','icon','tab'].includes(spec.kind)?'button':spec.kind==='progress'?'progress':'section');control=node;
   if(spec.kind==='dialog'){const label=doc.createElement('span');label.dataset.label='';node.append(label);}
  }
  control.id=spec.id;control.dataset.gameAction=spec.id;host.append(node);
  return {node,control,kind:spec.kind};
 }
 function render(next:GameUIModel):void {
  if(disposed)throw new Error('UI kit disposed');
  const ids=next.components.map(c=>c.id);
  if(new Set(ids).size!==ids.length)throw new Error('duplicate component ID');
  for(const c of next.components){
   if(!c.id||!c.label)throw new Error('component identity and label required');
   if(c.kind==='slider'||c.kind==='progress'){
    if(![c.value??0,c.min??0,c.max??1,c.step??0.1].every(v=>typeof v==='number'&&Number.isFinite(v))||(c.max??1)<=(c.min??0))throw new Error('finite increasing range required');
   }
  }
  if(next.modal&&!next.components.some(c=>c.id===next.modal&&c.kind==='dialog'&&c.visible!==false))throw new Error('modal must reference a visible dialog');
  const previousModal=model.modal,wasOpen=Boolean(previousModal);if(!wasOpen&&next.modal)returnFocus=doc.activeElement;model=next;host.dataset.screen=next.screen;
  host.classList.toggle('game-ui-modal',Boolean(next.modal));
  for(const [id,item] of nodes)if(!ids.includes(id)){item.node.remove();nodes.delete(id);}
  for(const spec of next.components){
   let item=nodes.get(spec.id);
   if(item&&item.kind!==spec.kind){item.node.remove();nodes.delete(spec.id);item=undefined;}
   if(!item){item=create(spec);nodes.set(spec.id,item);}
   const {node,control}=item;node.className='game-ui-'+spec.kind;node.hidden=spec.visible===false;node.dataset.state=spec.state??'default';
   control.setAttribute('aria-label',spec.label);control.setAttribute('aria-busy',String(spec.state==='loading'));
   const disabled=spec.enabled===false||spec.state==='disabled'||spec.state==='loading';
   if(control instanceof doc.defaultView!.HTMLButtonElement||control instanceof doc.defaultView!.HTMLInputElement)control.disabled=disabled;
   const label=node.querySelector<HTMLElement>('[data-label]');if(label)label.textContent=spec.label;
   if(spec.kind==='toggle') (control as HTMLInputElement).checked=Boolean(spec.value);
   else if(spec.kind==='slider'){
    const input=control as HTMLInputElement;input.min=String(spec.min??0);input.max=String(spec.max??1);input.step=String(spec.step??0.1);input.value=String(spec.value??0);
   }else if(spec.kind==='progress'){
    const progress=control as HTMLProgressElement;progress.max=spec.max??1;progress.value=Number(spec.value??0);progress.textContent=spec.label;
   }else if(!label)node.textContent=spec.label;
   if(spec.kind==='tab'){control.setAttribute('role','tab');control.setAttribute('aria-selected',String(Boolean(spec.selected)));}
   if((spec.kind==='button'||spec.kind==='icon')&&spec.selected!==undefined)control.setAttribute('aria-pressed',String(spec.selected));else control.removeAttribute('aria-pressed');
   if(spec.kind==='dialog'){node.setAttribute('role','dialog');node.setAttribute('aria-modal','true');}
   if(spec.kind==='toast'){node.setAttribute('role','status');node.setAttribute('aria-live','polite');}
   if(spec.kind==='tooltip')node.setAttribute('role','tooltip');
  }
  const dialog=next.modal?nodes.get(next.modal)?.node:undefined;
  // The newly active dialog may be nested in the previous one. Promote it
  // before moving the other retained nodes to avoid a DOM ancestor cycle.
  if(dialog&&dialog.parentElement!==host)host.append(dialog);
  for(const [id,item] of nodes)if(id!==next.modal&&item.node.parentElement!==(dialog??host))(dialog??host).append(item.node);
  if(next.modal&&previousModal!==next.modal)focusables()[0]?.focus();
  if(!wasOpen&&next.modal)options.actions.onModalChange?.(true);
  if(wasOpen&&!next.modal){const target=returnFocus?.isConnected?returnFocus:returnFocus?.id?doc.getElementById(returnFocus.id):null;(target as HTMLElement|null)?.focus();returnFocus=null;options.actions.onModalChange?.(false);}
 }
 function dispose():void {
  if(disposed)return;disposed=true;
  for(const [target,name,handler,capture] of owned)target.removeEventListener(name,handler,capture);
  if(model.modal){(returnFocus as HTMLElement|null)?.focus();options.actions.onModalChange?.(false);}
  host.remove();nodes.clear();
 }
 return {render,dispose};
}
