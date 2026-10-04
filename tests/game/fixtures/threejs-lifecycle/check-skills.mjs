import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
const root=fileURLToPath(new URL('.',import.meta.url));
const markdown=readFileSync(new URL('../../../../skills/threejs-engineer/SKILL.md',import.meta.url),'utf8');
const blocks=[...markdown.matchAll(/```typescript\n([\s\S]*?)```/g)].map(m=>m[1]);
const directory=mkdtempSync(join(root,'.skill-check-'));
try {
 const paths=['class App {','class FirstPersonCamera {','class InteractionSystem {','class GameObject extends THREE.Object3D {','class InstancedObjects {'].map((name,index)=>{
  const block=blocks.find(code=>code.includes(name));
  if(!block)throw new Error(`Missing skill example ${name}`);
  const path=join(directory,`${index}.ts`);
  writeFileSync(path,(block.includes("import * as THREE")?'':"import * as THREE from 'three';\n")+block);
  return path;
 });
 const result=spawnSync(process.execPath,[fileURLToPath(new URL('../../../../node_modules/typescript/bin/tsc',import.meta.url)),'--noEmit','--strict','--skipLibCheck','--module','NodeNext','--target','ES2022','--lib','ES2022,DOM',...paths],{stdio:'inherit',timeout:30000});
 if(result.error)throw result.error;
 process.exitCode=result.status??1;
} finally {rmSync(directory,{recursive:true,force:true});}
