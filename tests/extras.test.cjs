const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const folder=path.resolve(__dirname,'../extension'),E=require(path.join(folder,'extras-core.js'));
const builtin=JSON.parse(fs.readFileSync(path.join(folder,'filter-rules.json'),'utf8'));
const valid=E.validateRules(builtin),rules=E.compile(valid,'light');
assert.ok(valid.rules.length>10);assert.ok(rules.length);assert.ok(E.match({content:'电报 t.me/example 加群领取福利视频'},rules));assert.equal(E.match({content:'这是一篇讨论开源代码的文章'},rules),null);
const custom=E.customRules('正文:抽奖引流\n作者:@spammer\n昵称:推广号\n# 注释\n链接:spam.example');
assert.equal(E.match({content:'今天有抽奖引流'},custom),'custom-0');assert.equal(E.match({handle:'SPAMMER'},custom),'custom-1');assert.equal(E.match({handle:'notspammer'},custom),null);
assert.equal(E.safePattern('(a+)+$'),false);assert.equal(E.safePattern('(?=a)'),false);assert.equal(E.safePattern('(a)\\1'),false);
assert.throws(()=>E.validateRules({rules:[{id:'bad',field:'content',type:'regex',value:'(a+)+$'}]}));
const md=E.markdown({id:'123',handle:'sample',name:'[Demo]',text:'Read https://t.co/a',created:0,urls:[{url:'https://t.co/a',expanded_url:'https://example.com/hello'}],media:[{type:'photo',url:'https://pbs.twimg.com/media/a.jpg',alt:'diagram'},{type:'photo',url:'javascript:alert(1)'}]});
assert.match(md,/https:\/\/example.com\/hello/);assert.match(md,/!\[diagram\]/);assert.match(md,/https:\/\/x.com\/sample\/status\/123/);assert.ok(!md.includes('javascript:'));assert.ok(!E.markdown({id:'123',handle:'bad/handle',text:'ok'}).includes('https://x.com'));
assert.doesNotThrow(()=>E.markdown({text:'test',urls:{bad:true},media:[null]}));
const copyPost={id:'123',handle:'sample',text:'Hello https://t.co/a',urls:[{url:'https://t.co/a',expanded_url:'https://example.com'}],media:[{type:'photo',url:'https://pbs.twimg.com/media/a.jpg'}]};
assert.equal(E.copyOutput(copyPost,{format:'plain',images:true}),'Hello https://example.com/');assert.ok(!E.copyOutput(copyPost,{format:'markdown',images:false}).includes('!['));assert.ok(E.copyOutput(copyPost,{format:'markdown',images:false}).includes('https://x.com/sample/status/123'));
assert.equal(E.describeRule('spam-phishing-airdrop-high',rules).label,'疑似钓鱼或空投引流');assert.equal(E.describeRule('adult-sex-service-high',rules).label,'疑似成人内容');assert.equal(E.describeRule('custom-0',custom).label,'命中自定义关键词');assert.ok(E.describeRule('custom-0',custom).detail.includes('抽奖引流'));assert.equal(E.describeRule('new-remote-id',[]).label,'命中反垃圾规则');
const C=require(path.join(folder,'core.js')),tweet=C.extract({rest_id:'1',__typename:'Tweet',legacy:{created_at:new Date().toUTCString(),full_text:'a'.repeat(100010),bookmark_count:0,entities:{urls:[{url:'https://t.co/a',expanded_url:'https://example.com'}]},extended_entities:{media:[{type:'photo',media_url_https:'https://pbs.twimg.com/media/a.jpg',ext_alt_text:'diagram'}]}},core:{user_results:{result:{rest_id:'2',legacy:{screen_name:'sample',name:'Sample'}}}}}).tweets[0];
assert.equal(tweet.text.length,100000);assert.equal(tweet.truncated,true);assert.equal(tweet.bookmarks,0);assert.equal(tweet.urls[0].expanded_url,'https://example.com');assert.equal(tweet.media[0].alt,'diagram');
// Validate privileged remote updater with synthetic data and a permitted sender.
let listener,store={whyExtras:{remoteRules:true}},fetches=0,body=JSON.stringify(builtin);
const context={WHYExtrasCore:E,AbortSignal,TextDecoder,console,URL,chrome:{runtime:{id:'test',getURL:p=>'chrome-extension://test/'+p,onMessage:{addListener:f=>listener=f}},storage:{local:{get:async()=>store,set:async x=>Object.assign(store,x)}},permissions:{contains:async()=>true},tabs:{create:async()=>{}}},fetch:async()=>{fetches++;return new Response(body,{status:200});}};
vm.runInNewContext(fs.readFileSync(path.join(folder,'rules-background.js'),'utf8'),context);
function request(message,sender={id:'test',url:'chrome-extension://test/rules-options.html'}){return new Promise(resolve=>{const ret=listener(message,sender,resolve);if(!ret)resolve(null);});}
(async()=>{
 assert.equal(await request({type:'rules-update'},{id:'other',url:'https://example.com'}),null);
 const first=await request({type:'rules-update',force:true});assert.equal(first.updated,true);assert.ok(store.whyRemoteRules.at);
 await request({type:'rules-update'},{id:'test',url:'https://x.com/home',frameId:0,tab:{id:1}});assert.equal(fetches,1,'daily cache');
 const old=store.whyRemoteRules;body='{"rules":[]}';const bad=await request({type:'rules-update',force:true});assert.ok(bad.error);assert.equal(store.whyRemoteRules,old,'invalid update retains last known good rules');
 store.whyExtras.remoteRules=false;const disabled=await request({type:'rules-update',force:true});assert.ok(disabled.error);assert.equal(fetches,2);
 console.log('PASS rules, custom matching, unsafe regex rejection, Markdown provenance, remote sender validation, daily cache, rollback and off switch');
})().catch(e=>{console.error(e);process.exitCode=1;});

const manifest=JSON.parse(fs.readFileSync(path.join(folder,'manifest.json'),'utf8'));assert.ok(!JSON.stringify(manifest).includes('starchart'));for(const f of ['starchart.js','starchart.css','third-party/thank-you-star-chart-LICENSE.txt'])assert.equal(fs.existsSync(path.join(folder,f)),false);assert.ok(!fs.readFileSync(path.join(folder,'hook.js'),'utf8').includes('setRequestHeader'));console.log('PASS star-chart resources and request-header capture removed');
