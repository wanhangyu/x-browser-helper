/* Reading aids: all profile text stays in this tab; translation is controlled by the saved provider. */
(()=>{
 'use strict';
 const TTL=30*60*1000, users=new Map(), defaults={bios:true,hideUnread:false,hideLeft:false,hideRight:false};
 let options={...defaults},timer,expanded=null,observer;
 const fresh=value=>value&&Date.now()-value.at<TTL;
 const field=(user,key)=>fresh(user?.[key])?user[key].value:'';
 function schedule(){if(!timer)timer=setTimeout(()=>{timer=null;scan();},220);}
 window.addEventListener('message',event=>{
  if(event.source!==window||event.origin!==location.origin||event.data?.type!=='WHY_X_HELPER_DATA_V1')return;
  for(const row of (event.data.data?.users||[]).slice(0,3000)){
   if(!/^[a-z0-9_]{1,15}$/i.test(row.handle)||!Number.isFinite(row.at)||row.at>Date.now()+60000)continue;
   const key=row.handle.toLowerCase(),u=users.get(key)||{};
   for(const key of ['bio','location','isFollowing','followRequestSent','followBlocked']){const value=row[key],at=row[key+'At']??row.at;if(!Number.isFinite(at)||at>Date.now()+60000)continue;if((['bio','location'].includes(key)&&typeof value==='string')||(!['bio','location'].includes(key)&&typeof value==='boolean'))u[key]={value:typeof value==='string'?value.slice(0,key==='bio'?2000:300):value,at};}
   users.set(key,u);
  }
  while(users.size>3000)users.delete(users.keys().next().value);
  window.dispatchEvent(new Event('xpandmax:profiles'));schedule();
 });
 function handle(node){
  for(const link of node.querySelectorAll('a[href]')){
   try{const m=new URL(link.href).pathname.match(/^\/([a-z0-9_]{1,15})\/?$/i);if(m&&!['home','search','explore','notifications','messages','settings','i'].includes(m[1].toLowerCase()))return m[1].toLowerCase();}catch{}
  }return null;
 }
 function collapse(){if(expanded){expanded.open=false;expanded=null;}}
 function profile(h){const u=users.get(h);return{following:field(u,'isFollowing'),followRequestSent:field(u,'followRequestSent'),followBlocked:field(u,'followBlocked')};}
 const setText=(node,text)=>{if(node.textContent!==text)node.textContent=text;};
 function canFollow(node,h){
  const article=node.closest('article[data-testid="tweet"]'),own=document.querySelector('[data-testid="AppTabBar_Profile_Link"]')?.getAttribute('href')?.replace(/^\//,'').replace(/\/$/,'').toLowerCase(),u=profile(h);
  return article&&article.querySelector('[data-testid="User-Name"], [data-testid="UserName"]')===node&&article.querySelector('[data-testid="caret"]')&&h!==own&&!u.followBlocked&&(u.following===false&&!u.followRequestSent||!!window.xpandmaxFollow?.state(h));
 }
 function makeRow(node,h,bio,place){
  const box=document.createElement('details');box.className='why-bio';box.dataset.handle=h;box.dataset.xfcHandle=h;box.dataset.bio=bio;box.dataset.place=place;
  const summary=document.createElement('summary'),label=document.createElement('span');summary.append(label);summary.title='展开作者简介';
  const follow=document.createElement('button');follow.type='button';follow.className='why-follow';follow.dataset.role='follow';summary.append(follow);
  const full=document.createElement('div');full.className='why-bio-full';full.textContent=bio;
  const location=document.createElement('div');location.textContent=place?'自填所在地：'+place:'';
  const translation=document.createElement('button');translation.type='button';translation.dataset.role='translate';
  const hint=document.createElement('div');hint.className='why-bio-hint';
  const translatable=!!bio&&!(/[\u3400-\u9fff]/u.test(bio)&&!/[\u3040-\u30ff\uac00-\ud7af]/u.test(bio));
  translation.hidden=!translatable;
  let originalView=false,previousTranslation;
  function refresh(){
   const rect=node.getBoundingClientRect(),inView=rect.bottom>=0&&rect.top<=innerHeight;
   const api=window.xpandmaxTranslations;
   const entry=translatable?(inView?api?.request(bio):api?.inspect(bio)):null;
   const translated=entry?.state==='ready'?entry.text:null;
   if(translated!==previousTranslation){previousTranslation=translated;originalView=false;}
   const display=translated&&!originalView?translated:bio;
   setText(full,display);setText(label,box.open?'作者简介 · 点击收起':display||'作者资料');
   const pending=entry&&['queued','translating'].includes(entry.state);translation.disabled=!!pending;
   setText(translation,translated?(originalView?'查看译文':'查看原文'):pending?'正在翻译…':entry?.state==='activate'?'启用中文翻译':entry?.state==='failed'?'重试中文翻译':'翻译成中文');
   if(entry?.state==='failed')setText(hint,entry.error||'翻译失败，保留原文。');
   else if(entry?.state==='activate')setText(hint,'首次使用需点击启用，浏览器可能下载语言包。');
   else if(translated)setText(hint,'机器译文，仅供参考；可切换原文。');
   const state=window.xpandmaxFollow?.state(h),u=profile(h);
   const permitted=canFollow(node,h)||!!state&&u.following===true;
   follow.hidden=!permitted;
   const status=u.followRequestSent?'requested':u.following===true?'success':state?.status||'idle';
   setText(follow,({pending:'关注中…',success:'已关注',requested:'已申请',error:'重试关注'})[status]||'关注');
   follow.disabled=['pending','success','requested'].includes(status);follow.title=state?.message||'关注 @'+h;follow.setAttribute('aria-label',follow.textContent+' @'+h);
  }
  translation.onclick=event=>{
   event.stopPropagation();if(!event.isTrusted)return;
   if(previousTranslation){originalView=!originalView;refresh();return;}
   const entry=window.xpandmaxTranslations?.request(bio);
   if(!entry){setText(hint,'当前浏览器不支持本机翻译，请从插件工具栏打开简介翻译设置，选择在线服务。');return;}
   window.xpandmaxTranslations.enable();refresh();
  };
  follow.onclick=event=>{event.preventDefault();event.stopPropagation();if(!event.isTrusted||follow.disabled||!canFollow(node,h))return;window.xpandmaxFollow?.start({button:follow,details:box,handle:h,getProfile:profile});};
  box.append(summary,full,location,translation,hint);
  box.addEventListener('click',event=>event.stopPropagation());
  box.addEventListener('toggle',()=>{if(box.open){if(expanded&&expanded!==box)expanded.open=false;expanded=box;}else if(expanded===box)expanded=null;refresh();});
  box.refresh=refresh;box.resetTranslation=()=>{originalView=false;previousTranslation=undefined;setText(hint,'');};node.insertAdjacentElement('afterend',box);refresh();return box;
 }
 function scan(){
  if(!document.body)return;
  document.documentElement.classList.toggle('why-hide-unread',options.hideUnread);
  document.documentElement.classList.toggle('why-hide-left',options.hideLeft);
  document.documentElement.classList.toggle('why-hide-right',options.hideRight);
  const keep=new Set();
  if(options.bios)for(const node of document.querySelectorAll('[data-testid="User-Name"], [data-testid="UserName"]')){
   // Account lists already have their own native bio. Avoid duplicate text.
   if(node.closest('[data-testid="UserCell"]'))continue;
   const h=handle(node),u=users.get(h),bio=field(u,'bio'),place=field(u,'location');
   if(!bio&&!place&&!canFollow(node,h))continue;
   let box=node.nextElementSibling;
   if(!box?.classList.contains('why-bio'))box=makeRow(node,h,bio,place);
   else if(box.dataset.handle!==h||box.dataset.bio!==bio||box.dataset.place!==place){box.remove();box=makeRow(node,h,bio,place);}
   keep.add(box);box.refresh?.();
  }
  for(const box of document.querySelectorAll('.why-bio'))if(!keep.has(box))box.remove();
  for(const [h,u] of users)if(!Object.values(u).some(fresh))users.delete(h);
 }
 const css=`
 .why-bio{font:400 12px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:inherit;opacity:.85;max-width:100%;margin:3px 0 5px}
 .why-bio summary{display:flex;gap:8px;align-items:baseline;cursor:pointer;white-space:nowrap;overflow:hidden;max-width:100%;list-style:none;color:#1d9bf0}
 .why-bio summary>span{min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis}
 .why-bio summary::-webkit-details-marker{display:none}
 .why-bio[open] summary{white-space:normal}
 .why-bio .why-follow{flex-shrink:0;margin:0 0 0 8px;padding:0 6px;vertical-align:baseline;font-size:12px}\n .why-bio-full{white-space:pre-wrap;overflow-wrap:anywhere;margin:6px 0}
 .why-bio button{font:inherit;color:#1d9bf0;background:transparent;border:1px solid #8293a466;border-radius:5px;padding:3px 8px;cursor:pointer;margin-top:5px}
 .why-bio-hint{opacity:.7;margin-top:4px}
 .why-hide-right [data-testid="sidebarColumn"]{display:none!important}
 .why-hide-right main[role="main"]>div:has([data-testid="primaryColumn"]):has([data-testid="sidebarColumn"]),
 .why-hide-right main[role="main"] div:has(>[data-testid="primaryColumn"]):has(>[data-testid="sidebarColumn"]){width:600px!important;max-width:100%!important}
 .why-hide-left header[role="banner"]{display:none!important}
 .why-hide-right main[role="main"],.why-hide-left main[role="main"]{align-items:center!important}
 .why-hide-unread a[href="/notifications"] [aria-label*="unread"],
 .why-hide-unread a[href="/notifications"] [aria-label*="未读"],
 .why-hide-unread a[href="/notifications"] [data-testid="icon-badge"],
 .why-hide-unread [data-testid="AppTabBar_Notifications_Link"] [aria-live="polite"]{display:none!important}
 `;
 function start(){const style=document.createElement('style');style.textContent=css;document.documentElement.append(style);scan();
  observer=new MutationObserver(records=>{if(records.some(r=>!r.target.closest?.('.why-bio,#why-x-helper')&&!(r.target.parentElement?.closest('.why-bio,#why-x-helper'))))schedule();});
  observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['href']});
  setInterval(schedule,30000);window.postMessage({type:'WHY_X_HELPER_READY_V1'},location.origin);
 }
 for(const name of ['xpandmax:translation','xpandmax:followstate'])window.addEventListener(name,schedule);
 window.addEventListener('scroll',schedule,{passive:true});
 document.addEventListener('keydown',event=>{if(event.key==='Escape')collapse();});
 chrome.storage.onChanged.addListener((changes,area)=>{if(area!=='local')return;if(changes.whyReading){options={...defaults,...changes.whyReading.newValue};schedule();}if(changes.translationConfig){document.querySelectorAll('.why-bio').forEach(box=>box.resetTranslation?.());schedule();}});
 chrome.storage.local.get('whyReading',data=>{options={...defaults,...data.whyReading};if(document.body)start();else document.addEventListener('DOMContentLoaded',start,{once:true});});
})();
