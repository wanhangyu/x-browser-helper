const {launchExtension}=require('./browser-helpers.cjs');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const root=path.resolve(__dirname,'..'),folder=path.join(root,'extension'),now=Date.now(),date=new Date(now-7200000).toISOString();
 const header=(h,id)=>`<div data-testid="User-Name"><a href="/${h}" role="link">${h}</a><a href="/${h}" role="link">@${h}</a><a href="/${h}/status/${id}" role="link"><time datetime="${date}">2h</time></a></div>`;
 const article=(h,id,views,extra='')=>`<article data-testid="tweet" id="post${id}">${header(h,id)}<div data-testid="tweetText">Synthetic ${id}</div>${extra}<div role="group"><span data-testid="like">10</span><span data-testid="retweet">2</span><span data-testid="reply">1</span><a role="link" href="/${h}/status/${id}/analytics" aria-label="${views} 次查看。查看帖子分析">${id==='111'?'1万':views}</a></div></article>`;
 const quote=`<div role="link" id="quote">${header('quoted','999')}<div data-testid="tweetText">Quoted content</div></div>`;
 const html=`<meta charset="utf-8"><style>body{font:15px sans-serif}main{width:620px;margin:30px}article{padding:16px;border:1px solid #ddd}[data-testid="User-Name"]{display:flex;gap:8px}</style><main>${article('alpha','111',12345)}${article('bravo','222',20000,quote)}${article('charlie','333',30000,'<div data-testid="placementTracking">Organic media placement</div>')}${article('advert','444',99999,'<span data-testid="promotedIndicator">广告</span>')}</main>`;
 const tweet=(h,id,views)=>({__typename:'Tweet',rest_id:id,legacy:{created_at:date,full_text:'Fixture '+id,favorite_count:10,retweet_count:2,reply_count:1,bookmark_count:3},views:{state:'EnabledWithCount',count:String(views)},core:{user_results:{result:{__typename:'User',rest_id:'1'+id,core:{screen_name:h,name:h},relationship_counts:{followers:1000}}}}});
 const graph={data:{posts:[tweet('alpha','111',12345),tweet('bravo','222',20000),tweet('charlie','333',30000)]}};
 const browser=await launchExtension(folder,{width:1500,height:1000});
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await browser.route('https://x.com/**',route=>route.fulfill(route.request().url().includes('/graphql/')?{contentType:'application/json',body:JSON.stringify(graph)}:{contentType:'text/html',body:html}));
 try{
  await page.goto('https://x.com/home');await page.locator('#why-x-helper').waitFor({state:'attached'});await page.waitForTimeout(700);
  const before=await page.locator('.why-heat').count();assert.equal(before,3,'role=link timestamp anchors and organic placementTracking must produce three heat badges');
  assert.equal(await page.locator('#post444 .why-heat').count(),0);assert.equal(await page.locator('#quote .why-heat').count(),0);
  assert.ok((await page.locator('#post111 .why-heat').getAttribute('title')).includes('1.2万'),'DOM uses full aria-label view count before rounded visible text');
  console.log('PASS real-layout reproduction: role=link timestamps, organic placement, true ads, precise DOM counts and quote isolation');
  const panel=page.locator('#panel');if(!await panel.isVisible())await page.getByRole('button',{name:'打开 X 浏览助手',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('#why-x-helper')?.shadowRoot.querySelectorAll('[data-jump]').length===3);
  console.log('PASS DOM-only fallback restores three current-page ranking entries before any GraphQL response');
  await page.evaluate(()=>fetch('/i/api/graphql/test/HomeTimeline'));await page.waitForTimeout(600);
  assert.equal(await page.locator('.why-heat').count(),3);assert.equal(await page.locator('[data-jump]').count(),3);
  await page.locator('[data-jump="333"]').click();assert.equal(await page.locator('#post333').evaluate(n=>n.classList.contains('why-target')),true);
  console.log('PASS observed GraphQL and DOM fallback agree; ranking navigation remains functional');
  await page.evaluate(()=>{const a=document.querySelector('#post333');const wrapper=document.createElement('div');wrapper.dataset.testid='placementTracking';a.before(wrapper);wrapper.append(a);});await page.waitForTimeout(500);assert.equal(await page.locator('#post333 .why-heat').count(),1);
  console.log('PASS generic placementTracking ancestor is not classified as an advertisement');
  await page.screenshot({path:path.join(root,'artifacts/screenshots/browser.png'),fullPage:true});assert.deepEqual(errors,[]);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
