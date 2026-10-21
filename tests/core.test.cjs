const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');
const folder=path.resolve(__dirname,'../extension');
const C=require(path.join(folder,'core.js'));
let checks=0;
function test(name,fn){fn();checks++;console.log('PASS',name);}
const now=Date.UTC(2026,9,13,12);
function response(){return{data:{timeline:{entries:[{content:{itemContent:{tweet_results:{result:{__typename:'Tweet',rest_id:'123456',views:{count:'10000'},legacy:{created_at:new Date(now-2*3600000).toUTCString(),full_text:'测试主帖',favorite_count:200,retweet_count:50,reply_count:20,bookmark_count:30},core:{user_results:{result:{__typename:'User',rest_id:'42',core:{screen_name:'SampleMaker',name:'示例作者'},legacy:{followers_count:1200,friends_count:99}}}},quoted_status_result:{result:{__typename:'Tweet',rest_id:'98765',views:{count:'500'},legacy:{created_at:new Date(now-3600000).toUTCString(),full_text:'引用帖子'},core:{user_results:{result:{__typename:'User',rest_id:'43',legacy:{screen_name:'OtherUser',name:'其他账号',followers_count:77}}}}}}}}}}}]}}};}
test('Chinese and abbreviated counts; unknown is not zero',()=>{assert.equal(C.number('2.6万'),26000);assert.equal(C.number('12.5K'),12500);assert.equal(C.number('1,200'),1200);assert.equal(C.number(null),null);assert.equal(C.number('未知'),null);assert.equal(C.number('0'),0);});
test('Extract nested tweets, quote and new User core format',()=>{const r=C.extract(response(),now);assert.equal(r.tweets.length,2);assert.equal(r.users.length,2);const t=r.tweets.find(t=>t.id==='123456');assert.equal(t.handle,'samplemaker');assert.equal(t.views,10000);assert.equal(r.users.find(u=>u.handle==='samplemaker').followers,1200);});
test('Average rate and engagement use real elapsed time',()=>{const t=C.extract(response(),now).tweets.find(t=>t.id==='123456');const m=C.metrics(t,now);assert.equal(m.rate,5000);assert.equal(m.engagement,.03);assert.equal(m.score,29);});
test('Missing metrics, future timestamp, and very new posts are not ranked',()=>{assert.equal(C.metrics({created:now,views:null},now),null);assert.equal(C.metrics({created:now+1000,views:100},now),null);assert.equal(C.metrics({created:now-1000,views:100},now).rate,null);});
test('Incomplete interaction counts are unknown, not zero engagement',()=>{assert.equal(C.metrics({created:now-3600000,views:1000,likes:null,reposts:0,replies:0},now).engagement,null);assert.equal(C.metrics({created:now-3600000,views:1000,likes:0,reposts:0,replies:0,bookmarks:0},now).engagement,0);});
test('Sliding date crosses month and year boundaries',()=>{assert.equal(C.query({query:'AI',days:7,likes:20,from:'@Alice',lang:'zh',follows:true,original:true},new Date(2026,0,3)), 'AI since:2025-12-27 min_faves:20 lang:zh from:alice filter:follows -filter:retweets -filter:replies');});
test('Zero search filters remain unrestricted; invalid author is excluded',()=>{assert.equal(C.query({query:'github',days:0,likes:0,from:'bad/user'}),'github');});
test('Bounded traversal handles cycles and unknown response shapes',()=>{const v={};v.self=v;assert.deepEqual(C.extract(v),{users:[],tweets:[]});});
test('Manifest only accesses X and local storage; referenced files exist',()=>{const m=JSON.parse(fs.readFileSync(path.join(folder,'manifest.json')));assert.deepEqual(m.permissions,['storage','activeTab']);assert.equal(m.host_permissions,undefined);for(const cs of m.content_scripts){assert(cs.matches.every(s=>/^https:\/\/(x\.com|twitter\.com|pro\.x\.com)\/\*$/.test(s)));for(const f of cs.js)assert(fs.existsSync(path.join(folder,f)));}for(const f of Object.values(m.icons))assert(fs.existsSync(path.join(folder,f)));});
test('All extension JavaScript parses',()=>{for(const f of ['core.js','dom.js','hook.js','content.js','content.bundle.js','popup.js'])new vm.Script(fs.readFileSync(path.join(folder,f),'utf8'),{filename:f});});
(async()=>{
 const emitted=[],handlers={};
 class Request{constructor(url){this.url=url;}}
 class XHR{open(){}send(){}addEventListener(){}}
 const original=async()=>({ok:true,headers:{get:()=> 'application/json'},clone:()=>({json:async()=>response()})});
 const context={WHYCore:C,location:{origin:'https://x.com',href:'https://x.com/home'},Request,XMLHttpRequest:XHR,URL,console,fetch:original,postMessage:(m)=>emitted.push(m),addEventListener:(k,f)=>handlers[k]=f};
 context.window=context;vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(folder,'hook.js'),'utf8'),context);
 const r=await context.fetch('https://x.com/i/api/graphql/abc/HomeTimeline');assert.equal(r.ok,true);await new Promise(r=>setTimeout(r,10));assert.equal(emitted.length,1);assert.equal(emitted[0].data.tweets.length,2);
 const before=emitted.length;await context.fetch('https://example.com/foo');await new Promise(r=>setTimeout(r,10));assert.equal(emitted.length,before);
 handlers.message({source:vm.runInContext('window',context),origin:'https://x.com',data:{type:'WHY_X_HELPER_READY_V1'}});assert.equal(emitted.length,before+1);
 console.log('PASS actual fetch hook capture, replay, unrelated-host exclusion');
 console.log(`${checks+1} checks passed`);
})().catch(e=>{console.error(e);process.exitCode=1;});
