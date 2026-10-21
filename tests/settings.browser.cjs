const {launchExtension,openSettings}=require('./browser-helpers.cjs');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const root=path.resolve(__dirname,'..'),context=await launchExtension(path.join(root,'extension'),{width:1450,height:1000});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 let html=fs.readFileSync(path.join(__dirname,'fixtures/timeline.html'),'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
 html+='<style>article,[data-testid="UserCell"]{background:transparent!important}</style><script>document.querySelectorAll("time").forEach(e=>e.dateTime=new Date(Date.now()-7200000).toISOString())</script>';
 await context.route('https://x.com/**',r=>r.fulfill({contentType:'text/html',body:html}));
 try{
  await page.goto('https://x.com/home');await page.locator('#why-x-helper').waitFor({state:'attached'});await page.locator('#dockTab').click();
  assert.equal(await page.locator('#panel footer button').count(),1);assert.equal(await page.locator('#openSettings').innerText(),'⚙ 设置');
  assert.equal(await page.locator('#openHeatOptions,#heatOptions,#resetLayout,#themeChoice').count(),0,'preferences do not clutter the heat page');
  await page.locator('[data-tab=accounts]').click();assert.equal(await page.locator('#followerToggle,#profileRows').count(),0);
  await openSettings(page);assert.equal(await page.locator('#profileRows').isVisible(),true);assert.equal(await page.locator('#followerToggle').isVisible(),true);
  await page.locator('#profileRows').check();assert.equal(await page.locator('#profileRows').isChecked(),true);
  await page.locator('#reading-hideUnread').check();assert.equal(await page.locator('#reading-hideUnread').isChecked(),true);
  await openSettings(page,'heatOptions');await page.locator('#topN').selectOption('20');assert.equal(await page.locator('#heatOptions').getAttribute('open'),'');
  await openSettings(page,'appearanceOptions');await page.locator('#themeChoice').selectOption('light');await page.locator('#compactLabels').uncheck();
  await page.reload();await page.locator('#why-x-helper').waitFor({state:'attached'});await openSettings(page,'heatOptions');assert.equal(await page.locator('#topN').inputValue(),'20');
  assert.equal(await page.locator('#profileRows').isChecked(),true);assert.equal(await page.locator('#reading-hideUnread').isChecked(),true);
  await openSettings(page,'appearanceOptions');assert.equal(await page.locator('#compactLabels').isChecked(),false);
  console.log('PASS one settings entrance, settings removed from content views, immediate changes, open groups and refresh persistence');
  await page.locator('[data-tab=search]').click();await page.locator('#editor>summary').click();await page.locator('#searchName').fill('未保存的搜索草稿');await page.locator('#searchQuery').fill('local tools');
  await openSettings(page);await page.locator('#backFromSettings').click();assert.equal(await page.locator('#searchName').inputValue(),'未保存的搜索草稿');assert.equal(await page.locator('#searchQuery').inputValue(),'local tools');
  console.log('PASS settings round trip preserves unsaved search draft');
  // Inject synthetic user data through the same bridge as the observed network hook.
  await page.evaluate(()=>window.postMessage({type:'WHY_X_HELPER_DATA_V1',data:{tweets:[],users:[{handle:'samplemaker',name:'示例作者',followers:1200,at:Date.now()}]}},location.origin));
  await page.locator('.why-follower').first().waitFor();
  const contrast=(fg,bg)=>{const linear=x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4;};const lum=s=>{const c=s.match(/[\d.]+/g).slice(0,3).map(Number).map(linear);return c[0]*.2126+c[1]*.7152+c[2]*.0722;};const a=lum(fg),b=lum(bg);return(Math.max(a,b)+.05)/(Math.min(a,b)+.05);};
  for(const background of ['rgb(0, 0, 0)','rgb(21, 32, 43)','rgb(255, 255, 255)']){
   await page.evaluate(bg=>{document.body.style.backgroundColor=bg;document.body.style.color=bg==='rgb(255, 255, 255)'?'#17212a':'#e7e9ea';},background);
   const expected=background.includes('255')?'light':'dark';await page.waitForFunction(t=>document.documentElement.dataset.whyPageTheme===t,expected);
   assert.equal(await page.locator('#why-x-helper').getAttribute('data-theme'),'light','page badges follow X independently of warm-white panel');
   const colors=await page.locator('.why-follower,.why-heat').evaluateAll(nodes=>nodes.filter(n=>!n.hidden).map(n=>({fg:getComputedStyle(n).color,bg:getComputedStyle(n).backgroundColor})));
   assert.ok(colors.length>1);for(const c of colors)assert.ok(contrast(c.fg,c.bg)>=4.5,JSON.stringify(c));
   if(expected==='dark')await page.screenshot({path:path.join(root,'artifacts/screenshots/settings-badges-dark-185.png'),fullPage:true});
  }
  console.log('PASS pure black, dim blue and light X themes; badge contrast >=4.5 and independent panel preference');
  await openSettings(page,'heatOptions');await page.locator('#heatToggle').uncheck();await page.locator('#followerToggle').uncheck();await page.waitForTimeout(350);assert.equal(await page.locator('.why-follower,.why-heat').count(),0);
  await page.locator('#followerToggle').check();await page.locator('#heatToggle').check();
  await page.locator('#heatOptions>summary').click();
  await page.screenshot({path:path.join(root,'artifacts/screenshots/settings-unified-185.png'),fullPage:true});
  const next=context.waitForEvent('page');await page.locator('#translationSettings').click();const options=await next;await options.waitForURL(/translation-options.html/);await options.locator('#settings').waitFor({state:'visible'});
  assert.deepEqual(errors,[]);console.log('PASS switches remove badges and translation shortcut opens extension settings');
 }finally{await context.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
