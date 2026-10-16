import {fileURLToPath} from 'node:url';import {join} from 'node:path';
import {serveExperience} from '../web-experience-server.mjs';
const root=fileURLToPath(new URL('.',import.meta.url));
export async function serve(port=0){return serveExperience([
 ['/',join(root,'experience.html'),'text/html'],
 ['/tests/game/fixtures/threejs-lifecycle/experience/app.js',join(root,'experience-dist/tests/game/fixtures/threejs-lifecycle/experience/app.js'),'text/javascript'],
 ...['model','lifecycle'].map(name=>[`/tests/game/fixtures/threejs-lifecycle/src/${name}.js`,join(root,`experience-dist/tests/game/fixtures/threejs-lifecycle/src/${name}.js`),'text/javascript']),
 ['/templates/game/ui-kit/index.js',join(root,'experience-dist/templates/game/ui-kit/index.js'),'text/javascript'],
 ['/ui/tokens.css',join(root,'../../../../templates/game/ui-kit/tokens.css'),'text/css'],
 ...['three.module','three.core'].map(name=>[`/vendor/${name}.js`,join(root,`node_modules/three/build/${name}.js`),'text/javascript']),
 ['/vendor/GLTFLoader.js',join(root,'node_modules/three/examples/jsm/loaders/GLTFLoader.js'),'text/javascript'],
 ...['BufferGeometryUtils','SkeletonUtils'].map(name=>[`/utils/${name}.js`,join(root,`node_modules/three/examples/jsm/utils/${name}.js`),'text/javascript']),
 ['/assets/courier.glb',join(root,'assets/courier.glb'),'model/gltf-binary']
 ],port);}
