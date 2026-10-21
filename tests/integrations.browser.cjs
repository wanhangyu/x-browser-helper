const {launchExtension,openSettings}=require('./browser-helpers.cjs');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const folder=path.resolve(__dirname,'../extension'),C=require(path.join(folder,'core.js'));
(async()=>{
 const now=Date.now(),date=new Date(now-7200000).toUTCString(),quoteDate=new Date(now-3600000).toUTCString();
 const user=(name,following=false)=>({__typename:'User',rest_id:name==='alice'?'10':'11',core:{screen_name:name,name},relationship_counts:{followers:1000},profile_bio:{description:'Independent builder using OpenAI.'},relationship_perspectives:{following,blocking:false,blocked_by:false},follow_request_sent:false});
 const tweet=(id,name,views,created=date)=>({__typename:'Tweet',rest_id:id,core:{user_results:{result:user(name)}},views:{count:String(views),state:'EnabledWithCount'},legacy:{created_at:created,full_text:'Synthetic '+id,favorite_count:10,retweet_count:2,reply_count:1,bookmark_count:3}});
 const outer=tweet('101','alice',10000),inner=tweet('202','bob',30000,quoteDate),ad=tweet('303','aduser',50000);outer.quoted_status_result={result:inner};outer.legacy.quoted_status_id_str='202';
 let fixture={data:{outer,adEntry:{entryId:'promoted-303',content:{result:ad}}}};
 const extracted=C.extract(fixture,now);assert.equal(extracted.tweets.find(t=>t.id==='303').invalid,true);assert.equal(extracted.tweets.find(t=>t.id==='101').quotedId,'202');
 assert.equal(C.metrics({...extracted.tweets[0],at:now-31*60000},now),null);
 const hidden=tweet('404','hiddenuser',90000);hidden.views.state='Disabled';assert.equal(C.extract(hidden,now).tweets[0].invalid,true);
 assert.equal(C.metrics({views:10,created:now-3600000,at:now,likes:1,reposts:0,replies:0,bookmarks:null},now).score,null);
 const readable=user('links');readable.profile_bio.description='Docs https://t.co/example';readable.profile_bio.entities={description:{urls:[{url:'https://t.co/example',expanded_url:'https://www.example.com/docs'}]}};
 assert.equal(C.extract(readable,now).users[0].bio,'Docs example.com/docs');
 console.log('PASS ad ancestry, disabled view state, quote ID, metrics TTL and incomplete scores');
 const context=await launchExtension(folder,{width:1350,height:1000});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));let follows=0;
 const header=(name,id,created,linked=true)=>`<div data-testid="User-Name"><a href="/${name}">${name}</a>${linked?`<a href="/${name}/status/${id}">`:''}<time datetime="${new Date(created).toISOString()}">time</time>${linked?'</a>':''}</div>`;
 const html=`<!doctype html><meta charset="utf-8"><style>body{font:16px sans-serif}main{width:620px;margin:30px}article{padding:20px;border:1px solid #ddd}[data-testid="User-Name"]{display:flex;gap:8px}time{font-size:12px}[role=link]{border:1px solid #aaa;padding:12px}.why-bio{max-width:500px}</style><a data-testid="AppTabBar_Profile_Link" href="/myself">My profile</a><main>
 <article data-testid="tweet" id="outer">${header('alice','101',date)}<button data-testid="caret" aria-expanded="false">More</button><div data-testid="tweetText">Outer post</div><div role="link" id="quote">${header('bob','202',quoteDate,false)}<div data-testid="tweetText">Quoted post</div></div><a href="/alice/status/101/analytics">10000</a></article>
 <article data-testid="tweet" id="ad">${header('aduser','303',date)}<div data-testid="tweetText">Advertisement fixture</div><a href="/aduser/status/303/analytics">50000</a></article>
 </main><script>
 window.menuClicks=0;document.querySelector('[data-testid=caret]').onclick=event=>{const caret=event.currentTarget;if(caret.getAttribute('aria-expanded')==='true'){document.querySelector('[role=menu]')?.remove();caret.setAttribute('aria-expanded','false');return;}window.menuClicks++;caret.setAttribute('aria-expanded','true');const menu=document.createElement('div');menu.setAttribute('role','menu');const follow=document.createElement('button');follow.setAttribute('role','menuitem');follow.textContent='Follow @'+(window.menuTarget||'alice');follow.onclick=async()=>{await fetch('/i/api/1.1/friendships/create.json',{method:'POST'});menu.remove();caret.setAttribute('aria-expanded','false');};menu.append(follow);document.body.append(menu);};setTimeout(()=>fetch('/i/api/graphql/test/HomeTimeline'),300);
 </script>`;
 await context.route('https://x.com/**',route=>{const url=route.request().url();if(url.includes('friendships/create')){follows++;return route.fulfill({contentType:'application/json',body:JSON.stringify({screen_name:'alice',followers_count:1000,following:true,follow_request_sent:false})});}if(url.includes('/graphql/'))return route.fulfill({contentType:'application/json',body:JSON.stringify(fixture)});return route.fulfill({contentType:'text/html',body:html,headers:{'Content-Security-Policy':"require-trusted-types-for 'script'; trusted-types 'none'"}});});
 try{
  await page.goto('https://x.com/home');
  await page.locator('#why-x-helper').waitFor({state:'attached'});await page.waitForTimeout(700);
  assert.equal(await page.locator('.why-bio').count(),0,'extra bios and follow buttons default to off');
  if(!await page.locator('#panel').isVisible())await page.locator('#dockTab').click();
  await openSettings(page);await page.locator('#profileRows').check();
  await page.locator('[data-tab="heat"]').click();
await page.locator('#outer > [data-testid="User-Name"] .why-heat').waitFor();
  await page.locator('#quote .why-heat').waitFor();assert.equal(await page.locator('#quote .why-heat').getAttribute('data-tweet-id'),'202');assert.equal(await page.locator('#outer > [data-testid="User-Name"] .why-heat').getAttribute('data-tweet-id'),'101');assert.equal(await page.locator('#ad .why-heat').count(),0);
  console.log('PASS installed extension separates outer and linkless quoted metrics; ad metrics excluded despite DOM fallback');
  const follow=page.locator('#outer > .why-bio [data-role=follow]');await follow.waitFor();assert.equal(await page.locator('#quote [data-role=follow]:visible').count(),0);
  await follow.evaluate(button=>button.click());await page.waitForTimeout(300);assert.equal(follows,0);assert.equal(await page.evaluate(()=>window.menuClicks),0);
  await page.evaluate(()=>document.querySelector('[data-testid=AppTabBar_Profile_Link]').href='/alice');await page.waitForTimeout(450);assert.equal(await follow.isVisible(),false);
  await page.evaluate(()=>document.querySelector('[data-testid=AppTabBar_Profile_Link]').href='/myself');await follow.waitFor();
  await page.evaluate(()=>{window.menuTarget='bob';});await follow.click();await page.waitForFunction(()=>document.querySelector('#outer > .why-bio [data-role=follow]')?.textContent==='重试关注');assert.equal(follows,0);
  assert.equal(await page.locator('[role=menu]').count(),0);await page.evaluate(()=>{window.menuTarget='alice';});
  console.log('PASS own account hidden, wrong menu target rejected, owned menu cleaned up');
  await follow.click();await page.waitForFunction(()=>document.querySelector('#outer > .why-bio [data-role=follow]')?.textContent==='已关注');assert.equal(follows,1);assert.equal(await follow.isDisabled(),true);
  console.log('PASS trusted click only, native menu target, observed success and duplicate prevention');
  await page.evaluate(()=>document.querySelector('#quote time').dateTime=new Date().toISOString());await page.waitForTimeout(700);assert.equal(await page.locator('#quote .why-heat').count(),0);
  console.log('PASS mismatched quote timestamp removes badge');
  await page.evaluate(()=>{const header=document.querySelector('#outer > [data-testid="User-Name"]');header.querySelector('a').href='/differentauthor';});await page.waitForTimeout(700);assert.equal(await page.locator('#outer > [data-testid="User-Name"] .why-heat').count(),0);
  console.log('PASS recycled author does not inherit previous tweet metrics');
  await page.goto('https://x.com/alice/status/101');await page.locator('#outer > [data-testid="User-Name"] .why-heat').waitFor();
  await page.locator('#quote .why-heat').waitFor();
  await page.evaluate(()=>window.postMessage({type:'WHY_X_HELPER_DATA_V1',data:{users:[],tweets:[{id:'101',handle:'alice',created:Date.now()-7200000,views:10000,likes:10,reposts:2,replies:1,bookmarks:3,at:Date.now()-31*60000}]}},location.origin));
  await page.waitForFunction(()=>document.querySelector('#outer > [data-testid="User-Name"] .why-heat')?.textContent==='待加载');
  await page.locator('#outer > [data-testid="User-Name"] .why-heat').hover();assert.equal(await page.locator('#metricsTip[data-open="true"]').count(),0);
  await page.evaluate(()=>fetch('/i/api/graphql/test/HomeTimeline'));await page.waitForFunction(()=>document.querySelector('#outer > [data-testid="User-Name"] .why-heat')?.textContent.includes('/h'));
  console.log('PASS expired data is not rescued from DOM or shown in metrics tooltip; fresh response restores it');
  const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker'),id=new URL(worker.url()).host;
  const options=await context.newPage();await options.goto(`chrome-extension://${id}/translation-options.html`);await options.locator('#settings').waitFor({state:'visible'});await options.locator('#save').click();await options.waitForFunction(()=>document.querySelector('#status').textContent.includes('已保存'));assert.equal(await options.locator('#provider').inputValue(),'local');
  console.log('PASS settings page actually loads and saves through service worker');
  assert.equal(await options.locator('#remember-key').isChecked(),false);
  await options.locator('#provider').selectOption('custom');await options.locator('#endpoint').fill('https://fixture.example');await options.locator('#model').fill('fixture-model');await options.locator('#api-key').fill('fixture-session-key');
  assert.ok((await options.locator('#permission-preview').textContent()).includes('https://fixture.example'));
  // Only this isolated options page fakes permission grants; no real service or credentials are used.
  await options.evaluate(()=>{chrome.permissions.request=async()=>true;chrome.permissions.getAll=async()=>({origins:['https://fixture.example/*']});chrome.permissions.remove=async()=>true;});
  await options.addInitScript(()=>{chrome.permissions.request=async()=>true;chrome.permissions.getAll=async()=>({origins:['https://fixture.example/*']});chrome.permissions.remove=async()=>true;});
  await worker.evaluate(()=>{chrome.permissions.contains=async()=>true;});
  await options.locator('#save').click();await options.waitForFunction(()=>document.querySelector('#status').textContent.includes('已保存'));
  let keyState=await worker.evaluate(async()=>({local:(await chrome.storage.local.get('translationConfig')).translationConfig,session:(await chrome.storage.session.get('translationKey')).translationKey}));
  assert.equal(keyState.local.apiKey,undefined);assert.equal(keyState.session.value,'fixture-session-key');
  await options.reload();await options.waitForFunction(()=>!document.querySelector('#settings').disabled);assert.equal(await options.locator('#api-key').inputValue(),'fixture-session-key');
  await worker.evaluate(()=>chrome.storage.session.clear());await options.reload();await options.waitForFunction(()=>document.querySelector('#status').textContent.includes('Key 已清除'));assert.equal(await options.locator('#api-key').inputValue(),'');
  await options.locator('#api-key').fill('fixture-remembered-key');await options.locator('#remember-key').check();await options.locator('#save').click();await options.waitForFunction(()=>document.querySelector('#status').textContent.includes('已保存'));
  assert.equal(await worker.evaluate(async()=>(await chrome.storage.local.get('translationConfig')).translationConfig.apiKey),'fixture-remembered-key');
  await options.getByRole('button',{name:'撤销 https://fixture.example/*',exact:true}).click();await options.waitForFunction(()=>document.querySelector('#status').textContent.includes('已撤销'));
  assert.equal(await options.locator('#provider').inputValue(),'local');assert.equal(await options.locator('#api-key').inputValue(),'');
  assert.equal(await worker.evaluate(async()=>(await chrome.storage.local.get('translationConfig')).translationConfig.apiKey),undefined);
  console.log('PASS settings UI: domain preview, session-only keys, session expiry, explicit remember and revoke/clear');
  // Only this disposable test worker uses controlled permissions and fake online replies.
  await worker.evaluate(()=>{
   self.testOriginalFetch=self.fetch;chrome.permissions.contains=async()=>true;
   self.fetch=async(url,options)=>{
    if(new URL(url).hostname!=='translate.googleapis.com')return self.testOriginalFetch(url,options);
    const text=new URL(url).searchParams.get('q');
    return new Response(JSON.stringify({sentences:[{trans:text.replace('Independent builder using','独立开发者，使用')}]}),{headers:{'Content-Type':'application/json'}});
   };
  });
  await options.evaluate(()=>{chrome.permissions.request=async()=>true;});
  await options.locator('#provider').selectOption('google');await options.locator('#save').click();await options.waitForFunction(()=>document.querySelector('#status').textContent.includes('已保存'));
  await page.waitForFunction(()=>document.querySelector('#outer > .why-bio summary>span')?.textContent.includes('独立开发者'));
  assert.ok((await page.locator('#outer > .why-bio summary>span').textContent()).includes('OpenAI'));
  await page.locator('#outer > .why-bio summary>span').click();await page.locator('#outer > .why-bio [data-role=translate]').click();assert.ok((await page.locator('#outer > .why-bio .why-bio-full').textContent()).includes('Independent builder'));
  await page.locator('#outer > .why-bio [data-role=translate]').click();assert.ok((await page.locator('#outer > .why-bio .why-bio-full').textContent()).includes('独立开发者'));
  console.log('PASS controlled online provider UI: auto translation, brand preservation and original/translation switching');
  await options.locator('#provider').selectOption('local');await options.locator('#save').click();await options.waitForFunction(()=>document.querySelector('#status').textContent.includes('已保存'));
  await page.waitForFunction(()=>document.querySelector('#outer > .why-bio .why-bio-full')?.textContent.includes('Independent builder'));
  console.log('PASS provider change clears old online translation in open X tabs');
  await page.locator('#quote .why-heat').waitFor();await page.locator('#outer > .why-bio').waitFor();assert.equal(await page.locator('#ad .why-heat').count(),0);
  await page.screenshot({path:path.resolve(__dirname,'../artifacts/screenshots/integrations.png'),fullPage:true});
  assert.deepEqual(errors,[]);
 }finally{await context.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
