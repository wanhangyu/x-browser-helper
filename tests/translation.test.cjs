const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const folder=path.resolve(__dirname,'../extension');
const source=fs.readFileSync(path.join(folder,'translation-background.js'),'utf8');
let config={provider:'local'},granted=true,payload,calls=[],listener;const changes=[];
const chrome={runtime:{id:'test',getURL:name=>'chrome-extension://test/'+name,onMessage:{addListener:fn=>listener=fn}},permissions:{contains:async()=>granted},storage:{onChanged:{addListener:fn=>changes.push(fn)},local:{get:async()=>({translationConfig:config}),set:async data=>{const old=config;config=data.translationConfig;changes.forEach(fn=>fn({translationConfig:{oldValue:old,newValue:config}},'local'));}}}};
const ctx={chrome,crypto:require('node:crypto').webcrypto,URL,AbortController,TextDecoder,setTimeout,clearTimeout,fetch:async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify(payload),{status:200});}};
vm.runInNewContext(source,ctx);
const settings={id:'test',url:'chrome-extension://test/translation-options.html'};
const xPage={id:'test',tab:{id:1},frameId:0,url:'https://x.com/home'};
function send(message,sender=settings){return new Promise((resolve,reject)=>{const result=listener(message,sender,resolve);if(result!==true)reject(Error('rejected sender'));});}
const request=async text=>{const status=await send({type:'translation-status'},xPage);return send({type:'translate-bio',text,revision:status.revision},xPage);};
(async()=>{
 for(const [provider,body,suffix] of [
  ['custom',{choices:[{finish_reason:'stop',message:{content:'我制作实用工具。'}}]},'/v1/chat/completions'],
  ['anthropic',{stop_reason:'end_turn',content:[{type:'text',text:'我制作实用工具。'}]},'/v1/messages'],
  ['gemini',{candidates:[{finishReason:'STOP',content:{parts:[{thought:true,text:'hidden'},{text:'我制作实用工具。'}]}}]},'/v1beta/models/test-model:generateContent'],
  ['google',{sentences:[{trans:'我制作实用工具。'}]},'/translate_a/single']
 ]){
  const saved=await send({type:'translation-save',config:{provider,endpoint:'https://example.test',model:'test-model',apiKey:'fixture-key'}});assert.equal(saved.saved,true);payload=body;
  const result=await request('I build useful tools.');assert.equal(result.text,'我制作实用工具。');const call=calls.at(-1);assert.ok(new URL(call.url).pathname.endsWith(suffix));assert.equal(call.options.credentials,'omit');assert.equal(call.options.redirect,'error');
  if(provider==='google')assert.equal(config.apiKey,undefined);else{const posted=JSON.parse(call.options.body);assert.ok(JSON.stringify(posted).includes('I build useful tools.'));assert.ok(!JSON.stringify(posted).includes('fixture-key'));}
 }
 console.log('PASS all four online protocols, endpoint normalization, request credentials and response extraction');
 for(const endpoint of ['http://example.test','https://user:password@example.test','https://example.test/?key=secret','https://example.test/#x']){
  const result=await send({type:'translation-save',config:{provider:'custom',endpoint,model:'m',apiKey:''}});assert.ok(result.error);
 }
 granted=false;assert.ok((await send({type:'translation-save',config:{provider:'google'}})).error);granted=true;
 let replied=false;assert.equal(listener({type:'translation-config'},{id:'outsider',url:settings.url},()=>replied=true),undefined);assert.equal(replied,false);
 assert.equal(listener({type:'translation-config'},xPage,()=>replied=true),undefined);assert.equal(replied,false);
 console.log('PASS invalid URLs and ungranted origins rejected; X content cannot request saved keys');
 await send({type:'translation-save',config:{provider:'custom',endpoint:'https://example.test',model:'m',apiKey:'fixture-key'}});
 for(const [status,message] of [[401,'认证'],[429,'限流']]){ctx.fetch=async()=>new Response('{}',{status});assert.ok((await request('Hello')).error.includes(message));}
 ctx.fetch=async()=>new Response(JSON.stringify({choices:[{finish_reason:'length',message:{content:'cut off'}}]}));assert.ok((await request('Hello')).error);
 let active=0,maximum=0;ctx.fetch=async()=>{active++;maximum=Math.max(maximum,active);await new Promise(r=>setTimeout(r,15));active--;return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:'你好'}}]}));};
 const results=await Promise.all(Array.from({length:6},(_,i)=>request('Hello '+i)));assert.ok(results.every(r=>r.text==='你好'));assert.equal(maximum,2);
 const stale=(await send({type:'translation-status'},xPage)).revision;
 await send({type:'translation-save',config:{provider:'local'}});assert.equal(config.apiKey,undefined);
 assert.equal((await send({type:'translate-bio',text:'Hi',revision:stale},xPage)).code,'cancelled');
 console.log('PASS auth/rate/partial responses, concurrency cap, generation invalidation and clearing credentials');
 const listeners={},translationContext={Map,Set,Promise,Date,RegExp,Error,Event,chrome:{runtime:{sendMessage:async message=>message.type==='translation-status'?{provider:'custom',revision:'r1'}:{text:message.text.replace('I use','我使用')}},storage:{onChanged:{addListener:fn=>listeners.changed=fn}}},dispatchEvent:()=>{},addEventListener:()=>{}};translationContext.window=translationContext;
 vm.runInNewContext(fs.readFileSync(path.join(folder,'translation.js'),'utf8'),translationContext);
 await new Promise(r=>setTimeout(r,0));
 const original='I use OpenAI @alice https://example.com';translationContext.xpandmaxTranslations.request(original);
 await new Promise(r=>setTimeout(r,20));const entry=translationContext.xpandmaxTranslations.inspect(original);assert.equal(entry.state,'ready');assert.ok(entry.text.includes('OpenAI @alice https://example.com'));
 console.log('PASS translation restores names, handles and URLs exactly');
 for(const name of fs.readdirSync(folder).filter(name=>name.endsWith('.js')))new vm.Script(fs.readFileSync(path.join(folder,name),'utf8'),{filename:name});
 console.log('PASS all extension scripts parse');
})().catch(error=>{console.error(error);process.exitCode=1;});
