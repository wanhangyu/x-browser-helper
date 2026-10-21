const {launchExtension}=require('./browser-helpers.cjs');
const fs=require('node:fs'),path=require('node:path');
(async()=>{
 const folder=path.resolve('extension');
 const browser=await launchExtension(folder,{width:1500,height:1000});
 const page=await browser.newPage(),errors=[],auditFailures=[];
 async function audit(name,fn){try{await fn();console.log('AUDIT PASS:',name);}catch(e){auditFailures.push(name+': '+e.message);console.log('AUDIT FAIL:',name,e.message);}}
 page.on('pageerror',error=>{errors.push(error.message);console.log('PAGE ERROR:',error.message);});
 page.on('console',msg=>{if(msg.type()==='error')console.log('CONSOLE:',msg.text());});
 const now=Date.now();
 const fixture={data:{result:{__typename:'Tweet',rest_id:'123456',views:{count:'10000'},legacy:{created_at:new Date(now-7200000).toUTCString(),full_text:'真实扩展加载测试',favorite_count:100,retweet_count:20,reply_count:10,bookmark_count:10},core:{user_results:{result:{__typename:'User',rest_id:'42',legacy:{screen_name:'samplemaker',name:'示例作者',followers_count:1200}}}}}}};
 let html=fs.readFileSync('tests/fixtures/timeline.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
 html+=`<script>document.querySelectorAll('time').forEach((e,i)=>{const h=[2,1,12][i];e.dateTime=new Date(Date.now()-h*3600000).toISOString();e.textContent=h+'小时前';});setTimeout(()=>fetch('/i/api/graphql/test/HomeTimeline'),400);</script>`;
 await browser.route('https://x.com/**',route=>{
  if(route.request().url().includes('/graphql/'))return route.fulfill({contentType:'application/json',body:JSON.stringify(fixture)});
  return route.fulfill({contentType:'text/html',headers:{'Content-Security-Policy':"require-trusted-types-for 'script'; trusted-types 'none'"},body:html});
 });
 try{
  await page.goto('https://x.com/home');
  await page.waitForSelector('#why-x-helper',{timeout:8000,state:'attached'});
  if(await page.locator('#panel').isHidden())await page.locator('#dockTab').click();
  await page.waitForTimeout(600);
  await page.locator('#resetLayout').click();
  await page.evaluate(()=>{
   const row=document.createElement('div');row.dataset.testid='UserCell';row.id='recommendFixture';row.style.cssText='display:flex;gap:12px;width:600px;padding:16px;background:white';
   const avatar=document.createElement('a');avatar.href='https://x.com/samplemaker';const image=document.createElement('img');image.width=48;image.height=48;avatar.append(image);const info=document.createElement('div');const name=document.createElement('span');name.dir='auto';name.textContent='示例作者';name.id='plainName';const bio=document.createElement('p');bio.textContent='这是一个名字没有链接的推荐账号卡片';info.append(name,bio);row.append(avatar,info);document.querySelector('main').prepend(row);
  });
  await page.waitForTimeout(400);
  if(!await page.locator('#plainName .why-follower').count())throw new Error('Recommendation card name positioning failed');
  await page.evaluate(()=>{
   const row=document.createElement('div');row.dataset.testid='UserCell';row.id='followingFixture';row.style.cssText='display:flex;gap:12px;width:600px;padding:16px;background:white';
   const avatar=document.createElement('a');avatar.href='https://x.com/samplemaker';const image=document.createElement('img');image.width=48;image.height=48;image.alt='头像';avatar.append(image);
   const info=document.createElement('div');info.style.flex='1';const link=document.createElement('a');link.href='https://x.com/samplemaker';link.className='nameLink';link.style.cssText='display:flex;flex-direction:column;align-items:flex-start';const name=document.createElement('span');name.dir='auto';name.textContent='示例作者';link.append(name);const bio=document.createElement('div');bio.textContent='@samplemaker · 独立开发者';info.append(link,bio);row.append(avatar,info);document.querySelector('main').prepend(row);
  });
  await page.waitForTimeout(400);
  const followerLayout=await page.evaluate(()=>{const row=document.querySelector('#followingFixture'),badge=row.querySelector('.why-follower');return{insideName:!!row.querySelector('.nameLink .why-follower'),sameRow:Math.abs(badge.getBoundingClientRect().top+badge.getBoundingClientRect().height/2-(row.querySelector('.nameLink [dir]').getBoundingClientRect().top+row.querySelector('.nameLink [dir]').getBoundingClientRect().height/2))<2,badgeWidth:badge?.getBoundingClientRect().width,rowWidth:row.getBoundingClientRect().width};});
  if(!followerLayout.insideName||!followerLayout.sameRow||followerLayout.badgeWidth>160)throw new Error('Follower badge must stay beside the name');
  console.log('FOLLOWING LAYOUT:',followerLayout);
  await audit('Nested user-name keeps one badge on the name row',async()=>{
   await page.evaluate(()=>{const row=document.querySelector('#followingFixture');const info=row.querySelector('.nameLink').parentElement;info.dataset.testid='User-Name';info.style.cssText='display:flex;flex-direction:column;align-items:flex-start';});await page.waitForTimeout(650);
   const ok=await page.evaluate(()=>{const row=document.querySelector('#followingFixture'),b=row.querySelector('.why-follower'),n=row.querySelector('.nameLink [dir]');return row.querySelectorAll('.why-follower').length===1&&Math.abs(b.getBoundingClientRect().top+b.offsetHeight/2-n.getBoundingClientRect().top-n.offsetHeight/2)<2;});if(!ok)throw Error('badge moved to vertical name/handle wrapper');
  });
  await audit('DOM-only view count refreshes after X changes text',async()=>{
   await page.evaluate(()=>{document.querySelector('a[href$="234567/analytics"]').firstChild.data='8.4万';});await page.waitForTimeout(650);
   if(!(await page.locator('article').nth(1).locator('.why-heat').innerText()).includes('8.4万'))throw Error('heat count stayed at the first snapshot');
  });
  await audit('Continuous page updates do not starve scanning',async()=>{
   await page.evaluate(()=>{const noise=document.createElement('div');noise.id='auditNoise';document.body.append(noise);document.querySelector('a[href$="234567/analytics"]').textContent='9.4万';window.auditNoiseTimer=setInterval(()=>{noise.textContent=String(Date.now());},30);});await page.waitForTimeout(850);
   const current=await page.locator('article').nth(1).locator('.why-heat').innerText();const rank=await page.locator('[data-jump="234567"] .rank-rate').innerText();await page.evaluate(()=>{clearInterval(window.auditNoiseTimer);document.querySelector('#auditNoise').remove();});if(!current.includes('9.4万')||!rank.includes('9.4万'))throw Error('continuous mutations deferred all scans');
  });
  await page.evaluate(()=>{document.querySelector('a[href$="234567/analytics"]').textContent='4.2万';});await page.waitForTimeout(300);


  await audit('Automatic ranking refresh preserves keyboard focus',async()=>{
   await page.locator('[data-jump="234567"]').focus();await page.evaluate(()=>{document.querySelector('a[href$="234567/analytics"]').textContent='4.3万';});await page.waitForTimeout(650);
   if(!await page.locator('[data-jump="234567"]').evaluate(e=>e.getRootNode().activeElement===e))throw Error('ranking refresh dropped button focus');
  });
  await audit('Disabling follower badges restores native name layout',async()=>{
   await page.locator('button[data-tab="accounts"]').click();await page.locator('#followerToggle').uncheck();await page.waitForTimeout(350);if(await page.locator('.why-follower').count()||await page.locator('.why-follower-row').count())throw Error('follower decoration remained after disabling');await page.locator('#followerToggle').check();await page.waitForTimeout(350);await page.locator('button[data-tab="heat"]').click();
  });

  await audit('Repeated scans of 200 account cards do not create duplicate badges',async()=>{
   await page.evaluate(()=>{const group=document.createElement('div');group.id='auditCards';for(let i=0;i<200;i++){const card=document.querySelector('#followingFixture').cloneNode(true);card.removeAttribute('id');group.append(card);}document.querySelector('main').append(group);});
   await page.waitForFunction(()=>document.querySelectorAll('#auditCards .why-follower').length===200,{},{timeout:5000});
   for(let i=0;i<4;i++){await page.evaluate(()=>document.querySelector('#auditCards').append(document.createTextNode(' ')));await page.waitForTimeout(220);}
   if(await page.locator('#auditCards .why-follower').count()!==200)throw Error('repeated scanning duplicated badges');
   await page.evaluate(()=>document.querySelector('#auditCards').remove());
  });
  await page.locator('#fold').click();if(await page.locator('#panel').isVisible())throw Error('Minus must collapse to edge');await page.locator('#dockTab').click();
  const panelBefore=await page.locator('#panel').boundingBox(),grip=await page.locator('#resize').boundingBox();
  await page.mouse.move(grip.x+10,grip.y+10);await page.mouse.down();await page.mouse.move(grip.x-65,grip.y-95,{steps:8});await page.mouse.up();
  const panelAfter=await page.locator('#panel').boundingBox();if(panelAfter.width>=panelBefore.width||panelAfter.height>=panelBefore.height)throw new Error('Panel did not resize');
  await page.locator('#resetLayout').click();
  await page.locator('#themeChoice').selectOption('dark');
  await page.waitForTimeout(250);await page.reload();await page.waitForSelector('#why-x-helper',{state:'attached'});await page.waitForTimeout(500);
  if(await page.locator('#why-x-helper').getAttribute('data-theme')!=='dark')throw new Error('Theme did not persist on reload');
  await page.locator('#themeChoice').selectOption('light');
  await page.locator('#openHeatOptions').click();await page.locator('#maxAge').selectOption('6');await page.waitForTimeout(350);
  const aged=await page.locator('article.why-hidden').count();if(aged!==1)throw new Error('Publication age filtering failed: '+aged);
  await page.locator('#heatPreset').selectOption('all');await page.waitForTimeout(350);
  if(await page.locator('article.why-hidden').count())throw new Error('All-posts preset did not restore posts');
  await page.locator('button[data-tab="search"]').click();await page.locator('#editor summary').click();
  await page.locator('#searchName').fill('常用测试搜索');await page.locator('#searchGroup').fill('开发工具');await page.locator('#searchQuery').fill('fframes OR remotion');await page.locator('#saveSearch').click();
  const testCard=page.locator('#why-x-helper .card').filter({hasText:'常用测试搜索'});await testCard.locator('[data-pin]').click();
  await page.locator('#groupFilter').selectOption('开发工具');if(await page.locator('#why-x-helper .card').count()!==1)throw new Error('Search grouping failed');
  if(!(await page.locator('#why-x-helper .card').innerText()).includes('★ 置顶'))throw new Error('Pinning failed');
  await page.reload();await page.waitForSelector('#why-x-helper',{state:'attached'});await page.waitForTimeout(350);await page.locator('button[data-tab="search"]').click();
  if(await page.locator('#groupFilter').inputValue()!=='开发工具')throw new Error('Search group filter did not persist');
  if(!(await page.locator('#why-x-helper .card').innerText()).includes('★ 置顶'))throw new Error('Pinned search did not persist');
  await page.locator('#why-x-helper .card [data-delete]').click();await page.locator('#groupFilter').selectOption('全部');await page.locator('button[data-tab="heat"]').click();
  console.log('NEW FEATURES: recommendation placement, fixed theme, age filtering, presets, grouping and pin persistence passed');
  await audit('Deleting final item in active search group restores the list',async()=>{
   await page.locator('button[data-tab="search"]').click();await page.locator('#editor summary').click();await page.locator('#searchName').fill('分组边界测试');if(await page.locator('#searchGroup').getAttribute('maxlength')!=='30')throw Error('group input lost length limit');await page.locator('#searchGroup').fill('临时检查');await page.locator('#searchQuery').fill('test');await page.locator('#saveSearch').click();await page.locator('#groupFilter').selectOption('临时检查');await page.locator('#why-x-helper .card [data-delete]').click();
   if(await page.locator('#groupFilter').inputValue()!=='全部'||await page.locator('#why-x-helper .card').count()===0)throw Error('deleted group leaves an empty invalid filter');
   await page.locator('#groupFilter').selectOption('全部');
  });
  // Restore the group after collecting a failed regression on the old version.
  await page.locator('#groupFilter').selectOption('全部');
  await audit('Pinning while editing preserves unsaved search draft',async()=>{
   const card=page.locator('#why-x-helper .card').first();await card.locator('[data-edit]').click();await page.locator('#searchName').fill('未保存的改稿');await page.locator('#searchQuery').fill('draft-value');await card.locator('[data-pin]').click();if(await page.locator('#searchName').inputValue()!=='未保存的改稿'||await page.locator('#searchQuery').inputValue()!=='draft-value')throw Error('draft cleared but editing target still retained');
  });
  await page.locator('button[data-tab="heat"]').click();
  await audit('Manual filter changes clear the preset label',async()=>{await page.locator('#openHeatOptions').click();await page.locator('#heatPreset').selectOption('following');await page.locator('#heatOptions').evaluate(e=>e.open=true);await page.locator('#resetFilter').click();if(await page.locator('#heatPreset').inputValue()!=='custom')throw Error('preset still says following after disabling filtering');await page.locator('#heatPreset').selectOption('all');});

  console.log('LAYOUT INTERACTIONS: minus-to-edge, tab-to-expand, resize and persistence passed');
  await page.locator('#resetLayout').click();
  console.log('REAL EXTENSION:',await page.evaluate(()=>{const s=document.querySelector('#why-x-helper')?.shadowRoot;return{panel:!!s&&!s.querySelector('#panel').hidden,followers:[...document.querySelectorAll('.why-follower')].map(x=>x.textContent),heat:[...document.querySelectorAll('.why-heat')].map(x=>x.textContent)};}));
  await page.screenshot({path:'artifacts/screenshots/browser.png'});

  async function makeDetail(title='示例作者的一棵树'){
   await page.evaluate(title=>{
    history.replaceState({},'', '/samplemaker/status/123456');
    const main=document.querySelector('main');main.style.width='720px';
    const article=document.querySelector('article'),old=article.querySelector('[data-testid="User-Name"]'),timeLink=old.querySelector('a[href*="/status/"]');
    old.remove();const header=document.createElement('div');header.id='detailHeader';header.style.cssText='display:flex;align-items:flex-start;gap:12px;width:100%';
    const avatar=document.createElement('div');avatar.textContent='🌳';avatar.style.cssText='width:48px;height:48px;flex-shrink:0;border-radius:50%;background:#e0f0db;display:grid;place-items:center;font-size:25px';
    const names=document.createElement('div');names.dataset.testid='User-Name';names.style.cssText='display:flex;flex-direction:column;align-items:flex-start;flex:1;min-width:0;gap:3px';
    const link=document.createElement('a');link.href='https://x.com/samplemaker';link.id='detailNameLink';link.style.cssText='display:flex;flex-direction:column;max-width:100%';
    const name=document.createElement('span');name.dir='auto';name.id='detailName';name.textContent=title;const verified=document.createElement('span');verified.textContent='✓';verified.style.cssText='color:#1d9bf0;font-size:16px';link.append(name,verified);
    const handle=document.createElement('a');handle.id='detailHandle';handle.href='https://x.com/samplemaker';handle.textContent='@samplemaker';handle.style.cssText='color:#667781;font-weight:400;font-size:14px';names.append(link,handle);
    const follow=document.createElement('button');follow.textContent='关注';follow.id='detailFollow';follow.style.cssText='background:#10161a;color:white;border:0;border-radius:24px;padding:8px 18px;flex-shrink:0';header.append(avatar,names,follow);article.prepend(header);
    const meta=document.createElement('div');meta.style.cssText='margin-top:20px;font-size:13px;color:#778';if(timeLink)meta.append(timeLink);article.append(meta);
   },title);await page.waitForTimeout(600);
  }
  await makeDetail();
  await audit('Detail page right-side heat and follower badges align with name; handle stays below',async()=>{
   const layout=await page.evaluate(()=>{const name=document.querySelector('#detailName').getBoundingClientRect(),f=document.querySelector('#detailNameLink .why-follower'),h=document.querySelector('#detailHeader .why-heat'),handle=document.querySelector('#detailHandle').getBoundingClientRect();const center=r=>r.top+r.height/2;return{same:!!f&&!!h&&Math.abs(center(name)-center(f.getBoundingClientRect()))<2&&Math.abs(center(name)-center(h.getBoundingClientRect()))<2,handleBelow:handle.top>=name.bottom,counts:[document.querySelectorAll('#detailHeader .why-follower').length,document.querySelectorAll('#detailHeader .why-heat').length]};});
   if(!layout.same||!layout.handleBelow||layout.counts.some(n=>n!==1))throw Error(JSON.stringify(layout));
  });
  await page.locator('#fold').click();await page.screenshot({path:'artifacts/screenshots/browser.png'});
  await page.locator('#dockTab').click();
  await audit('Compact toggle changes widths, keeps full follower count in tooltip, persists',async()=>{
   const small=await page.locator('#detailNameLink .why-follower').evaluate(e=>e.getBoundingClientRect().width);
   if(!(await page.locator('#detailNameLink .why-follower').getAttribute('title')).includes('1,200 位粉丝'))throw Error('exact follower count missing');
   await page.locator('#compactLabels').uncheck();await page.waitForTimeout(400);const large=await page.locator('#detailNameLink .why-follower').evaluate(e=>e.getBoundingClientRect().width);if(large<=small||!(await page.locator('#detailNameLink .why-follower').innerText()).startsWith('粉丝 '))throw Error('compact toggle did not change label');
   await page.reload();await page.waitForSelector('#why-x-helper',{state:'attached'});await page.waitForTimeout(500);if(await page.locator('#compactLabels').isChecked())throw Error('label preference did not persist');await page.locator('#compactLabels').check();await page.waitForTimeout(400);
  });
  await makeDetail('非常长的账号名称与科技工具分享'.repeat(4));
  await audit('Narrow detail header truncates long name without overlapping follow button',async()=>{
   await page.evaluate(()=>document.querySelector('main').style.width='440px');await page.waitForTimeout(400);
   const ok=await page.evaluate(()=>{const h=document.querySelector('#detailHeader .why-heat').getBoundingClientRect(),f=document.querySelector('#detailFollow').getBoundingClientRect(),name=document.querySelector('#detailName').getBoundingClientRect();return h.right<f.left&&Math.abs(h.top+h.height/2-name.top-name.height/2)<2;});if(!ok){await page.screenshot({path:'artifacts/screenshots/detail-layout-failure.png'});throw Error('labels overflow name area or wrap '+JSON.stringify(await page.evaluate(()=>['#detailHeader .why-heat','#detailName','#detailFollow'].map(s=>{const r=document.querySelector(s).getBoundingClientRect();return {selector:s,x:r.x,y:r.y,width:r.width,height:r.height};}))));}
  });
  await audit('Disabling both badges removes detail-only layout class',async()=>{
   await page.locator('button[data-tab="accounts"]').click();await page.locator('#followerToggle').uncheck();await page.locator('button[data-tab="heat"]').click();await page.locator('#heatOptions').evaluate(e=>e.open=true);await page.locator('#heatToggle').uncheck();await page.waitForTimeout(400);if(await page.locator('#detailHeader .why-inline-header,#detailHeader .why-follower,#detailHeader .why-heat').count())throw Error('old styles or badges remain');await page.locator('#heatToggle').check();await page.locator('button[data-tab="accounts"]').click();await page.locator('#followerToggle').check();await page.locator('button[data-tab="heat"]').click();await page.waitForTimeout(400);
  });
  const popup=await browser.newPage();
  const worker=browser.serviceWorkers()[0]||await browser.waitForEvent('serviceworker');
  await popup.goto(new URL('popup.html',worker.url()).href);
  const replies=await popup.evaluate(async()=>{
   const tabs=await chrome.tabs.query({});const results=[];
   for(const tab of tabs){try{const reply=await chrome.tabs.sendMessage(tab.id,{type:'WHY_TOGGLE'});if(reply?.ok)results.push({ok:true,open:reply.open});}catch{}}
   return results;
  });
  if(!replies.length)throw new Error('Extension messaging did not return an acknowledgement');
  console.log('POPUP COMMUNICATION:',replies);
  console.log('LAYOUT SAVED:',await popup.evaluate(async()=>{const data=await chrome.storage.local.get('whySettings');return!!data.whySettings;}));
  if((await page.locator('#panel').isVisible())!==replies.at(-1).open)throw new Error('Panel state does not match toggle acknowledgement');
  if(auditFailures.length)throw new Error('Audit regressions: '+auditFailures.join(' | '));
  if(errors.length)throw new Error('Extension page errors: '+errors.join('; '));
  console.log('Actual Edge extension startup and popup acknowledgement passed');

 }catch(error){console.log('FAILED:',error.message);console.log('Errors:',errors);console.log('Hook:',await page.evaluate(()=>({hook:!!window.__WHY_HOOK__,core:!!window.WHYCore,host:!!document.querySelector('#why-x-helper')})));process.exitCode=1;}
 finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
