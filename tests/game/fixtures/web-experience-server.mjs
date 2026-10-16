/** Explicit trusted-code file allowlist; no caller path-to-filesystem mapping. */
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
export async function serveExperience(files,port=0){
 const content=new Map(files.map(([url,path,type])=>[url,{body:readFileSync(path),type}]));
 const hash=createHash('sha256');for(const [url,item] of content)hash.update(url).update(item.body);const build=hash.digest('hex');
 const server=createServer((req,res)=>{
  let url;try{url=new URL(req.url,'http://127.0.0.1').pathname;}catch{res.writeHead(400);res.end();return;}
  if(url==='/favicon.ico'){res.writeHead(204);res.end();return;}
  if(url==='/build.json'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({hash:build}));return;}
  const file=content.get(url);if(!file){res.writeHead(404);res.end('Not found');return;}
  res.setHeader('Content-Type',file.type);res.setHeader('Cache-Control','no-store');res.end(file.body);
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
 return {server,build,url:`http://127.0.0.1:${server.address().port}`};
}
