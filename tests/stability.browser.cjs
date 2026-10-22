const {launchExtension,openSettings}=require('./browser-helpers.cjs');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const root=path.resolve(__dirname,'..'),browser=await launchExtension(process.env.X_HELPER_EXTENSION_PATH||path.join(root,'extension'),{width:1400,height:1000}),page=await browser.newPage(),errors=[];page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
 const html=fs.readFileSync(path.join(__dirname,'fixtures/timeline.html'),'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'')+'<style>article{background:transparent!important;color:inherit}</style>';
 await browser.route('https://x.com/**',r=>r.fulfill({contentType:'text/html',body:html}));
 await browser.route('https://pbs.twimg.com/**',r=>r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="200" height="'+(r.request().url().includes('wide')?'200':'1200')+'"><rect width="200" height="1200" fill="#98b8a5"/><text x="12" y="80">READING</text></svg>'}));
 try{
  await page.goto('https://x.com/home');await page.locator('#why-x-helper').waitFor({state:'attached'});await page.locator('#dockTab').click();await openSettings(page,'contentFilterOptions');await page.locator('#extra-customRules').fill('正文:噪声引流');await page.locator('#extra-filter').check();
  const started=Date.now();await page.evaluate(()=>{
   const main=document.querySelector('main');main.querySelectorAll('article').forEach(n=>n.remove());const tweets=[];
   for(let i=0;i<140;i++){const id=String(900000+i),handle='p'+i,text=i%3===0?'噪声引流测试':'正常阅读测试',at=Date.now(),article=document.createElement('article');article.dataset.testid='tweet';article.innerHTML='<div data-testid="User-Name"><a href="/'+handle+'">示例 '+i+'</a><a href="/'+handle+'/status/'+id+'"><time datetime="'+new Date(at-7200000).toISOString()+'">2 小时</time></a></div><div data-testid="tweetText">'+text+'</div><div role="group"><button data-testid="bookmark">▱</button></div>';main.append(article);tweets.push({id,handle,name:'示例 '+i,text,bookmarks:42,created:at-7200000,views:1000,at});}
   window.postMessage({type:'WHY_X_HELPER_DATA_V1',data:{users:[],tweets}},location.origin);
   const noise=document.createElement('span');noise.id='stabilityNoise';document.body.append(noise);window.stabilityNoise=setInterval(()=>{noise.textContent=String(Date.now());},25);
  });
  await page.waitForFunction(()=>document.querySelectorAll('.why-filter-notice').length===47&&document.querySelectorAll('.why-bookmark-count').length===140);
  for(let i=0;i<18;i++){await page.evaluate(i=>window.scrollTo(0,(i%6)*900),i);await page.waitForTimeout(80);}
  assert.equal(await page.locator('.why-filter-notice').count(),47);assert.equal(await page.locator('.why-bookmark-count').count(),140);assert.ok((await page.locator('#extra-filterStatus').innerText()).includes('折叠 47 条'));
  await page.evaluate(()=>{const a=document.querySelector('article');a.querySelector('time').closest('a').href='/p0/status/999999';a.querySelector('[data-testid=tweetText]').textContent='普通新帖子';});await page.waitForFunction(()=>document.querySelectorAll('.why-filter-notice').length===46);assert.equal(await page.locator('article').first().locator('.why-bookmark-count').innerText(),'—');
  await page.evaluate(()=>document.querySelector('article time').remove());await page.waitForFunction(()=>!document.querySelector('article').querySelector('.why-bookmark-count'));assert.equal(await page.locator('article').first().locator('.why-filter-notice').count(),0);
  await page.evaluate(()=>{clearInterval(window.stabilityNoise);document.getElementById('stabilityNoise').remove();window.scrollTo(0,0);});
  for(const background of ['#000000','#15202b','#ffffff']){
   await page.evaluate(bg=>{document.body.style.backgroundColor=bg;document.body.style.color=bg==='#ffffff'?'#17212a':'#e7e9ea';},background);
   const color=await page.locator('.why-filter-notice').first().evaluate(n=>({notice:getComputedStyle(n).color,page:getComputedStyle(document.body).color}));assert.equal(color.notice,color.page);
  }
  await page.evaluate(()=>{document.body.style.backgroundColor='#000';document.body.style.color='#e7e9ea';});await page.screenshot({path:path.join(root,'artifacts/screenshots/filter-dark-192.png')});
  console.log('PASS 140 mounted posts, repeated scrolling/continuous mutations, no duplicate badges or notices, live counts, recycled/missing timestamp cleanup and light/black/dim text; elapsed '+(Date.now()-started)+'ms');
  // Keep unrelated mutations running while opening and switching photos.
  await page.evaluate(()=>{
   history.replaceState({},'', '/p0/status/900000/photo/1');const dialog=document.createElement('div');dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.id='photoFixture';dialog.style.cssText='position:fixed;inset:0;background:#101820;z-index:9999999';
   dialog.innerHTML=[1,2,3].map((n)=>'<div data-testid="swipe-to-dismiss" data-slide="'+n+'" style="position:absolute;top:0;left:0;width:900px;height:780px;transform:translateX('+(n===1?'0':'200vw')+')"><div style="width:650px;height:680px;overflow:hidden"><div id="visual'+n+'" style="width:650px;height:680px;background-image:url(https://pbs.twimg.com/media/'+(n===2?'wide':'tall')+n+'.jpg)"><img src="https://pbs.twimg.com/media/'+(n===2?'wide':'tall')+n+'.jpg" style="width:150px;height:'+(n===2?'150':'600')+'px"></div></div></div>').join('');document.body.append(dialog);
   const noise=document.createElement('span');noise.id='photoNoise';document.body.append(noise);window.photoNoise=setInterval(()=>{noise.textContent=String(Date.now());},25);
  });
  await page.locator('[data-slide="1"] .xvm-liv-img').waitFor();const scroller=page.locator('.xvm-liv-scroll');await scroller.hover();await page.mouse.wheel(0,260);const scrollTop=await scroller.evaluate(n=>n.scrollTop);assert.ok(scrollTop>0);await page.waitForTimeout(400);assert.equal(await scroller.evaluate(n=>n.scrollTop),scrollTop);
  async function switchPhoto(n){await page.evaluate(n=>{document.querySelectorAll('[data-slide]').forEach(s=>s.style.transform='translateX('+(Number(s.dataset.slide)===n?'0':'200vw')+')');history.replaceState({},'', '/p0/status/900000/photo/'+n);},n);}
  await switchPhoto(2);await page.waitForFunction(()=>!document.querySelector('.xvm-liv-img'));await page.waitForTimeout(300);await page.locator('#visual2').dblclick({position:{x:300,y:250}});assert.ok((await page.locator('#visual2').getAttribute('style')).includes('scale(2.5)'));
  await switchPhoto(3);await page.locator('[data-slide="3"] .xvm-liv-img').waitFor();assert.ok(!(await page.locator('#visual2').getAttribute('style')).includes('scale(2.5)'));assert.equal(await page.locator('.xvm-liv-img').count(),1);
  await switchPhoto(1);await page.locator('[data-slide="1"] .xvm-liv-img').waitFor();assert.equal(await page.locator('.xvm-liv-img').count(),1);
  await page.evaluate(()=>{clearInterval(window.photoNoise);document.getElementById('photoNoise').remove();document.getElementById('photoFixture').remove();history.replaceState({},'','/home');});await page.waitForTimeout(300);assert.equal(await page.locator('.xvm-iv-indicator,.xvm-liv-img').count(),0);assert.deepEqual(errors,[]);
  console.log('PASS image initialization under continuous mutations, retained long-image scroll position, long/normal/long carousel switching and zoom cleanup');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
