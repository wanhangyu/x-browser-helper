const {launchExtension,openSettings,resetLayout,toggleHeatSettings}=require('./browser-helpers.cjs');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const root=path.resolve(__dirname,'..'),folder=process.env.X_HELPER_EXTENSION_PATH||path.join(root,'extension'),now=Date.now(),date=new Date(now-7200000).toISOString();
 const header=(h,id)=>`<div data-testid="User-Name"><a href="/${h}" role="link">${h}</a><a href="/${h}" role="link">@${h}</a><a href="/${h}/status/${id}" role="link"><time datetime="${date}">2h</time></a></div>`;
 const article=(h,id,views,extra='')=>`<article data-testid="tweet" id="post${id}"><div class="post-head"><span class="avatar">${h[0].toUpperCase()}</span><div class="nativebranch"><div class="header-stack">${header(h,id)}</div></div><button data-testid="caret" class="native" aria-label="更多帖子选项">···</button></div><div data-testid="tweetText">创作与工具笔记 ${id}：把每天的小发现，慢慢变成可用的作品。</div>${extra}<div role="group"><span data-testid="like">10</span><span data-testid="retweet">2</span><span data-testid="reply">1</span><a role="link" href="/${h}/status/${id}/analytics" aria-label="${views} 次查看。查看帖子分析">${id==='111'?'1万':views}</a></div></article>`;
 const quote=`<div role="link" id="quote">${header('quoted','999')}<div data-testid="tweetText">Quoted content</div></div>`;
 const html=`<meta charset="utf-8"><style>body{font:15px/1.6 "Segoe UI","Microsoft YaHei",sans-serif;background:#fff;color:#263238}main{width:620px;margin:30px}article{padding:20px 16px;border-bottom:1px solid #edf0f2;min-height:160px}.post-head{display:flex;gap:8px;align-items:flex-start;justify-content:space-between}.nativebranch{display:flex;align-items:baseline;flex:0 1 auto;min-width:0}.header-stack{display:flex;flex-direction:column;flex:0 1 auto;min-width:0}.avatar{display:grid;place-items:center;background:#e7efe9;color:#52715e;width:36px;height:36px;border-radius:50%;flex-shrink:0}.native{border:0;background:transparent;color:#73808a;flex-shrink:0;padding:0 4px;font-size:20px}[data-testid="User-Name"]{display:flex;gap:8px;flex:1;min-width:0}[data-testid="User-Name"] a{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;color:inherit;text-decoration:none}[data-testid="tweetText"]{margin:10px 0 10px 44px}[role=group]{margin-left:44px;display:flex;gap:25px;color:#7c8990;font-size:12px}time{font-size:12px;color:#7c8990}</style><main>${article('alpha','111',12345)}${article('bravo','222',20000,quote)}${article('charlie','333',30000,'<div data-testid="placementTracking">Organic media placement</div>')}${article('advert','444',99999,'<span data-testid="promotedIndicator">广告</span>')}</main>`;
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
  const panel=page.locator('#panel');if(!await panel.isVisible())await page.locator('#dockTab').click();
  await page.waitForFunction(()=>document.querySelector('#why-x-helper')?.shadowRoot.querySelectorAll('[data-jump]').length===3);
  console.log('PASS DOM-only fallback restores three current-page ranking entries before any GraphQL response');
  await page.evaluate(()=>fetch('/i/api/graphql/test/HomeTimeline'));await page.waitForTimeout(600);
  assert.equal(await page.locator('.why-heat').count(),3);assert.equal(await page.locator('[data-jump]').count(),3);
  await page.locator('[data-jump="333"]').click();assert.equal(await page.locator('#post333').evaluate(n=>n.classList.contains('why-target')),true);
  console.log('PASS observed GraphQL and DOM fallback agree; ranking navigation remains functional');
  await page.evaluate(()=>{const a=document.querySelector('#post333');const wrapper=document.createElement('div');wrapper.dataset.testid='placementTracking';a.before(wrapper);wrapper.append(a);});await page.waitForTimeout(500);assert.equal(await page.locator('#post333 .why-heat').count(),1);
  console.log('PASS generic placementTracking ancestor is not classified as an advertisement');
  const afterTime=await page.locator('#post111').evaluate(a=>{const time=a.querySelector('time').closest('a'),f=a.querySelector('.why-follower');return time.nextElementSibling===f&&f.getBoundingClientRect().left>=time.getBoundingClientRect().right;});assert.ok(afterTime,'follower is immediately after timestamp');
  const sequence=await page.locator('#post111').evaluate(a=>{const t=a.querySelector('time').closest('a'),f=a.querySelector('.why-follower'),h=a.querySelector('.why-heat');return t.nextElementSibling===f&&f.nextElementSibling===h&&h.getBoundingClientRect().left>=f.getBoundingClientRect().right;});assert.ok(sequence,'default order is timestamp, followers, then heat');
  assert.equal(await page.locator('.why-heat-header').count(),0,'default inline layout does not reserve right-side space');
  await toggleHeatSettings(page);await page.locator('#heatPlacement').selectOption('right');await page.waitForTimeout(400);await toggleHeatSettings(page);
  const geometry=await page.locator('#post111').evaluate(article=>{const h=article.querySelector('[data-testid="User-Name"]'),b=h.querySelector('.why-heat'),menu=article.querySelector('.native');const hr=h.getBoundingClientRect(),br=b.getBoundingClientRect(),mr=menu.getBoundingClientRect();return{right:Math.abs(hr.right-br.right)<2,clear:br.right<=mr.left,top:Math.abs(hr.top+3-br.top)<2,inside:b.parentElement===h};});
  assert.deepEqual(geometry,{right:true,clear:true,top:true,inside:true});
  const gaps=await page.locator('article:not(#post444)').evaluateAll(rows=>rows.map(a=>a.querySelector('.native').getBoundingClientRect().left-a.querySelector('.why-heat').getBoundingClientRect().right));
  assert.ok(gaps.every(g=>Math.abs(g-8)<2),'short and long author branches must all fill the row');
  assert.equal(await page.locator('#launch').count(),0,'redundant bottom launcher removed');
  assert.equal(await page.locator('.close').count(),0,'header has one collapse action');
  for(let i=0;i<3;i++){await page.locator('#fold').click();assert.equal(await panel.isVisible(),false);assert.equal(await page.locator('#dockTab').isVisible(),true);await page.locator('#dockTab').click();assert.equal(await panel.isVisible(),true);}
  const fullSize=await panel.boundingBox();await page.locator('#fold').press('Enter');assert.equal(await panel.isVisible(),false);await page.locator('#dockTab').press('Space');assert.equal(await panel.isVisible(),true);assert.equal((await panel.boundingBox()).height,fullSize.height);
  await page.locator('#fold').click();await page.reload();await page.waitForTimeout(700);assert.equal(await panel.isVisible(),false);assert.equal(await page.locator('#dockTab').isVisible(),true);await page.locator('#dockTab').click();
  console.log('PASS one collapse/expand control, full size restoration, keyboard and collapsed-state persistence');
  async function dragPanel(side){const rect=await page.locator('#panel header').boundingBox();const sx=rect.x+50,sy=rect.y+15;const dx=side==='left'?5:1495-360+50;await page.mouse.move(sx,sy);await page.mouse.down();await page.mouse.move(dx,sy,{steps:8});await page.mouse.up();}
  await dragPanel('left');assert.equal(await panel.getAttribute('data-dock'),'left');assert.ok(Math.abs((await panel.boundingBox()).x-8)<1);
  await page.mouse.move(800,950);await page.waitForTimeout(450);assert.equal(await panel.isVisible(),true,'mouse leave does not change state');await page.locator('#fold').click();assert.equal(await page.locator('#dockTab').isVisible(),true);
  const revealTab=await page.locator('#dockTab').boundingBox();await page.mouse.move(revealTab.x+revealTab.width/2,revealTab.y+revealTab.height/2);await page.waitForTimeout(300);assert.equal(await panel.isVisible(),false,'hover does not unexpectedly expand');await page.locator('#dockTab').click();assert.equal(await panel.isVisible(),true);
  const gr=await page.locator('#panel header').boundingBox();await page.mouse.move(gr.x+50,gr.y+15);await page.mouse.down();await page.mouse.move(650,200,{steps:8});await page.mouse.up();assert.equal(await panel.getAttribute('data-dock'),'');
  await dragPanel('right');assert.equal(await panel.getAttribute('data-dock'),'right');assert.ok(Math.abs((await panel.boundingBox()).x+360-1480)<1);
  await page.mouse.move(800,950);await page.waitForTimeout(450);assert.equal(await panel.isVisible(),true);await page.locator('#fold').click();await page.locator('#dockTab').click();assert.equal(await panel.isVisible(),true);
  await resetLayout(page);
  console.log('PASS panel left/right snap, explicit collapse/expand, no hover changes and drag-out undocking');
  // A collapsed tab has its own edge; floating-panel position and size must survive.
  const freeHeader=await page.locator('#panel header').boundingBox();await page.mouse.move(freeHeader.x+50,freeHeader.y+15);await page.mouse.down();await page.mouse.move(530,200,{steps:8});await page.mouse.up();
  await page.locator('#resize').press('ArrowLeft');await page.locator('#resize').press('ArrowUp');
  const floatingRect=await panel.boundingBox();assert.equal(await panel.getAttribute('data-dock'),'');
  for(let i=0;i<2;i++){await page.locator('#fold').click();assert.equal(await page.locator('#dockTab').getAttribute('data-edge'),'left');await page.locator('#dockTab').click();assert.deepEqual(await panel.boundingBox(),floatingRect,'expand restores exact floating position and size');}
  await page.locator('#fold').click();await page.reload();await page.waitForTimeout(700);await page.locator('#dockTab').click();assert.deepEqual(await panel.boundingBox(),floatingRect,'saved floating rect survives refresh while collapsed');
  await page.locator('#fold').click();await page.setViewportSize({width:700,height:600});await page.locator('#dockTab').click();const clamped=await panel.boundingBox();assert.ok(clamped.x>=0&&clamped.y>=0&&clamped.x+clamped.width<=700&&clamped.y+clamped.height<=600,'restored panel stays inside a resized window');
  await page.setViewportSize({width:1500,height:1000});await resetLayout(page);
  console.log('PASS independent tab edge, exact floating rect restoration, persistence and viewport bounds');
  const originalPanel=await panel.boundingBox();await page.locator('#fold').click();
  async function dragTab(x,y){const r=await page.locator('#dockTab').boundingBox();await page.mouse.move(r.x+r.width/2,r.y+r.height/2);await page.mouse.down();await page.mouse.move(x,y,{steps:10});await page.mouse.up();assert.equal(await panel.isVisible(),false,'dragging tab must never expand the panel');}
  await dragTab(800,450);assert.equal(await page.locator('#dockTab').getAttribute('data-edge'),'');const freeTab=await page.locator('#dockTab').boundingBox();
  await page.reload();await page.waitForTimeout(700);assert.deepEqual(await page.locator('#dockTab').boundingBox(),freeTab,'free tab position persists');
  await page.locator('#dockTab').click();assert.deepEqual(await panel.boundingBox(),originalPanel,'tab movement does not alter expanded position');await page.locator('#fold').click();assert.deepEqual(await page.locator('#dockTab').boundingBox(),freeTab,'repeated collapse uses saved free tab location');
  await dragTab(2,350);assert.equal(await page.locator('#dockTab').getAttribute('data-edge'),'left');assert.ok(Math.abs((await page.locator('#dockTab').boundingBox()).x-8)<1);
  await dragTab(2,650);const leftTab=await page.locator('#dockTab').boundingBox();assert.ok(leftTab.y>500);await page.reload();await page.waitForTimeout(700);assert.deepEqual(await page.locator('#dockTab').boundingBox(),leftTab,'docked height persists');
  await dragTab(1499,350);assert.equal(await page.locator('#dockTab').getAttribute('data-edge'),'right');const rightTab=await page.locator('#dockTab').boundingBox();assert.ok(Math.abs(rightTab.x+rightTab.width-1480)<1);
  await page.locator('#dockTab').press('ArrowLeft');assert.equal(await page.locator('#dockTab').getAttribute('data-edge'),'');
  await page.setViewportSize({width:700,height:600});await page.waitForFunction(()=>{const r=document.querySelector('#why-x-helper').shadowRoot.querySelector('#dockTab').getBoundingClientRect();return r.x>=0&&r.y>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight;});const tabBounds=await page.locator('#dockTab').boundingBox();assert.ok(tabBounds.x>=0&&tabBounds.y>=0&&tabBounds.x+tabBounds.width<=701&&tabBounds.y+tabBounds.height<=600);
  await page.setViewportSize({width:1500,height:1000});await page.locator('#dockTab').click();assert.deepEqual(await panel.boundingBox(),originalPanel);await resetLayout(page);
  console.log('PASS minimized tab free drag, left/right snap, vertical and refresh persistence, click/drag separation and independent panel memory');
  // Force a wide native scrollbar and verify both expanded and collapsed controls.
  await page.addStyleTag({content:'html{overflow-y:scroll;scrollbar-gutter:stable}html::-webkit-scrollbar{width:28px;height:20px}'});
  await page.waitForTimeout(300);await dragPanel('right');
  const contentRight=await page.evaluate(()=>document.documentElement.clientWidth);
  const dockedPanel=await panel.boundingBox();assert.ok(dockedPanel.x+dockedPanel.width<=Math.min(1480,contentRight-8)+1,'panel avoids native and overlay scrollbar zones');
  await page.locator('#fold').click();await dragTab(1499,350);const dockedTab=await page.locator('#dockTab').boundingBox();assert.ok(dockedTab.x+dockedTab.width<=Math.min(1480,contentRight-8)+1,'tab avoids native and overlay scrollbar zones');
  await page.locator('#dockTab').click();await resetLayout(page);
  console.log('PASS full panel and minimized tab remain clear of 28px scrollbar and minimum overlay-scrollbar inset');




  assert.equal(await page.locator('#maxAge').isVisible(),false,'filters stay inside closed settings');
  await toggleHeatSettings(page);
  await page.locator('#heatPlacement').selectOption('name');await page.waitForTimeout(500);
  assert.equal(await page.locator('.why-heat-header').count(),0,'inline mode removes right-side reserved space');
  await page.locator('#heatPlacement').selectOption('right');await page.waitForTimeout(500);
  await toggleHeatSettings(page);
  for(const width of [440,320]){
   await page.locator('body > main').evaluate((n,w)=>n.style.width=w+'px',width);await page.waitForTimeout(250);
   const fit=await page.locator('#post111').evaluate(article=>{const h=article.querySelector('[data-testid="User-Name"]'),b=h.querySelector('.why-heat'),menu=article.querySelector('.native');const hr=h.getBoundingClientRect(),br=b.getBoundingClientRect(),mr=menu.getBoundingClientRect();return br.left>=hr.left&&br.right<=mr.left&&article.scrollWidth<=article.clientWidth;});
   assert.ok(fit,'right heat must fit before native menu at '+width+'px');
  }
  await page.locator('body > main').evaluate(n=>n.style.width='620px');
  await page.reload();await page.waitForTimeout(700);
  assert.equal(await page.locator('#post111 .why-heat').getAttribute('data-placement'),'right','chosen placement persists across refresh');
  console.log('PASS right-aligned header, native menu clearance, 320/440px widths, inline option and saved preference');

  await toggleHeatSettings(page);await page.locator('#heatPlacement').selectOption('after-time');await page.waitForTimeout(400);await toggleHeatSettings(page);
  await openSettings(page);await page.locator('#followerToggle').uncheck();await page.waitForTimeout(400);
  assert.equal(await page.locator('#post111').evaluate(a=>a.querySelector('time').closest('a').nextElementSibling?.classList.contains('why-heat')),true,'without follower badge, heat follows time');
  await page.locator('#followerToggle').check();await page.waitForTimeout(400);await page.locator('[data-tab="heat"]').click();
  await page.reload();await page.waitForTimeout(700);assert.equal(await page.locator('#post111 .why-heat').getAttribute('data-placement'),'after-time');
  assert.equal(await page.locator('#post111').evaluate(a=>a.querySelector('.why-follower').nextElementSibling?.classList.contains('why-heat')),true);
  console.log('PASS time/follower/heat order, follower toggle, and saved inline preference');
  await page.locator('[data-jump="333"]').click();await page.waitForTimeout(300);
  await page.screenshot({path:path.join(root,'artifacts/screenshots/heat-layout-170.png'),fullPage:true});
  await page.screenshot({path:path.join(root,'artifacts/screenshots/workbench-expanded-180.png'),fullPage:true});
  await page.locator('#fold').click();await page.screenshot({path:path.join(root,'artifacts/screenshots/workbench-collapsed-180.png'),fullPage:true});await page.locator('#dockTab').click();
  await openSettings(page,'appearanceOptions');await page.locator('#themeChoice').selectOption('dark');await page.waitForTimeout(300);
  await page.locator('#backFromSettings').click();await page.screenshot({path:path.join(root,'artifacts/screenshots/heat-layout-170-dark.png'),fullPage:true});assert.deepEqual(errors,[]);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
