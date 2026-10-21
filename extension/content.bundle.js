
(function(root){
 'use strict';
 function number(value){
  if(typeof value==='number')return Number.isFinite(value)&&value>=0?value:null;
  if(value==null||value==='')return null;
  const s=String(value).replace(/[,，\s]/g,'').trim();
  const m=s.match(/^(\d+(?:\.\d+)?)([KMB千万亿]?)$/i);
  if(!m)return null;
  const mult={K:1e3,M:1e6,B:1e9,'千':1e3,'万':1e4,'亿':1e8};
  return Number(m[1])*(mult[m[2].toUpperCase()]||1);
 }
 function first(...xs){for(const x of xs){const n=number(x);if(n!==null)return n;}return null;}
 function handle(value){const s=String(value||'').replace(/^@/,'');return /^[a-z0-9_]{1,15}$/i.test(s)?s.toLowerCase():null;}
 function readableBio(text,urls){
  if(!Array.isArray(urls))return text;
  for(const item of urls.slice(0,30)){if(typeof item?.url!=='string'||!item.url||typeof item.expanded_url!=='string')continue;
   try{const u=new URL(item.expanded_url);if(['https:','http:'].includes(u.protocol))text=text.split(item.url).join(u.hostname.replace(/^www\./,'')+u.pathname.replace(/\/$/,''));}catch{}
  }return text;
 }
 function extract(payload,now=Date.now()){
  const users=new Map(),tweets=new Map(),seen=new WeakMap();let count=0;
  function user(v){
   const l=v.legacy||{},c=v.core||{},h=handle(l.screen_name||c.screen_name||v.screen_name);
   if(!h)return null;
   const f=first(v.relationship_counts?.followers,l.followers_count,v.followers_count,v.public_metrics?.followers_count);
   const result={handle:h,name:String(l.name||c.name||v.name||h).slice(0,100),followers:f,following:first(l.friends_count,v.public_metrics?.following_count),at:now};
   const bio=v.profile_bio?.description??l.description??v.description;
   const location=v.location?.location??l.location??v.location;
   if(typeof bio==='string'){result.bio=readableBio(bio,v.profile_bio?.entities?.description?.urls??l.entities?.description?.urls??v.entities?.description?.urls).slice(0,2000);result.bioAt=now;}
   if(typeof location==='string'){result.location=location.slice(0,300);result.locationAt=now;}
   const isFollowing=v.relationship_perspectives?.following??l.following??v.following;
   const requested=v.follow_request_sent??l.follow_request_sent;
   const blocking=v.relationship_perspectives?.blocking??l.blocking;
   const blockedBy=v.relationship_perspectives?.blocked_by??l.blocked_by;
   for(const [key,value] of Object.entries({isFollowing,followRequestSent:requested,followBlocked:typeof blocking==='boolean'||typeof blockedBy==='boolean'?blocking===true||blockedBy===true:undefined})){
    if(typeof value==='boolean'){result[key]=value;result[key+'At']=now;}
   }
   return result;
  }
  function walk(v,inherited=false){
   if(!v||typeof v!=='object'||++count>60000)return;
   const promoted=inherited||Object.hasOwn(v,'promotedMetadata')||Object.hasOwn(v,'promoted_metadata')||/^promoted-/.test(v.entryId||v.entry_id||'');
   const bit=promoted?2:1;if((seen.get(v)||0)&bit)return;seen.set(v,(seen.get(v)||0)|bit);
   if(!Array.isArray(v)){
    const l=v.legacy||{};
    if(v.__typename==='User'||(v.rest_id&&(l.screen_name||v.core?.screen_name))||(v.screen_name&&(v.followers_count!==undefined||typeof v.following==='boolean'||typeof v.follow_request_sent==='boolean'))){const u=user(v);if(u){const old=users.get(u.handle);if(u.followers===null&&old)u.followers=old.followers;users.set(u.handle,{...old,...u});}}
    if(v.rest_id&&l.created_at&&(l.full_text!=null||v.__typename==='Tweet')){
     const authorResult=v.core?.user_results?.result;
     const author=user(authorResult?.result||authorResult||{});
     if(author&&author.followers!==null)users.set(author.handle,author);
     const date=Date.parse(l.created_at);
     if(Number.isFinite(date)&&/^\d{1,30}$/.test(String(v.rest_id))){
      const note=v.note_tweet?.note_tweet_results?.result?.text;
      const id=String(v.rest_id),invalid=promoted||(v.views?.state!==undefined&&v.views.state!=='EnabledWithCount');
      const quoted=v.quoted_status_result?.result;
      const quotedId=String(l.quoted_status_id_str??quoted?.rest_id??quoted?.tweet?.rest_id??'');
      if(!tweets.get(id)?.invalid) tweets.set(id,{id,handle:author?.handle||'',name:author?.name||'',text:String(note||l.full_text||'').slice(0,20000),created:date,views:invalid?null:first(v.views?.count,l.views_count,v.public_metrics?.impression_count),invalid,quotedId:/^\d{1,30}$/.test(quotedId)?quotedId:null,likes:first(l.favorite_count),reposts:first(l.retweet_count),replies:first(l.reply_count),bookmarks:first(l.bookmark_count),at:now});
     }
    }
   }
   for(const child of Object.values(v))walk(child,promoted);
  }
  walk(payload);return{users:[...users.values()],tweets:[...tweets.values()]};
 }
 function metrics(t,now=Date.now()){
  if(!t||t.invalid||number(t.views)===null||!Number.isFinite(t.created)||now<t.created||(Number.isFinite(t.at)&&now-t.at>=30*60000))return null;
  const hours=(now-t.created)/3600000;
  if(hours<1/60)return{rate:null,young:true};
  const rate=t.views/Math.max(hours,.1);
  const interactions=(t.likes||0)+(t.reposts||0)+(t.replies||0)+(t.bookmarks||0);
  const engagement=['likes','reposts','replies','bookmarks'].every(k=>number(t[k])!==null)?(t.views?interactions/t.views:0):null;
  const complete=['likes','reposts','replies','bookmarks'].every(k=>number(t[k])!==null);
  const score=complete?Math.min(100,Math.round(Math.min(rate/50000,1)*40+Math.min(engagement/.1,1)*25+Math.min((t.likes>0?t.reposts/t.likes:0)/.5,1)*20+Math.min((t.likes>0?t.bookmarks/t.likes:0)/.3,1)*15)):null;
  return {rate,engagement,score,young:false};
 }
 function format(n){if(n==null)return'待加载';if(n>=1e8)return(n/1e8).toFixed(1)+'亿';if(n>=1e4)return(n/1e4).toFixed(1)+'万';return Math.round(n).toLocaleString('zh-CN');}
 function date(d){return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');}
 function query(s,now=new Date()){
  const parts=[String(s.query||'').trim()];
  if(Number(s.days)>0){const since=new Date(now);since.setDate(since.getDate()-Math.min(3650,Math.floor(Number(s.days))));parts.push('since:'+date(since));}
  if(Number(s.likes)>0)parts.push('min_faves:'+Math.floor(Number(s.likes)));
  if(Number(s.reposts)>0)parts.push('min_retweets:'+Math.floor(Number(s.reposts)));
  if(s.lang&&/^[a-z]{2,3}(?:-[a-z]{2})?$/i.test(s.lang))parts.push('lang:'+s.lang);
  if(s.from&&handle(s.from))parts.push('from:'+handle(s.from));
  if(s.follows)parts.push('filter:follows');
  if(s.original)parts.push('-filter:retweets -filter:replies');
  return parts.filter(Boolean).join(' ');
 }
 function validateUser(u){return u&&handle(u.handle)&&Number.isFinite(u.at)&&number(u.followers)!==null;}
 function validateTweet(t){return t&&/^\d{1,30}$/.test(t.id)&&Number.isFinite(t.created)&&Number.isFinite(t.at)&&(t.invalid===true||number(t.views)!==null);}
 const api={number,first,handle,extract,metrics,format,query,validateUser,validateTweet};
 root.WHYCore=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);

/* Render extension-owned, escaped templates without HTML injection sinks. */
(()=>{
 'use strict';
 const tags=new Set('style button svg path circle section header small h1 p nav main footer div span input label details summary select option a strong br'.split(' '));
 const voidTags=new Set(['input','br']);
 const svgTags=new Set(['svg','path','circle']);
 function decode(s){return String(s).replace(/&(?:amp|lt|gt|quot|#39|#x[0-9a-f]+|#\d+);/gi,entity=>{
  const simple={'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&#39;':"'"};
  if(simple[entity.toLowerCase()]!==undefined)return simple[entity.toLowerCase()];
  const hex=entity.toLowerCase().startsWith('&#x');const n=parseInt(entity.slice(hex?3:2,-1),hex?16:10);
  return Number.isFinite(n)&&n>0&&n<=0x10ffff?String.fromCodePoint(n):'�';
 });}
 function set(target,markup){
  const fragment=document.createDocumentFragment(),stack=[fragment];
  const tokens=String(markup).match(/<style\b[^>]*>[\s\S]*?<\/style\s*>|<!--[^]*?-->|<[^>]+>|[^<]+/gi)||[];
  for(const token of tokens){
   if(token.startsWith('<!--'))continue;
   if(/^<style\b/i.test(token)){
    const style=document.createElement('style');style.textContent=token.replace(/^<style\b[^>]*>/i,'').replace(/<\/style\s*>$/i,'');stack.at(-1).append(style);continue;
   }
   if(token.startsWith('</')){const tag=token.match(/^<\/([a-z0-9]+)/i)?.[1]?.toLowerCase();if(stack.length>1&&stack.at(-1).localName===tag)stack.pop();continue;}
   if(token.startsWith('<')){
    const match=token.match(/^<([a-z0-9]+)\b([^]*)>/i);if(!match)continue;
    const tag=match[1].toLowerCase();if(!tags.has(tag))continue;
    const element=svgTags.has(tag)?document.createElementNS('http://www.w3.org/2000/svg',tag):document.createElement(tag);
    const attrs=match[2].replace(/\/$/,'');
    const re=/([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;let attr;
    while((attr=re.exec(attrs))){
     const name=attr[1].toLowerCase(),value=decode(attr[2]??attr[3]??attr[4]??'');
     if(!/^(id|class|type|title|value|placeholder|min|max|maxlength|for|href|target|rel|style|checked|selected|hidden|draggable|tabindex|role|r|d|cx|cy|data-[\w-]+|aria-[\w-]+)$/.test(name))continue;
     if(name==='href'&&!/^(https:\/\/|\/|#)/i.test(value))continue;
     element.setAttribute(name,value);
    }
    stack.at(-1).append(element);if(!voidTags.has(tag)&&!token.endsWith('/>'))stack.push(element);continue;
   }
   stack.at(-1).append(document.createTextNode(decode(token)));
  }
  target.replaceChildren(fragment);
 }
 globalThis.WHYDOM={set};
})();


(()=>{
 'use strict';if(window.__WHY_UI__)return;window.__WHY_UI__=true;
 const C=globalThis.WHYCore,accounts=new Map(),posts=new Map();let settings={followers:true,heat:true,panel:false,minRate:0,minViews:0,longRate:0,topN:10,trending:1000,viral:10000,onlyHot:false,scopes:['home'],columns:['rank','tier','author','preview','views','rate'],theme:'light',compactLabels:true,maxAge:0,searchGroup:'全部'};
 let searches=[],tab='heat',editId=null,searchDraft=null,host,shadow,scanTimer,saveTimer,renderTimer,visible=[];let selectedId=null,returnPosition=null,lineFrame=0,dragging=false,suppressLaunchClickUntil=0;
 const defaults=[
  {id:'ai',name:'AI 工具 · 最近一周',query:'("AI tools" OR "AI工具")',days:7,likes:50,original:true},
  {id:'github',name:'GitHub 新发现',query:'github ("open source" OR "开源")',days:7,likes:20,original:true},
  {id:'video',name:'代码做视频',query:'(remotion OR fframes OR "motion canvas")',days:30,likes:10},
  {id:'follows',name:'关注的人 · 热门原创',query:'',days:7,likes:30,follows:true,original:true}
 ];
 const columnNames={rank:'排名',tier:'等级',author:'用户名',preview:'正文预览',views:'浏览量',rate:'流速'};
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function persist(){clearTimeout(saveTimer);saveTimer=setTimeout(()=>{
  const data=[...accounts.values()].filter(u=>Date.now()-u.at<30*60000).slice(-3000).map(({bio,bioAt,location,locationAt,isFollowing,isFollowingAt,followRequestSent,followRequestSentAt,followBlocked,followBlockedAt,...u})=>u);
  chrome.storage.local.set({whyAccounts:data});
 },1200);}
 function saveSettings(){chrome.storage.local.set({whySettings:settings});schedule();}
 function schedule(){if(scanTimer)return;scanTimer=setTimeout(()=>{scanTimer=null;scan();},180);}
 function redrawSoon(){if(renderTimer)return;renderTimer=setTimeout(()=>{renderTimer=null;if(settings.panel&&tab==='heat'&&!dragging&&!shadow?.activeElement?.matches('input,select,textarea'))render();updateConnector();},250);}
 window.addEventListener('message',event=>{
  if(event.source!==window||event.origin!==location.origin||event.data?.type!=='WHY_X_HELPER_DATA_V1')return;
  const data=event.data.data;if(!data||!Array.isArray(data.users)||!Array.isArray(data.tweets))return;
  for(const u of data.users.slice(0,3000))if(C.validateUser(u))accounts.set(C.handle(u.handle),u);
  for(const t of data.tweets.slice(0,1800))if(C.validateTweet(t))posts.set(t.id,t);
  while(accounts.size>3000)accounts.delete(accounts.keys().next().value);
  while(posts.size>1800)posts.delete(posts.keys().next().value);
  persist();schedule();
 });
 function accountFrom(node){
  for(const a of node.querySelectorAll('a[href]')){
   const path=new URL(a.href,location.href).pathname;
   const m=path.match(/^\/([a-z0-9_]{1,15})\/?$/i);
   if(m&&!['home','explore','search','messages','notifications','settings','compose','i'].includes(m[1].toLowerCase()))return C.handle(m[1]);
  }return null;
 }
 function postNameTarget(node,handle){
  const existing=node.querySelector('.why-inline-header');if(existing)return existing;
  const links=[...node.querySelectorAll('a[href]')].filter(a=>{try{return new URL(a.href,location.href).pathname.replace(/\/$/,'').toLowerCase()==='/'+handle&&!a.querySelector('img')&&a.textContent.trim()&&!a.textContent.trim().startsWith('@');}catch{return false;}});
  let label=links[0];
  if(!label)return node.querySelector('[dir="auto"]:not(.why-follower):not(.why-heat)')||node;
  // A profile link can contain both the name and handle on detail pages.
  if(label.textContent.includes('@'))label=[...label.querySelectorAll('[dir="auto"]')].find(e=>e.textContent.trim()&&!e.textContent.trim().startsWith('@'))||label;
  let target=label;
  for(let parent=label.parentElement;parent&&parent!==node;parent=parent.parentElement){
   if(parent.querySelector('time')||[...parent.querySelectorAll('a[href]')].some(a=>a.textContent.trim().startsWith('@')))break;
   if(parent.textContent.includes('@'))break;
   const style=getComputedStyle(parent);if(style.display.includes('flex')&&style.flexDirection==='row')target=parent;
  }
  return target;
 }
 function cleanHeaderStyles(){
  for(const row of document.querySelectorAll('.why-inline-header'))if(![...row.querySelectorAll('.why-follower,.why-heat')].some(b=>!b.hidden))row.classList.remove('why-inline-header');
 }
 function badge(node,handle){
  const u=accounts.get(handle);let b=node.querySelector('.why-follower');
  let target=node.matches('[data-testid="User-Name"], [data-testid="UserName"]')?postNameTarget(node,handle):node;
  if(node.matches('[data-testid="UserCell"]')){
   const name=node.querySelector('[data-testid="User-Name"], [data-testid="UserName"]');
   const links=[...node.querySelectorAll('a[href]')].filter(a=>{try{return new URL(a.href,location.href).pathname.toLowerCase()==='/'+handle;}catch{return false;}});
   const label=links.find(a=>a.textContent.trim()&&!a.textContent.trim().startsWith('@'))||links.find(a=>a.textContent.trim());

   const avatar=node.querySelector('img')?.getBoundingClientRect();
   const candidates=[...node.querySelectorAll('[dir="auto"],span')].filter(e=>{
    const text=e.textContent.trim();if(!text||text.startsWith('@')||text.length>60||e.closest('button,.why-follower')||e.querySelector('img'))return false;
    const rect=e.getBoundingClientRect();return rect.width>0&&(!avatar||(rect.top<avatar.top+28&&rect.bottom>avatar.top-8&&rect.left>=avatar.right-4));
   });
   candidates.sort((a,b)=>a.textContent.length-b.textContent.length);
   // Use the display-name link, never the vertical name/handle stack.
   target=label&&!label.textContent.trim().startsWith('@')?label:(name?.querySelector('[dir="auto"]')||candidates[0]||null);
   if(!target){b?.remove();return;}
   if(settings.followers&&u&&Date.now()-u.at<30*60000)target.classList.add('why-follower-row');else target.classList.remove('why-follower-row');

  }
  if(!settings.followers){node.querySelectorAll('.why-follower-row').forEach(e=>e.classList.remove('why-follower-row'));b?.remove();return;}
  if(!b){b=document.createElement('span');b.className='why-follower';target.append(b);}
  if(b.parentNode!==target){b.parentElement?.classList.remove('why-follower-row');target.append(b);}
  const fresh=u&&Date.now()-u.at<30*60000;
  b.hidden=!fresh;
  if(fresh&&node.matches('[data-testid="User-Name"], [data-testid="UserName"]'))target.classList.add('why-inline-header');
  b.dataset.compact=String(settings.compactLabels!==false);
  const value=fresh?(settings.compactLabels!==false?'👥 ':'粉丝 ')+C.format(u.followers):'粉丝 待加载';
  if(b.textContent!==value)b.textContent=value;
  b.setAttribute('aria-label',fresh?`${u.followers.toLocaleString('zh-CN')} 位粉丝`:'粉丝数据待加载');
  b.title=fresh?`@${handle} · ${u.followers.toLocaleString('zh-CN')} 位粉丝\n读取时间：${new Date(u.at).toLocaleString()}\n来自 X 已加载的数据，缓存最多30 分钟。`:'X 尚未加载此账号的粉丝数据。可悬停账号查看资料卡，或打开主页后返回。';
 }
 function tweetInfo(article){return globalThis.WHYPostDOM?.identify(article)||null;}
 function domTweet(article,info){
  const view=[...article.querySelectorAll('a[href*="/analytics"]')].find(a=>{try{const u=new URL(a.href),m=u.pathname.match(/^\/([^/]+)\/status\/(\d+)\/analytics\/?$/i);return u.origin===location.origin&&m&&C.handle(m[1])===info.handle&&m[2]===info.id;}catch{return false;}});
  const raw=view?.innerText.trim(),precise=view?.getAttribute('aria-label')?.match(/\d[\d,，.]*(?:[KMB千万亿])?/i)?.[0];const views=C.first(precise,raw);
  const created=Date.parse(info.time.dateTime);
  if(views===null||!Number.isFinite(created))return null;
  function count(test){const e=article.querySelector(`[data-testid="${test}"]`);return C.first(e?.innerText.trim(),e?.getAttribute('aria-label')?.match(/[\d,.]+[KMB千万亿]?/i)?.[0]);}
  return{id:info.id,handle:info.handle,name:info.handle,text:article.querySelector('[data-testid="tweetText"]')?.innerText||'',created,views,likes:count('like'),reposts:count('retweet'),replies:count('reply'),bookmarks:null,at:Date.now(),estimated:true};
 }
 function scan(){
  if(!document.body)return;
  if(!host||!host.isConnected)mount();visible=[];
  for(const node of document.querySelectorAll('[data-testid="User-Name"], [data-testid="UserName"], [data-testid="UserCell"]')){
   if(node.matches('[data-testid="User-Name"], [data-testid="UserName"]')&&node.closest('[data-testid="UserCell"]'))continue;
   const h=accountFrom(node);if(h)badge(node,h);
  }
  // Capture only explicitly visible follower counters in a profile hover card.
  const hover=document.querySelector('[data-testid="HoverCard"]');
  if(hover){
   const link=hover.querySelector('a[href$="/verified_followers"],a[href$="/followers"]');
   if(link){const m=new URL(link.href).pathname.match(/^\/([^/]+)\//),n=C.number(link.innerText.match(/[\d,.]+\s*[KMB千万亿]?/i)?.[0]);
    if(m&&n!==null){const h=C.handle(m[1]);if(h){accounts.set(h,{handle:h,name:h,followers:n,at:Date.now()});persist();}}}
  }
  for(const article of document.querySelectorAll('article[data-testid="tweet"]')){
   const info=tweetInfo(article);let b=info?.header.querySelector('.why-heat');
   if(globalThis.WHYPostDOM.promoted(article)){article.querySelectorAll('.why-heat').forEach(b=>b.remove());article.classList.remove('why-hidden');continue;}
   if(!info){article.classList.remove('why-hidden');article.querySelectorAll('.why-heat').forEach(b=>b.remove());continue;}
   const cached=posts.get(info.id);
   if(cached?.invalid||cached?.handle&&cached.handle!==info.handle){article.querySelectorAll('.why-heat').forEach(b=>b.remove());article.classList.remove('why-hidden');continue;}
   let t;
   if(cached&&!cached.estimated)t=Date.now()-cached.at<30*60000?cached:null;
   else{t=domTweet(article,info);if(t&&cached&&['views','likes','reposts','replies','created'].every(k=>t[k]===cached[k]))t.at=cached.at;if(t&&Date.now()-t.at>=30*60000)t=null;}
   const m=C.metrics(t);
   if(t&&!t.invalid){visible.push(t);if(t.estimated)posts.set(t.id,t);}
   if(!settings.heat){b?.remove();}else{
    const name=info.header,target=name?postNameTarget(name,info.handle):(article.querySelector('[role="group"]')||article);
    if(!b){b=document.createElement('span');b.className='why-heat';}
    if(b.parentElement!==target)target.append(b);
    if(name)target.classList.add('why-inline-header');
    b.dataset.compact=String(settings.compactLabels!==false);
    const label=m?.rate!=null?`${m.rate>=settings.viral?'🔥':m.rate>=settings.trending?'🚀':'🌱'} ${C.format(m.rate)}/h`:m?.young?'刚发布 · 等待样本':'热度待加载';
    if(b.textContent!==label)b.textContent=label;
    b.dataset.tweetId=info.id;
    if(!b.dataset.whyTooltip){b.dataset.whyTooltip='1';b.tabIndex=0;b.addEventListener('mouseenter',()=>showMetrics(b));b.addEventListener('mouseleave',hideMetrics);b.addEventListener('focus',()=>showMetrics(b));b.addEventListener('blur',hideMetrics);}
    b.dataset.level=m?.rate>=settings.viral?'hot':m?.rate>=settings.trending?'warm':'normal';
    b.title=t?`平均浏览量／小时：累计浏览量 ÷ 发布至今时长\n浏览量：${C.format(t.views)}\n点赞：${C.format(t.likes)}  转发：${C.format(t.reposts)}\n互动率：${m?.engagement!=null?(m.engagement*100).toFixed(2)+'%':'待加载'}\n${t.estimated?'来自页面简写数字，可能存在舍入误差。':'来自 X 页面已加载数据。'}\n不是最近一小时新增量。`:'刷新 X 后继续滚动，等 X 加载帖子指标。';
   }
   const threshold=(t?.text.length>=600&&settings.longRate>0)?settings.longRate:settings.minRate;
   const tests=[];if(threshold>0)tests.push(m?.rate>=threshold);if(settings.minViews>0)tests.push(t?.views>=settings.minViews);
   const ageHidden=settings.maxAge>0&&t?.created&&Date.now()-t.created>settings.maxAge*3600000;
   const hidden=ageHidden||settings.onlyHot&&settings.scopes.includes(pageScope())&&m?.rate!=null&&tests.length>0&&!tests.some(Boolean);
   article.classList.toggle('why-hidden',Boolean(hidden)&&info.id!==selectedId);
   const quoteHeaders=new Set();
   if(settings.heat)for(const q of globalThis.WHYPostDOM.quotes(article,info,posts)){
    const qm=C.metrics(q.t);if(qm?.rate==null)continue;
    quoteHeaders.add(q.header);let qb=q.header.querySelector('.why-heat');
    if(!qb){qb=document.createElement('span');qb.className='why-heat';qb.tabIndex=0;qb.addEventListener('mouseenter',()=>showMetrics(qb));qb.addEventListener('mouseleave',hideMetrics);qb.addEventListener('focus',()=>showMetrics(qb));qb.addEventListener('blur',hideMetrics);}
    const target=postNameTarget(q.header,q.handle);if(qb.parentElement!==target)target.append(qb);target.classList.add('why-inline-header');qb.dataset.tweetId=q.id;qb.dataset.compact=String(settings.compactLabels!==false);
    const label=`${qm.rate>=settings.viral?'🔥':qm.rate>=settings.trending?'🚀':'🌱'} ${C.format(qm.rate)}/h`;
    if(qb.textContent!==label)qb.textContent=label;qb.dataset.level=qm.rate>=settings.viral?'hot':qm.rate>=settings.trending?'warm':'normal';qb.title='引用原帖的平均浏览量／小时；不是外层帖子的指标。';
   }
   for(const header of article.querySelectorAll('[data-testid="User-Name"], [data-testid="UserName"]'))if(header!==info.header&&!quoteHeaders.has(header))header.querySelectorAll('.why-heat').forEach(b=>b.remove());

  }
  cleanHeaderStyles();
  while(posts.size>1800)posts.delete(posts.keys().next().value);
  applyTheme();
  redrawSoon();
 }


 function applyTheme(){
  if(!host)return;let theme=settings.theme||'light';
  if(theme==='auto'){
   const body=getComputedStyle(document.body).backgroundColor.match(/[\d.]+/g);
   const opaque=body&&!(body.length===4&&Number(body[3])===0);
   theme=opaque?(Number(body[0])+Number(body[1])+Number(body[2])<360?'dark':'light'):(settings.resolvedTheme||'light');
   settings.resolvedTheme=theme;
  }
  host.dataset.theme=theme==='dark'?'dark':'light';
 }
 function normalizeSearchGroup(){
  if(settings.searchGroup!=='全部'&&!searches.some(s=>(s.group||'未分组')===settings.searchGroup)){settings.searchGroup='全部';saveSettings();}
 }
 function searchItems(){
  return searches.filter(s=>settings.searchGroup==='全部'||(s.group||'未分组')===settings.searchGroup).map((s,index)=>({s,index})).sort((a,b)=>Number(!!b.s.pinned)-Number(!!a.s.pinned)||a.index-b.index).map(x=>x.s);
 }
 function pageScope(){const p=location.pathname;if(/\/status\//.test(p))return 'status';if(/\/lists\//.test(p))return 'list';if(p==='/'||/^\/(home|search|explore|work)(\/|$)/.test(p))return 'home';return 'profile';}
 function orderedColumns(){return [...settings.columns,...Object.keys(columnNames).filter(k=>!settings.columns.includes(k))];}
 function rankRow(t,m,i){
  const cells={rank:`<span class="rank-number">${i+1}</span>`,tier:`<span class="rank-icon">${m.rate>=settings.viral?'🔥':m.rate>=settings.trending?'🚀':'🌱'}</span>`,author:`<span class="rank-author">${esc(t.name||'@'+t.handle)}</span>`,preview:`<span class="rank-preview">${esc(t.text.slice(0,85)||'@'+t.handle)}</span>`,views:`<span class="rank-views">◉ ${C.format(t.views)}</span>`,rate:`<span class="rank-rate" data-level="${m.rate>=settings.viral?'hot':m.rate>=settings.trending?'warm':'normal'}">${C.format(m.rate)}/h</span>`};
  return `<button class="rank-row ${selectedId===t.id?'selected':''}" data-jump="${esc(t.id)}" title="${esc('@'+t.handle+'：'+t.text)}" aria-label="定位第 ${i+1} 名 @${esc(t.handle)} 的帖子" aria-pressed="${selectedId===t.id}">${settings.columns.map(k=>cells[k]||'').join('')}</button>`;
 }
 function bindHeatOptions(main){
  main.querySelector('#onlyHot').onchange=e=>{settings.onlyHot=e.target.checked;if(settings.onlyHot&&!settings.minRate&&!settings.minViews&&!settings.longRate)settings.minRate=settings.trending;saveSettings();render();};
  main.querySelectorAll('[data-scope]').forEach(el=>el.onchange=()=>{settings.scopes=[...main.querySelectorAll('[data-scope]:checked')].map(e=>e.dataset.scope);saveSettings();});
  ['trending','viral'].forEach(key=>main.querySelector('#'+key).onchange=e=>{settings[key]=Math.max(1,Number(e.target.value)||1);settings.viral=Math.max(settings.trending+1,settings.viral);saveSettings();render();});
  function move(key,target){const order=orderedColumns(),from=order.indexOf(key),to=order.indexOf(target);if(from<0||to<0)return;order.splice(from,1);order.splice(to,0,key);settings.columns=order.filter(k=>settings.columns.includes(k));saveSettings();render();}
  main.querySelectorAll('[data-column-visible]').forEach(el=>el.onchange=()=>{const enabled=[...main.querySelectorAll('[data-column-visible]:checked')].map(e=>e.dataset.columnVisible);settings.columns=enabled.length?enabled:['rate'];saveSettings();render();});
  main.querySelectorAll('[data-column]').forEach(el=>{el.ondragstart=e=>{e.dataTransfer.setData('text/plain',el.dataset.column);el.classList.add('dragging');};el.ondragend=()=>el.classList.remove('dragging');el.ondragover=e=>e.preventDefault();el.ondrop=e=>{e.preventDefault();move(e.dataTransfer.getData('text/plain'),el.dataset.column);};});
  main.querySelectorAll('[data-column-up]').forEach(el=>el.onclick=()=>{const order=orderedColumns(),index=order.indexOf(el.dataset.columnUp);if(index>0)move(order[index],order[index-1]);});
 }
 function hideMetrics(){shadow?.getElementById('metricsTip')?.removeAttribute('data-open');}
 function showMetrics(badge){
  const t=posts.get(badge.dataset.tweetId),m=C.metrics(t);if(!t||!shadow||t.invalid||Date.now()-t.at>=30*60000){hideMetrics();return;}
  let tip=shadow.getElementById('metricsTip');if(!tip){tip=document.createElement('div');tip.id='metricsTip';tip.setAttribute('role','tooltip');shadow.append(tip);}
  globalThis.WHYDOM.set(tip,`<div class="tip-title">${esc(t.name||'@'+t.handle)} · 帖子指标</div><div class="tip-grid">${[['浏览',t.views],['点赞',t.likes],['转发',t.reposts],['回复',t.replies],['收藏',t.bookmarks]].map(([name,value])=>`<span>${name}</span><strong>${C.format(value)}</strong>`).join('')}<span>平均流速</span><strong>${m?.rate!=null?C.format(m.rate)+'/h':'等待样本'}</strong><span>爆帖指数</span><strong>${m?.score!=null?m.score+'/100':'指标不全'}</strong></div><p>平均值非实时新增。指数为启发式参考，不预测曝光量；不足 6 分钟按 6 分钟计算。</p>`);
  const rect=badge.getBoundingClientRect();tip.dataset.open='true';tip.style.left=Math.max(8,Math.min(innerWidth-268,rect.right-260))+'px';tip.style.top=Math.max(8,Math.min(innerHeight-tip.offsetHeight-12,rect.bottom+9))+'px';
 }

 function saveLayout(){chrome.storage.local.set({whySettings:settings});queueConnector();}
 function layoutSize(){
  const panel=shadow?.getElementById('panel');if(!panel)return;
  const width=Math.max(Math.min(280,innerWidth-16),Math.min(innerWidth-16,Number(settings.size?.width)||410));
  const height=Math.max(Math.min(260,innerHeight-16),Math.min(innerHeight-16,Number(settings.size?.height)||Math.min(650,innerHeight-120)));
  panel.style.width=width+'px';panel.style.height=settings.collapsed?'52px':height+'px';panel.dataset.collapsed=String(!!settings.collapsed);
  const fold=shadow.getElementById('fold');if(fold){fold.textContent=settings.collapsed?'＋':'−';fold.setAttribute('aria-label',settings.collapsed?'展开浏览助手':'折叠浏览助手');}
 }
 function positionLauncher(){
  const button=shadow?.getElementById('launch');if(!button)return;
  button.classList.toggle('docked',!!settings.launcherDock);button.dataset.edge=settings.launcherDock||'';
  button.setAttribute('aria-expanded',String(!!settings.panel));button.setAttribute('aria-label',settings.panel?'隐藏 X 浏览助手':'打开 X 浏览助手');
  button.title=(settings.panel?'点击隐藏助手':'点击打开助手')+'；拖动可移动，贴边可收起';
  if(!settings.launcherPosition){button.style.left='auto';button.style.top='auto';button.style.right='16px';button.style.bottom='26px';return;}
  const width=button.offsetWidth,height=button.offsetHeight;
  let x=Math.max(0,Math.min(innerWidth-width,Number(settings.launcherPosition.x)||0));
  if(settings.launcherDock==='left')x=0;if(settings.launcherDock==='right')x=innerWidth-width;
  const y=Math.max(8,Math.min(innerHeight-height-8,Number(settings.launcherPosition.y)||0));
  button.style.left=x+'px';button.style.top=y+'px';button.style.right='auto';button.style.bottom='auto';
 }
 function installLayoutControls(){
  const panel=shadow.getElementById('panel'),launch=shadow.getElementById('launch'),resize=shadow.getElementById('resize');
  launch.style.touchAction='none';
  launch.addEventListener('pointerdown',event=>{
   if(event.button!==0)return;const rect=launch.getBoundingClientRect(),sx=event.clientX,sy=event.clientY;let moved=false;
   launch.setPointerCapture(event.pointerId);
   function move(e){if(Math.hypot(e.clientX-sx,e.clientY-sy)<4&&!moved)return;moved=true;dragging=true;settings.launcherDock=null;settings.launcherPosition={x:rect.left+e.clientX-sx,y:rect.top+e.clientY-sy};positionLauncher();}
   function end(){launch.removeEventListener('pointermove',move);launch.removeEventListener('pointerup',end);launch.removeEventListener('pointercancel',end);dragging=false;if(!moved)return;suppressLaunchClickUntil=Date.now()+500;const r=launch.getBoundingClientRect();settings.launcherDock=r.left<18?'left':r.right>innerWidth-18?'right':null;positionLauncher();saveLayout();}
   launch.addEventListener('pointermove',move);launch.addEventListener('pointerup',end,{once:true});launch.addEventListener('pointercancel',end,{once:true});
  });
  shadow.getElementById('fold').onclick=()=>{settings.collapsed=!settings.collapsed;if(settings.collapsed)clearSelection();layoutSize();positionPanel();saveLayout();};
  shadow.getElementById('resetLayout').onclick=()=>{settings.position=null;settings.launcherPosition=null;settings.launcherDock=null;settings.size=null;settings.collapsed=false;panel.style.left='auto';panel.style.top='100px';panel.style.right='18px';panel.style.bottom='auto';layoutSize();positionLauncher();saveLayout();};
  resize.addEventListener('pointerdown',event=>{
   if(event.button!==0||settings.collapsed)return;event.preventDefault();resize.setPointerCapture(event.pointerId);const r=panel.getBoundingClientRect(),sx=event.clientX,sy=event.clientY;dragging=true;
   function move(e){settings.size={width:Math.min(innerWidth-r.left-8,Math.max(280,r.width+e.clientX-sx)),height:Math.min(innerHeight-r.top-8,Math.max(260,r.height+e.clientY-sy))};layoutSize();queueConnector();}
   function end(){dragging=false;resize.removeEventListener('pointermove',move);resize.removeEventListener('pointerup',end);resize.removeEventListener('pointercancel',end);saveLayout();}
   resize.addEventListener('pointermove',move);resize.addEventListener('pointerup',end,{once:true});resize.addEventListener('pointercancel',end,{once:true});
  });
  resize.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();const r=panel.getBoundingClientRect();settings.size={width:r.width+(event.key==='ArrowRight'?20:event.key==='ArrowLeft'?-20:0),height:r.height+(event.key==='ArrowDown'?20:event.key==='ArrowUp'?-20:0)};layoutSize();saveLayout();});
 }
 function positionPanel(){
  const panel=shadow?.getElementById('panel');if(!panel)return;layoutSize();if(!settings.position){panel.style.top=Math.min(100,Math.max(8,innerHeight-panel.offsetHeight-8))+'px';return;}
  const x=Math.max(8,Math.min(innerWidth-panel.offsetWidth-8,Number(settings.position.x)||0));
  const y=Math.max(8,Math.min(innerHeight-panel.offsetHeight-8,Number(settings.position.y)||0));
  panel.style.left=x+'px';panel.style.top=y+'px';panel.style.right='auto';panel.style.bottom='auto';
 }
 function installPanelDrag(){
  const panel=shadow.getElementById('panel'),grip=shadow.querySelector('header');grip.title='拖动面板';grip.style.cursor='grab';grip.style.touchAction='none';
  grip.addEventListener('pointerdown',event=>{
   if(event.button!==0||event.target.closest('button'))return;
   const rect=panel.getBoundingClientRect(),dx=event.clientX-rect.left,dy=event.clientY-rect.top;dragging=true;grip.setPointerCapture(event.pointerId);grip.style.cursor='grabbing';
   function move(e){settings.position={x:e.clientX-dx,y:e.clientY-dy};positionPanel();queueConnector();}
   function stop(){dragging=false;grip.style.cursor='grab';grip.removeEventListener('pointermove',move);grip.removeEventListener('pointerup',stop);grip.removeEventListener('pointercancel',stop);chrome.storage.local.set({whySettings:settings});}
   grip.addEventListener('pointermove',move);grip.addEventListener('pointerup',stop,{once:true});grip.addEventListener('pointercancel',stop,{once:true});
  });
 }
 const styles=`
 :host{all:initial;color:#e7efea;font:14px/1.5 "Segoe UI","Microsoft YaHei",sans-serif}
 *{box-sizing:border-box}button,input,select{font:inherit}button{cursor:pointer}button:focus-visible,input:focus-visible,select:focus-visible{outline:2px solid #9aefab;outline-offset:3px}
 #launch{position:fixed;right:16px;bottom:26px;z-index:2147483600;background:#b3f2b8;color:#102216;border:0;border-radius:16px;padding:12px 17px;font-weight:700;box-shadow:0 6px 30px #0005}
 #panel{position:fixed;right:18px;top:100px;width:365px;max-width:calc(100vw - 30px);height:min(650px,calc(100vh - 120px));z-index:2147483600;background:#111914;border:1px solid #354339;border-radius:20px;box-shadow:0 20px 60px #0009;display:flex;flex-direction:column;overflow:hidden}
 #panel[hidden]{display:none}header{padding:23px 22px 16px;border-bottom:1px solid #2c382f}header small{color:#a9eeb0;font:11px Consolas,monospace;letter-spacing:2px}h1{font-size:23px;font-weight:650;letter-spacing:-.5px;margin:6px 0}header p{margin:0;color:#95a398;font-size:12px}.close{float:right;background:none;border:0;color:#a7b4ab;font-size:24px}
 nav{display:flex;padding:12px 16px 0;gap:6px}nav button{flex:1;background:none;color:#9ba99f;border:0;padding:10px 3px;border-radius:9px}nav button.active{background:#28382b;color:#b3f2b8;font-weight:650}main{padding:17px 20px;overflow:auto;flex:1;scrollbar-width:thin;scrollbar-color:#425447 transparent}footer{padding:10px 20px;border-top:1px solid #2c382f;color:#798a7e;font-size:11px}
 .eyebrow{color:#a6b9ab;font-size:11px;letter-spacing:1px}.big{font:40px/1.2 Consolas,monospace;color:#b3f2b8;margin:4px 0 2px}.hint{font-size:12px;color:#8fa395;margin:6px 0 16px}.row{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:13px 0}.row label{font-size:13px}.row input[type=number]{width:100px}.checks{display:flex;gap:14px;flex-wrap:wrap;font-size:12px;color:#bac9be}input,select{background:#1d2921;border:1px solid #3b4d40;color:#ecf3ed;border-radius:8px;padding:9px;width:100%;min-width:0}input[type=checkbox]{width:16px;height:16px;accent-color:#b3f2b8}.checks label{display:flex;align-items:center;gap:6px}label.field{display:block;font-size:12px;color:#a5b6aa;margin:12px 0 5px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:12px}.primary{background:#b3f2b8;border:0;color:#112017;border-radius:9px;padding:10px 14px;font-weight:650;width:100%;margin:13px 0}.secondary{background:#213127;border:1px solid #3c5042;color:#cae5d0;border-radius:8px;padding:6px 10px}.card{padding:13px 0;border-top:1px solid #2c382f}.card-top{display:flex;justify-content:space-between;align-items:center;gap:12px}.name{font-weight:650;overflow-wrap:anywhere}.score{font:17px Consolas,monospace;color:#b3f2b8;white-space:nowrap}.excerpt{font-size:12px;color:#a7b6ab;margin:5px 0;overflow-wrap:anywhere}.actions{display:flex;gap:7px;margin-top:9px}.query{font:11px/1.6 Consolas,monospace;color:#93ad9c;overflow-wrap:anywhere;background:#1a251e;border-radius:8px;padding:9px;margin:8px 0}.empty{padding:25px 10px;color:#9bad9f;text-align:center;font-size:13px}.section{border-top:1px solid #2c382f;padding-top:13px;margin-top:15px}.notice{background:#202c23;border-left:2px solid #b3f2b8;padding:10px;color:#b9cabe;font-size:12px}a{color:#b3f2b8}.small{font-size:11px;color:#829b8a}details summary{cursor:pointer;font-size:13px;color:#a6bead}

 #connector{position:fixed;inset:0;width:100vw;height:100vh;z-index:2147483601;pointer-events:none;overflow:visible;display:none}#connector.visible{display:block}#connector path{fill:none;stroke:#bc693a;stroke-width:2.2;filter:drop-shadow(0 2px 3px #bc693a30)}#connector circle{fill:#fff9ee;stroke:#bc693a;stroke-width:2}
 .leader-head{display:flex;gap:7px;align-items:center;margin-bottom:14px}.leader-head>div{flex:1}.leader-head .eyebrow{font-size:16px;font-weight:650;color:#b3f2b8;letter-spacing:0}.leader-caption{font-size:11px;color:#8fa395;margin-top:3px}.icon-button{background:transparent;color:#b6cbbb;border:1px solid #3b5041;border-radius:8px;width:31px;height:30px;font-size:18px}.rank-list{display:flex;flex-direction:column;gap:3px}.rank-row{width:100%;display:flex;align-items:center;text-align:left;gap:8px;background:none;border:1.5px solid transparent;border-radius:9px;padding:9px 6px;color:inherit;min-height:55px}.rank-row:hover{background:#203127}.rank-row.selected{border-color:#bc693a;background:#bc693a18}.rank-number{width:17px;text-align:center;color:#95a898;font:13px Consolas,monospace}.rank-icon{font-size:14px}.rank-copy{flex:1;min-width:0}.rank-name{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:12px;font-weight:650}.rank-excerpt{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#8da294;font-size:11px;margin-top:2px}.rank-values{text-align:right;white-space:nowrap}.rank-views{display:block;color:#89a08f;font:10px Consolas,monospace}.rank-rate{display:block;font:700 13px Consolas,monospace;color:#70bf8d;margin-top:3px}.rank-rate[data-level=hot]{color:#f29069}.rank-rate[data-level=warm]{color:#e9b57a}.rank-tip{color:#8b9f92;font-size:11px;margin:13px 0 0}#topN{width:100px}.filter-note{border:1px solid #3c7853;background:#244a32;color:#b3f2b8;border-radius:9px;font-size:12px;padding:9px;margin-bottom:10px}
 :host([data-theme=light]){color:#493d33} :host([data-theme=light]) #panel{background:#fffcf5;border-color:#e2d9cb;box-shadow:0 14px 42px #493b3324} :host([data-theme=light]) header{border-color:#e8dfd3} :host([data-theme=light]) header small{color:#b36b40} :host([data-theme=light]) header p,:host([data-theme=light]) .leader-caption,:host([data-theme=light]) .hint,:host([data-theme=light]) .rank-tip{color:#8e7d6d} :host([data-theme=light]) nav button{color:#937e6c} :host([data-theme=light]) nav button.active{color:#a35428;background:#f4e6d8} :host([data-theme=light]) .leader-head .eyebrow{color:#6a5140} :host([data-theme=light]) .icon-button{color:#a75e31;border-color:#e7d5c5} :host([data-theme=light]) .rank-row:hover{background:#f6eee3} :host([data-theme=light]) .rank-row.selected{background:#f3e6d9} :host([data-theme=light]) .rank-number,:host([data-theme=light]) .rank-excerpt,:host([data-theme=light]) .rank-views{color:#958272} :host([data-theme=light]) .rank-rate[data-level=hot]{color:#bc4926} :host([data-theme=light]) .rank-rate[data-level=warm]{color:#b77134} :host([data-theme=light]) .rank-rate{color:#32885b} :host([data-theme=light]) .section,:host([data-theme=light]) .card,:host([data-theme=light]) footer{border-color:#e6dccf} :host([data-theme=light]) input,:host([data-theme=light]) select{background:#fffdfa;color:#574434;border-color:#dfd0bf} :host([data-theme=light]) label,:host([data-theme=light]) .checks,:host([data-theme=light]) .eyebrow,:host([data-theme=light]) details summary{color:#80664f} :host([data-theme=light]) .secondary{background:#f5eadd;border-color:#e5cfb9;color:#965a2f} :host([data-theme=light]) .query{background:#f4eee3;color:#7e6b57} :host([data-theme=light]) .big,:host([data-theme=light]) a{color:#9c5930} :host([data-theme=light]) .primary,:host([data-theme=light]) #launch{background:#b66b3d;color:white} :host([data-theme=light]) .filter-note{background:#e2f4e9;color:#227957;border-color:#b6dfc8} :host([data-theme=light]) .close{color:#9c6a48}


 #panel{width:410px}main{overscroll-behavior:contain} :host{color-scheme:dark}:host([data-theme=light]){color-scheme:light} .rank-row{min-height:40px;padding:8px 5px;gap:6px}.rank-author{width:66px;flex-shrink:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:11px;font-weight:650}.rank-preview{flex:1;min-width:28px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:11px;color:#8da294}.rank-row>.rank-views{font-size:10px;white-space:nowrap}.rank-row>.rank-rate{font-size:12px;margin:0;white-space:nowrap}.scope-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px;margin:13px 0}.scope-grid label{display:flex;align-items:center;gap:5px}.column-choice{display:flex;align-items:center;gap:9px;padding:7px;border:1px solid #3b5041;border-radius:8px;margin:5px 0;cursor:grab}.column-choice label{display:flex;align-items:center;gap:6px;flex:1;font-size:12px}.column-choice.dragging{opacity:.4}#metricsTip{display:none;position:fixed;z-index:2147483602;width:260px;background:#17241b;color:#e2eee5;border:1px solid #425847;border-radius:12px;box-shadow:0 10px 40px #0005;padding:15px;pointer-events:none}#metricsTip[data-open]{display:block}.tip-title{font-weight:650;font-size:13px;margin-bottom:9px}.tip-grid{display:grid;grid-template-columns:1fr auto;gap:5px;font-size:12px}.tip-grid strong{font:13px Consolas,monospace;color:#b3f2b8}#metricsTip p{font-size:10px;color:#8da294;margin:10px 0 0}:host([data-theme=light]) #metricsTip{background:#fffcf5;color:#574434;border-color:#e3d4c3}:host([data-theme=light]) .tip-grid strong{color:#a45e30}:host([data-theme=light]) .column-choice{border-color:#e6d6c4}:host([data-theme=light]) .rank-preview{color:#958272}


 #launch{cursor:grab;user-select:none}#launch:active{cursor:grabbing}#launch.docked{padding:7px;width:30px;height:42px;border-radius:0 12px 12px 0;font-size:16px;opacity:.72}#launch.docked:hover{opacity:1}.header-tool{float:right;background:none;border:0;color:#a7b4ab;font-size:22px;cursor:pointer;padding:0 7px;line-height:32px}:host([data-theme=light]) .header-tool{color:#9c6a48}#resize{position:absolute;right:3px;bottom:2px;width:22px;height:22px;color:#8caa96;text-align:center;cursor:nwse-resize;touch-action:none;user-select:none}#panel[data-collapsed=true] header{padding:9px 13px;border:0}#panel[data-collapsed=true] h1{font-size:17px;line-height:32px;margin:0}#panel[data-collapsed=true] header small,#panel[data-collapsed=true] header p,#panel[data-collapsed=true] nav,#panel[data-collapsed=true] main,#panel[data-collapsed=true] footer,#panel[data-collapsed=true] #resize{display:none}#panel header{user-select:none}


 .filter-tools{display:flex;gap:10px;margin:8px 0 14px}.filter-tools label{min-width:0;flex:1;font-size:11px;color:#8da294}.filter-tools select{font-size:12px;padding:7px;margin-top:4px}.theme-label{display:inline-flex;align-items:center;gap:5px;margin-right:12px}.theme-label select{font-size:11px;padding:3px;width:82px}.actions{flex-wrap:wrap}:host([data-theme=light]) .filter-tools label{color:#8e7d6d}.compact-choice{display:inline-flex;align-items:center;gap:4px;font-size:11px}.compact-choice input{width:14px;height:14px}footer>div{margin-top:4px}#launch{z-index:2147483603;width:36px;height:36px;display:grid;place-items:center;padding:0;border-radius:12px;border:1px solid #405d4b;background:#192a21;color:#b0d8bc;box-shadow:0 3px 14px #0003;cursor:pointer}#launch:active{cursor:grabbing}#launch:hover{background:#22392b;border-color:#6f9b7b}#launch[aria-expanded=true]{border-color:#9cd0a6;background:#24402d}:host([data-theme=light]) #launch{background:#fffcf5;color:#92623e;border-color:#ded3c2;box-shadow:0 3px 14px #493b3320}:host([data-theme=light]) #launch:hover,:host([data-theme=light]) #launch[aria-expanded=true]{background:#f3e8d8;border-color:#ba966e}#launch.docked{width:27px;height:34px;padding:0;border-radius:0 10px 10px 0;opacity:.8}#launch.docked[data-edge=right]{border-radius:10px 0 0 10px}#launch.docked svg{transform:scale(.85)}#launch.docked:hover{opacity:1}.why-unused{display:none}

 `;
 function mount(){
  const style=document.createElement('style');style.textContent='.why-inline-header{display:inline-flex!important;flex-direction:row!important;align-items:center!important;flex-wrap:nowrap!important;min-width:0;max-width:100%;vertical-align:middle;gap:0}.why-inline-header>:not(.why-follower):not(.why-heat){min-width:0;flex-shrink:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.why-inline-header>.why-follower,.why-inline-header>.why-heat{align-self:center!important;margin-block:0!important;flex-shrink:0!important}.why-follower[data-compact=true]{font-size:10px!important;padding:1px 5px!important;margin-inline:5px!important;border-radius:999px!important}.why-heat[data-compact=true]{font-size:10px!important;padding:2px 6px!important;margin-inline:3px!important}.why-follower-row{display:inline-flex!important;flex-direction:row!important;align-items:center!important;flex-wrap:nowrap!important;max-width:100%;vertical-align:middle}.why-follower-row>.why-follower{align-self:center!important;margin-block:0!important}.why-follower{display:inline-flex;vertical-align:middle;margin:3px 6px;padding:2px 6px;font:11px/1.5 sans-serif;color:#278a48;flex:0 0 auto!important;align-self:flex-start!important;width:max-content!important;max-width:150px;background:rgba(101,184,122,.12);border:1px solid rgba(101,184,122,.25);border-radius:5px;white-space:nowrap}.why-heat{display:inline-flex;align-items:center;white-space:nowrap;gap:3px;font:11px/1.5 sans-serif;color:#2b9f69;border-radius:7px;padding:3px 7px;margin:0 4px;background:rgba(51,170,110,.1)}.why-heat[data-level=hot]{color:#ef665c;background:rgba(239,102,92,.12)}.why-heat[data-level=warm]{color:#ce941e;background:rgba(206,148,30,.12)}.why-follower[hidden]{display:none!important}article.why-hidden{display:none!important}article.why-target{outline:2px solid #bc693a!important;outline-offset:-2px;border-radius:12px!important;box-shadow:0 0 0 4px #bc693a10}.why-heat{font-weight:700!important;border-radius:999px!important;padding:3px 9px!important;margin-inline-start:8px!important}.why-heat[data-level=hot]{color:#b64232!important;background:#f7d7d2!important}.why-heat[data-level=warm]{color:#a45e30!important;background:#f5dfca!important}';document.documentElement.append(style);
  host=document.createElement('div');host.id='why-x-helper';shadow=host.attachShadow({mode:'open'});
  globalThis.WHYDOM.set(shadow,`<style>${styles}</style><button id="launch" aria-label="打开 X 浏览助手" aria-controls="panel" aria-expanded="false"><svg aria-hidden="true" style="width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round;pointer-events:none"><circle cx="10" cy="10" r="7.5"/><path d="M14.5 5.5 12 12 5.5 14.5 8 8 14.5 5.5Z"/></svg></button><svg id="connector" aria-hidden="true"><path id="connectorPath"/><circle id="connectorStart" r="5"/><circle id="connectorEnd" r="5"/></svg><section id="panel" hidden aria-label="X 浏览助手"><header><button id="fold" class="header-tool" aria-label="折叠浏览助手" title="折叠 / 展开">−</button><button id="resetLayout" class="header-tool" aria-label="重置面板布局" title="重置位置和大小">↺</button><button class="close" aria-label="关闭面板">×</button><small>WHY / X HELPER</small><h1>X 浏览助手</h1><p>看账号 · 看热度 · 找好内容</p></header><nav><button data-tab="heat">帖子热度</button><button data-tab="accounts">账号规模</button><button data-tab="search">固定搜索</button></nav><main></main><footer><label class="theme-label">外观 <select id="themeChoice"><option value="light">暖白</option><option value="dark">暗绿</option><option value="auto">跟随 X</option></select></label><label class="compact-choice"><input id="compactLabels" type="checkbox">紧凑标签</label><div>个人免费版 · 无订阅 · 无自动发帖</div></footer><div id="resize" tabindex="0" role="button" aria-label="调整窗口大小" title="拖动调整大小；方向键也可调整">◢</div></section>`);
  document.body.append(host);shadow.getElementById('launch').onclick=()=>{if(Date.now()<suppressLaunchClickUntil){suppressLaunchClickUntil=0;return;}toggle();};shadow.querySelector('.close').onclick=()=>toggle(false);
  shadow.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{tab=b.dataset.tab;editId=null;searchDraft=null;clearSelection();render();});
  window.addEventListener('scroll',queueConnector,true);window.addEventListener('resize',()=>{positionPanel();positionLauncher();queueConnector();});window.addEventListener('scroll',hideMetrics,true);
  shadow.addEventListener('scroll',queueConnector,true);
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&settings.panel){clearSelection();toggle(false);}});
  shadow.getElementById('themeChoice').value=settings.theme||'light';shadow.getElementById('themeChoice').onchange=e=>{settings.theme=e.target.value;applyTheme();saveSettings();};
  shadow.getElementById('compactLabels').checked=settings.compactLabels!==false;shadow.getElementById('compactLabels').onchange=e=>{settings.compactLabels=e.target.checked;saveSettings();};
  applyTheme();installPanelDrag();installLayoutControls();render();
 }
 function toggle(value){hideMetrics();settings.panel=value??!settings.panel;if(settings.panel)settings.collapsed=false;if(!settings.panel)clearSelection();saveSettings();render();}

 function articleById(id){return [...document.querySelectorAll('article[data-testid="tweet"]')].find(a=>tweetInfo(a)?.id===id);}
 function clearSelection(){
  selectedId=null;document.querySelectorAll('article.why-target').forEach(a=>a.classList.remove('why-target'));schedule();
  shadow?.getElementById('connector')?.classList.remove('visible');
  shadow?.querySelectorAll('.rank-row.selected').forEach(r=>{r.classList.remove('selected');r.setAttribute('aria-pressed','false');});
 }
 function selectPost(id){
  if(selectedId===id){clearSelection();return;}
  const article=articleById(id);if(!article){const msg=shadow.querySelector('#jumpStatus');if(msg)msg.textContent='帖子已被 X 回收，请重新滚动加载。';return;}
  clearSelection();selectedId=id;returnPosition={x:window.scrollX,y:window.scrollY};
  article.classList.remove('why-hidden');article.classList.add('why-target');
  shadow.querySelectorAll('.rank-row').forEach(row=>{const selected=row.dataset.jump===id;row.classList.toggle('selected',selected);row.setAttribute('aria-pressed',String(selected));});
  const r=article.getBoundingClientRect();
  if(r.top<90||r.bottom>window.innerHeight-45)article.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'center'});
  queueConnector();
 }
 function queueConnector(){if(!lineFrame)lineFrame=requestAnimationFrame(()=>{lineFrame=0;updateConnector();});}
 function updateConnector(){
  const svg=shadow?.getElementById('connector');if(!svg)return;
  const article=selectedId&&articleById(selectedId),row=selectedId&&shadow.querySelector(`.rank-row[data-jump="${selectedId}"]`);
  if(!article||!row||!settings.panel||tab!=='heat'){svg.classList.remove('visible');if(selectedId&&!article)clearSelection();return;}
  const a=article.getBoundingClientRect(),r=row.getBoundingClientRect(),list=shadow.querySelector('main').getBoundingClientRect();
  if(a.bottom<0||a.top>innerHeight||r.bottom<list.top||r.top>list.bottom){svg.classList.remove('visible');return;}
  // Connect nearest horizontal edges. Keep endpoints visible when a tall post is clipped.
  const onRight=r.left>a.left+a.width/2;
  const x1=onRight?r.left:r.right,x2=onRight?a.right:a.left;
  const y1=Math.max(list.top+8,Math.min(list.bottom-8,r.top+r.height/2));
  const y2=Math.max(85,Math.min(innerHeight-40,a.top+Math.min(38,a.height/2)));
  const span=Math.max(50,Math.abs(x1-x2)*.48),sign=onRight?-1:1;
  const path=`M ${x1} ${y1} C ${x1+sign*span} ${y1}, ${x2-sign*span} ${y2}, ${x2} ${y2}`;
  shadow.getElementById('connectorPath').setAttribute('d',path);
  for(const [name,x,y] of [['connectorStart',x1,y1],['connectorEnd',x2,y2]]){const c=shadow.getElementById(name);c.setAttribute('cx',x);c.setAttribute('cy',y);}
  svg.classList.add('visible');article.classList.add('why-target');
 }

 function render(){
  if(!shadow)return;
  const previousFocus=shadow.activeElement;
  shadow.getElementById('panel').hidden=!settings.panel;positionPanel();positionLauncher();
  shadow.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));
  const main=shadow.querySelector('main');const previousScroll=main.scrollTop,optionsOpen=main.querySelector('#heatOptions')?.open;
  if(tab==='search'&&main.querySelector('#editor')?.open){searchDraft={editId,values:{},checks:{}};for(const id of ['searchName','searchGroup','searchQuery','days','likes','lang','from'])searchDraft.values[id]=main.querySelector('#'+id).value;for(const id of ['follows','original'])searchDraft.checks[id]=main.querySelector('#'+id).checked;}
  if(tab==='heat'){
   const unique=[...new Map(visible.map(t=>[t.id,t])).values()];
   const ranked=unique.map(t=>({t,m:C.metrics(t)})).filter(x=>x.m?.rate!=null&&(!settings.maxAge||Date.now()-x.t.created<=settings.maxAge*3600000)).sort((a,b)=>b.m.rate-a.m.rate);
   globalThis.WHYDOM.set(main,`<div class="leader-head"><div><span class="eyebrow">本页热点</span><div class="leader-caption">${ranked.length} 条已加载 · 按平均热度排序</div></div><button class="icon-button" id="goBack" aria-label="返回定位前的位置" title="返回定位前的位置">↶</button><button class="icon-button" id="openHeatOptions" aria-label="热度榜设置" title="热度榜设置">⚙</button></div>${settings.onlyHot&&settings.scopes.includes(pageScope())?'<div class="filter-note">仅看热帖已开启 · 点击设置可调整</div>':''}<div class="filter-tools"><label>发布时间<select id="maxAge">${[[0,'不限'],[6,'最近 6 小时'],[24,'最近 24 小时'],[72,'最近 3 天'],[168,'最近 7 天']].map(([n,label])=>`<option value="${n}" ${Number(settings.maxAge)===n?'selected':''}>${label}</option>`).join('')}</select></label><label>热度预设<select id="heatPreset"><option value="custom">自定义</option><option value="new">找新热点</option><option value="viral">回看爆帖</option><option value="following">关注流轻筛选</option><option value="all">全部帖子</option></select></label></div><div class="rank-list">${ranked.slice(0,settings.topN||10).map(({t,m},i)=>rankRow(t,m,i)).join('')||'<div class="empty">刷新 X 后继续滚动。<br>页面加载指标后，这里会出现排行榜。</div>'}</div><p class="rank-tip" id="jumpStatus">点一条排名，连线找到对应帖子。</p><details id="heatOptions" class="section"><summary>热度榜设置</summary><div class="checks"><label><input id="onlyHot" type="checkbox" ${settings.onlyHot?'checked':''}>仅看热帖</label></div><p class="hint">流速或累计浏览量，满足任意一项就保留。</p><div class="scope-grid">${Object.entries({home:'首页 / 推荐',list:'列表',profile:'个人主页',status:'帖子详情'}).map(([key,name])=>`<label><input type="checkbox" data-scope="${key}" ${settings.scopes.includes(key)?'checked':''}>${name}</label>`).join('')}</div><div class="row"><label for="topN">显示前几名</label><select id="topN">${[5,10,20,50].map(n=>`<option ${n===(settings.topN||10)?'selected':''}>${n}</option>`).join('')}</select></div><div class="checks"><label><input id="heatToggle" type="checkbox" ${settings.heat?'checked':''}>显示帖子热度标签</label></div><div class="row"><label for="minRate">最低浏览量 / 小时</label><input id="minRate" type="number" min="0" value="${settings.minRate}"></div><div class="row"><label for="minViews">最低累计浏览量</label><input id="minViews" type="number" min="0" value="${settings.minViews}"></div><div class="row"><label for="longRate">长文独立最低流速</label><input id="longRate" type="number" min="0" value="${settings.longRate}"></div><p class="hint">600 字以上算长文；设为 0 时沿用普通阈值。</p><button id="resetFilter" class="secondary">取消全部热度筛选</button><div class="pair"><div><label class="field" for="trending">🚀 上升阈值 /h</label><input id="trending" type="number" min="1" value="${settings.trending}"></div><div><label class="field" for="viral">🔥 爆款阈值 /h</label><input id="viral" type="number" min="1" value="${settings.viral}"></div></div><p class="hint">拖动下方条目调整列顺序；取消勾选可隐藏。</p><div class="column-editor">${orderedColumns().map(key=>`<div class="column-choice" draggable="true" data-column="${key}"><span>⠿</span><label><input type="checkbox" data-column-visible="${key}" ${settings.columns.includes(key)?'checked':''}>${columnNames[key]}</label><button class="icon-button" data-column-up="${key}" aria-label="上移${columnNames[key]}">↑</button></div>`).join('')}</div><p class="hint">平均热度 = 累计浏览量 ÷ 发布至今小时数，不是最近一小时新增量。</p></details>`);
   main.querySelector('#heatToggle').onchange=e=>{settings.heat=e.target.checked;saveSettings();};
   ['minRate','minViews','longRate'].forEach(k=>main.querySelector('#'+k).onchange=e=>{settings[k]=Math.max(0,Number(e.target.value)||0);settings.heatPreset='custom';saveSettings();});
   main.querySelector('#resetFilter').onclick=()=>{settings.onlyHot=false;settings.minRate=settings.minViews=settings.longRate=0;settings.heatPreset='custom';saveSettings();render();};
   main.querySelector('#heatOptions').open=!!optionsOpen;main.scrollTop=previousScroll;
   bindHeatOptions(main);
   main.querySelector('#heatPreset').value=settings.heatPreset||'custom';
   main.querySelector('#maxAge').onchange=e=>{settings.heatPreset='custom';settings.maxAge=Number(e.target.value);saveSettings();render();};
   main.querySelector('#heatPreset').onchange=e=>{
    const presets={new:{onlyHot:true,minRate:1000,minViews:0,maxAge:6},viral:{onlyHot:true,minRate:10000,minViews:100000,maxAge:168},following:{onlyHot:true,minRate:100,minViews:1000,maxAge:24},all:{onlyHot:false,minRate:0,minViews:0,maxAge:0}};
    const preset=presets[e.target.value];if(!preset)return;Object.assign(settings,preset,{longRate:0,heatPreset:e.target.value});settings.scopes=[...new Set([...settings.scopes,pageScope()])];saveSettings();render();
   };
   main.querySelector('#topN').onchange=e=>{settings.topN=Number(e.target.value);saveSettings();render();};
   main.querySelector('#openHeatOptions').onclick=()=>{const options=main.querySelector('#heatOptions');options.open=!options.open;if(options.open)options.scrollIntoView({block:'nearest',behavior:'smooth'});};
   main.querySelector('#goBack').onclick=()=>{const pos=returnPosition;clearSelection();if(pos)window.scrollTo({top:pos.y,left:pos.x,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});render();};
   main.querySelectorAll('[data-jump]').forEach(b=>b.onclick=()=>selectPost(b.dataset.jump));
   queueConnector();
  }else if(tab==='accounts'){
   const list=[...accounts.values()].filter(u=>Date.now()-u.at<30*60000).sort((a,b)=>b.followers-a.followers);
   globalThis.WHYDOM.set(main,`<div class="eyebrow">浏览时读取到的账号</div><div class="big">${list.length}<span style="font-size:13px;color:#93a499"> 个账号</span></div><div class="checks"><label><input id="followerToggle" type="checkbox" ${settings.followers?'checked':''}>在名字附近显示粉丝数</label></div><p class="hint">读取 X 已加载数据，缓存最多30 分钟。列表页缺失时，悬停账号或打开主页可补充数据。</p><input id="accountSearch" placeholder="搜索昵称或 @账号" aria-label="搜索已读取的账号"><div id="accountList"></div><button id="clearAccounts" class="secondary">清除账号缓存</button>`);
   function draw(q=''){
    globalThis.WHYDOM.set(main.querySelector('#accountList'),list.filter(u=>(u.handle+' '+u.name).toLowerCase().includes(q.toLowerCase())).slice(0,60).map(u=>`<div class="card"><div class="card-top"><a class="name" target="_blank" rel="noopener noreferrer" href="https://x.com/${encodeURIComponent(u.handle)}">${esc(u.name)}</a><span class="score">${C.format(u.followers)}</span></div><div class="small">@${esc(u.handle)} · ${u.followers.toLocaleString('zh-CN')} 位粉丝</div></div>`).join('')||'<div class="empty">还没有匹配账号。<br>刷新 X 后滚动信息流或打开账号主页。</div>');
   }draw();main.querySelector('#accountSearch').oninput=e=>draw(e.target.value);
   main.querySelector('#followerToggle').onchange=e=>{settings.followers=e.target.checked;saveSettings();};
   main.querySelector('#clearAccounts').onclick=()=>{accounts.clear();chrome.storage.local.set({whyAccounts:[]});scan();render();};
  }else{
   normalizeSearchGroup();
   globalThis.WHYDOM.set(main,`<div class="eyebrow">你的固定搜索</div><p class="hint">保存一次，之后一键搜索。最近 N 天会按当天日期自动更新。</p><label class="field" for="groupFilter">查看分组</label><select id="groupFilter">${['全部',...new Set(searches.map(s=>s.group||'未分组'))].map(g=>`<option value="${esc(g)}" ${g===settings.searchGroup?'selected':''}>${esc(g)}</option>`).join('')}</select>${searchItems().map(s=>`<div class="card"><div class="small">${s.pinned?'★ 置顶 · ':''}${esc(s.group||'未分组')}</div><div class="name">${esc(s.name)}</div><div class="query">${esc(C.query(s))}</div><div class="actions"><button class="secondary" data-run="${esc(s.id)}">去搜索</button><button class="secondary" data-pin="${esc(s.id)}">${s.pinned?'取消置顶':'置顶'}</button><button class="secondary" data-edit="${esc(s.id)}">编辑</button><button class="secondary" data-delete="${esc(s.id)}">删除</button></div></div>`).join('')}<details class="section" id="editor"><summary>＋ 新增 / 编辑搜索</summary><label class="field" for="searchName">名称</label><input id="searchName" placeholder="例如：AI 新工具"><label class="field" for="searchGroup">分组</label><input id="searchGroup" maxlength="30" placeholder="例如：AI、GitHub、独立开发"><label class="field" for="searchQuery">关键词或 X 高级搜索表达式</label><input id="searchQuery" placeholder='例如：github (开源 OR "open source")'><div class="pair"><div><label class="field" for="days">最近 N 天（0 不限）</label><input id="days" type="number" min="0" max="3650" value="7"></div><div><label class="field" for="likes">最少点赞</label><input id="likes" type="number" min="0" value="20"></div></div><div class="pair"><div><label class="field" for="lang">语言</label><select id="lang"><option value="">不限</option><option value="zh">中文</option><option value="en">英文</option><option value="ja">日文</option></select></div><div><label class="field" for="from">来自账号</label><input id="from" placeholder="@username"></div></div><div class="checks" style="margin-top:13px"><label><input id="follows" type="checkbox">关注的人</label><label><input id="original" type="checkbox">排除转推和回复</label></div><div class="query" id="queryPreview">搜索预览</div><div id="searchError" role="alert" class="hint"></div><button id="saveSearch" class="primary">保存搜索</button></details>`);
   main.querySelector('#groupFilter').onchange=e=>{settings.searchGroup=e.target.value;saveSettings();render();};
   main.querySelectorAll('[data-pin]').forEach(b=>b.onclick=()=>{const item=searches.find(s=>s.id===b.dataset.pin);item.pinned=!item.pinned;chrome.storage.local.set({whySearches:searches});render();});
   main.querySelectorAll('[data-run]').forEach(b=>b.onclick=()=>{const s=searches.find(s=>s.id===b.dataset.run);if(s)location.href='https://x.com/search?q='+encodeURIComponent(C.query(s))+'&src=typed_query&f=live';});
   main.querySelectorAll('[data-delete]').forEach(b=>b.onclick=()=>{if(editId===b.dataset.delete){editId=null;searchDraft=null;main.querySelector('#editor').open=false;}searches=searches.filter(s=>s.id!==b.dataset.delete);chrome.storage.local.set({whySearches:searches});render();});
   function form(){return{id:editId||crypto.randomUUID(),name:main.querySelector('#searchName').value.trim(),group:main.querySelector('#searchGroup').value.trim().slice(0,30)||'未分组',pinned:!!searches.find(s=>s.id===editId)?.pinned,query:main.querySelector('#searchQuery').value.trim(),days:Math.max(0,Math.min(3650,Number(main.querySelector('#days').value)||0)),likes:Math.max(0,Number(main.querySelector('#likes').value)||0),lang:main.querySelector('#lang').value,from:main.querySelector('#from').value.trim(),follows:main.querySelector('#follows').checked,original:main.querySelector('#original').checked};}
   if(searchDraft){editId=searchDraft.editId;main.querySelector('#editor').open=true;for(const [id,value]of Object.entries(searchDraft.values))main.querySelector('#'+id).value=value;for(const [id,value]of Object.entries(searchDraft.checks))main.querySelector('#'+id).checked=value;}
   function preview(){main.querySelector('#queryPreview').textContent=C.query(form())||'请填写关键词或筛选条件';}
   main.querySelectorAll('input,select').forEach(e=>e.addEventListener('input',preview));preview();
   main.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>{const s=searches.find(s=>s.id===b.dataset.edit);editId=s.id;main.querySelector('#editor').open=true;for(const [id,key]of [['searchName','name'],['searchGroup','group'],['searchQuery','query'],['days','days'],['likes','likes'],['lang','lang'],['from','from']])main.querySelector('#'+id).value=s[key]||'';for(const k of ['follows','original'])main.querySelector('#'+k).checked=!!s[k];preview();main.querySelector('#editor').scrollIntoView({block:'start'});});
   main.querySelector('#saveSearch').onclick=()=>{const s=form();const error=main.querySelector('#searchError');if(!s.name||!C.query(s)){error.textContent='请填写搜索名称，以及关键词或筛选条件。';return;}if(s.from&&!C.handle(s.from)){error.textContent='账号格式不正确，请填写 @username。';return;}const i=searches.findIndex(x=>x.id===s.id);if(i>=0)searches[i]=s;else searches.push(s);editId=null;searchDraft=null;main.querySelector('#editor').open=false;chrome.storage.local.set({whySearches:searches});render();};
  }
  if(previousFocus&&!previousFocus.isConnected){const replacement=previousFocus.id?shadow.getElementById(previousFocus.id):previousFocus.dataset.jump?shadow.querySelector(`.rank-row[data-jump="${previousFocus.dataset.jump}"]`):null;replacement?.focus({preventScroll:true});}
 }
 chrome.runtime.onMessage.addListener((msg,sender,sendResponse)=>{
  if(msg?.type!=='WHY_TOGGLE')return false;
  try{if(!document.body){sendResponse({ok:false,error:'X 页面仍在加载，请稍候再打开。'});return false;}if(!host||!host.isConnected){host=null;mount();}toggle();sendResponse({ok:true,open:settings.panel});}
  catch(error){console.error('[X 浏览助手] 打开失败',error);sendResponse({ok:false,error:String(error.message||error)});}
  return false;
 });
 chrome.storage.local.get(['whySettings','whySearches','whyAccounts'],data=>{
  settings={...settings,...data.whySettings};for(const k of ['minRate','minViews','longRate'])settings[k]=Math.max(0,Number(settings[k])||0);settings.topN=[5,10,20,50].includes(Number(settings.topN))?Number(settings.topN):10;
  settings.trending=Math.max(1,Number(settings.trending)||1000);settings.viral=Math.max(settings.trending+1,Number(settings.viral)||10000);settings.columns=Array.isArray(settings.columns)?[...new Set(settings.columns.filter(k=>Object.hasOwn(columnNames,k)))]:Object.keys(columnNames);if(!settings.columns.length)settings.columns=['rate'];settings.scopes=Array.isArray(settings.scopes)?settings.scopes.filter(k=>['home','list','profile','status'].includes(k)):['home'];if(data.whySettings&&data.whySettings.onlyHot===undefined)settings.onlyHot=!!(settings.minRate||settings.minViews||settings.longRate);
  searches=Array.isArray(data.whySearches)?data.whySearches:defaults;
  for(const u of data.whyAccounts||[])if(C.validateUser(u))accounts.set(C.handle(u.handle),u);
  const groups={ai:'AI',github:'GitHub',video:'代码视频',follows:'关注流'};searches=searches.map(s=>({...s,group:s.group||groups[s.id]||'未分组',pinned:!!s.pinned}));if(!['light','dark','auto'].includes(settings.theme))settings.theme='light';settings.maxAge=Math.max(0,Number(settings.maxAge)||0);if(!searches.some(s=>s.group===settings.searchGroup))settings.searchGroup='全部';
  if(!Array.isArray(data.whySearches))chrome.storage.local.set({whySearches:defaults});
  function start(){scan();new MutationObserver(records=>{if(records.some(r=>!host?.contains(r.target)&&!(r.target.nodeType===3?r.target.parentElement:r.target).closest?.('.why-follower,.why-heat,.why-bio')))schedule();}).observe(document.body,{childList:true,characterData:true,attributes:true,attributeFilter:['href','datetime','data-testid'],subtree:true});setInterval(schedule,30000);window.postMessage({type:'WHY_X_HELPER_READY_V1'},location.origin);}
  if(document.body)start();else document.addEventListener('DOMContentLoaded',start,{once:true});
 });
})();
