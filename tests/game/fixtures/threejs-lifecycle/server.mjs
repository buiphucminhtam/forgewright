import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
const root=fileURLToPath(new URL('.',import.meta.url));
export async function serve(port=0) {
 const files=new Map([
  ['/', ['index.html','text/html']],
  ...['app','model','pool','lifecycle'].map(name=>[`/dist/${name}.js`,[`dist/${name}.js`,'text/javascript']]),
  ...['three.module','three.core'].map(name=>[`/vendor/${name}.js`,[`node_modules/three/build/${name}.js`,'text/javascript']]),
 ]);
 const content=new Map([...files].map(([url,[path,type]])=>[url,{body:readFileSync(join(root,path)),type}]));
 const hash=createHash('sha256');
 for(const [url,item] of content)hash.update(url).update(item.body);
 const build=hash.digest('hex');
 const server=createServer((req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1').pathname;
  if(url==='/favicon.ico'){res.writeHead(204);res.end();return;}
  if(url==='/build.json'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({hash:build}));return;}
  const file=content.get(url);
  if(!file){res.writeHead(404);res.end('Not found');return;}
  res.setHeader('Content-Type',file.type);res.setHeader('Cache-Control','no-store');res.end(file.body);
 });
 await new Promise(resolve=>server.listen(port,'127.0.0.1',resolve));
 return {server,build,url:`http://127.0.0.1:${server.address().port}`};
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
 const {server,url,build}=await serve(Number(process.env.PORT||4173));
 console.log(JSON.stringify({url,build}));
 process.once('SIGTERM',()=>server.close());process.once('SIGINT',()=>server.close());
}
