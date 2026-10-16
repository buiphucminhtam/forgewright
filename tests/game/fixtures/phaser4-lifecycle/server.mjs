import {fileURLToPath} from 'node:url';import {join} from 'node:path';
import {serveExperience} from '../web-experience-server.mjs';
const root=fileURLToPath(new URL('.',import.meta.url));
export async function serve(port=0){return serveExperience([
 ['/',join(root,'index.html'),'text/html'],
 ...['app','model'].map(name=>[`/tests/game/fixtures/phaser4-lifecycle/src/${name}.js`,join(root,`dist/tests/game/fixtures/phaser4-lifecycle/src/${name}.js`),'text/javascript']),
 ['/tests/game/fixtures/threejs-lifecycle/src/lifecycle.js',join(root,'dist/tests/game/fixtures/threejs-lifecycle/src/lifecycle.js'),'text/javascript'],
 ['/templates/game/ui-kit/index.js',join(root,'dist/templates/game/ui-kit/index.js'),'text/javascript'],
 ['/ui/index.js',join(root,'dist/templates/game/ui-kit/index.js'),'text/javascript'],
 ['/ui/tokens.css',join(root,'../../../../templates/game/ui-kit/tokens.css'),'text/css'],['/ui/preview.html',join(root,'../../../../templates/game/ui-kit/preview.html'),'text/html'],
 ['/vendor/phaser.esm.js',join(root,'node_modules/phaser/dist/phaser.esm.js'),'text/javascript'],
 ...['hero.png','garden.svg','panel.svg'].map(name=>[`/assets/${name}`,join(root,'assets',name),name.endsWith('.png')?'image/png':'image/svg+xml']),
 ],port);}
if(process.argv[1]===fileURLToPath(import.meta.url)){const host=await serve(4180);console.log(JSON.stringify({url:host.url,build:host.build}));for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>host.server.close());}
