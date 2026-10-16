import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {AnimationMixer,Mesh} from 'three';import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
const file=new URL('assets/courier.glb',import.meta.url);
test('pinned Three loader imports authored GLB and actually evaluates its required animation',async()=>{
 const data=readFileSync(file);const buffer=data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength);
 const asset=await new GLTFLoader().parseAsync(buffer,'');const courier=asset.scene.getObjectByName('Courier');
 assert.ok(courier instanceof Mesh);assert.equal(courier.geometry.getAttribute('position').count,8);
 const clip=asset.animations.find(c=>c.name==='hover');assert.ok(clip);assert.equal(clip.duration,1);
 const mixer=new AnimationMixer(asset.scene);mixer.clipAction(clip).play();mixer.update(.5);assert.ok(Math.abs(courier.position.y-.05)<1e-6);
 mixer.stopAllAction();mixer.uncacheRoot(asset.scene);courier.geometry.dispose();for(const material of Array.isArray(courier.material)?courier.material:[courier.material])material.dispose();
});
