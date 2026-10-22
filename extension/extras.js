/* Reading, sharing and optional filtering. Adapted ideas/rule schema:
 * Icy-Cat/x-viral-monitor (MIT); see THIRD_PARTY_NOTICES.txt. */
(()=>{
 'use strict';
 const E=globalThis.WHYExtrasCore,D=globalThis.WHYPostDOM;
 const defaults={bookmarks:true,images:true,longImages:true,markdown:true,copyFormat:'markdown',copyImages:true,filter:false,builtin:true,filterLevel:'light',customRules:'',allowAccounts:'',remoteRules:false};
 let options={...defaults},remote=null,rules=[],timer,shareContext=null,toastTimer;
 let stats={folded:0,revealed:0};
 const text=(node,value)=>{if(node.textContent!==value)node.textContent=value;};
 function updateStats(){
  const folded=new Set(),revealed=new Set();for(const article of document.querySelectorAll('article.why-filtered[data-why-filter-post]'))(article.classList.contains('why-filter-revealed')?revealed:folded).add(article.dataset.whyFilterPost);
  for(const id of folded)revealed.delete(id);stats={folded:folded.size,revealed:revealed.size};
  const main=document.getElementById('why-x-helper')?.shadowRoot;
  const summary=main?.querySelector('#contentFilterOptions > summary'),status=main?.getElementById('extra-filterStatus');
  if(summary)text(summary,'内容过滤'+(options.filter?' · '+stats.folded+' 条已折叠':''));
  if(status)text(status,options.filter?'当前已加载帖子：折叠 '+stats.folded+' 条，手动展开 '+stats.revealed+' 条。':'内容过滤已关闭，匹配内容正常显示。');
 }
 const posts=new Map(),users=new Map();
 window.WHYExtrasOptions=options;
 function rebuild(){
  try{const data=options.remoteRules&&remote?.data?E.validateRules(remote.data):E.validateRules(globalThis.WHYBuiltinRules);rules=[...(options.builtin?E.compile(data,options.filterLevel):[]),...E.customRules(options.customRules)];}catch{rules=E.customRules(options.customRules);}
  window.WHYExtrasOptions=options;window.dispatchEvent(new Event('why-extras-options'));schedule();
 }
 function schedule(){if(!timer)timer=setTimeout(()=>{timer=null;scan();},200);}
 function notify(text){let n=document.getElementById('why-extras-toast');if(!n){n=document.createElement('div');n.id='why-extras-toast';n.setAttribute('role','status');document.body.append(n);}n.textContent=text;clearTimeout(toastTimer);toastTimer=setTimeout(()=>n.remove(),3500);}
 function ownText(article,selector){return [...article.querySelectorAll(selector)].find(n=>{for(let p=n.parentElement;p&&p!==article;p=p.parentElement)if(p.matches('[data-testid="quoteTweet"]')||p.matches('[role="link"]')&&p.querySelector('[data-testid="User-Name"],[data-testid="UserName"]'))return false;return true;});}
 function context(article){
  const info=D.identify(article);if(!info)return null;
  const stored=posts.get(info.id),valid=stored&&stored.handle===info.handle&&Date.now()-stored.at<30*60000?stored:null;
  const name=valid?.name||[...info.header.querySelectorAll('a[href]')].find(a=>{try{return new URL(a.href).pathname==='/'+info.handle;}catch{return false;}})?.textContent||info.handle;
  return {article,...info,post:{...(valid||{}),id:info.id,handle:info.handle,name:valid?.name||name,created:valid?.created||Date.parse(info.time.dateTime),text:valid?.text||ownText(article,'[data-testid="tweetText"]')?.innerText||''}};
 }
 function scan(){
  if(!document.body)return;
  for(const article of document.querySelectorAll('article[data-testid="tweet"]')){
   const ctx=context(article);if(!ctx){article.querySelectorAll('.why-bookmark-count,:scope > .why-filter-notice').forEach(n=>n.remove());article.classList.remove('why-filtered','why-filter-revealed');delete article.dataset.whyFilterPost;continue;}
   const bookmark=[...article.querySelectorAll('[data-testid="bookmark"],[data-testid="removeBookmark"]')].find(n=>!n.closest('[data-testid="quoteTweet"]'));
   const old=article.querySelector('.why-bookmark-count');
   if(!options.bookmarks||!bookmark){old?.remove();}else{
    const nativeText=[...bookmark.childNodes].filter(n=>n!==old).map(n=>n.textContent).join('');
    if(/\d/.test(nativeText)){old?.remove();}else{
     let count=bookmark.querySelector('.why-bookmark-count');if(!count){count=document.createElement('span');count.className='why-bookmark-count';bookmark.append(count);}
     const value=Number.isFinite(ctx.post.bookmarks)?globalThis.WHYCore.format(ctx.post.bookmarks):'—';
     if(count.textContent!==value)count.textContent=value;
     count.title=Number.isFinite(ctx.post.bookmarks)?'书签数：'+ctx.post.bookmarks:'尚未读取到书签数';
    }
   }
   let notice=article.querySelector(':scope > .why-filter-notice');
   const user=users.get(ctx.handle),fresh=user&&Date.now()-user.at<30*60000?user:{};
   const allowed=String(options.allowAccounts).split(/[\s,，]+/).map(h=>h.replace(/^@/,'').toLowerCase()).includes(ctx.handle);
   const reason=options.filter&&!allowed&&!D.promoted(article)?E.match({content:ctx.post.text,name:ctx.post.name,handle:ctx.handle,bio:Date.now()-fresh.bioAt<30*60000?fresh.bio:'',location:Date.now()-fresh.locationAt<30*60000?fresh.location:'',url:(Array.isArray(ctx.post.urls)?ctx.post.urls:[]).map(u=>u.expanded_url).join(' ')},rules):null;
   if(!reason){article.classList.remove('why-filtered','why-filter-revealed');notice?.remove();delete article.dataset.whyFilterPost;continue;}
   if(article.dataset.whyFilterPost!==ctx.id){article.classList.remove('why-filter-revealed');article.dataset.whyFilterPost=ctx.id;notice?.remove();notice=null;}
   if(!notice){notice=document.createElement('div');notice.className='why-filter-notice';const label=document.createElement('span'),button=document.createElement('button');button.type='button';notice.append(label,button);button.onclick=e=>{e.preventDefault();e.stopPropagation();article.classList.toggle('why-filter-revealed');text(button,article.classList.contains('why-filter-revealed')?'再次折叠':'显示这条');updateStats();};article.prepend(notice);}
   const description=E.describeRule(reason,rules);article.classList.add('why-filtered');text(notice.firstChild,'@'+ctx.handle+' · '+description.label);notice.firstChild.title=description.detail;
   text(notice.lastChild,article.classList.contains('why-filter-revealed')?'再次折叠':'显示这条');
  }
  updateStats();
  injectMenus();
 }
 function closeMenu(menu){menu.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',code:'Escape',bubbles:true}));}
 async function copy(text){
  try{await navigator.clipboard.writeText(text);return;}catch{}
  const el=document.createElement('textarea'),focused=document.activeElement;el.value=text;el.style.cssText='position:fixed;left:-9999px';document.body.append(el);el.select();const ok=document.execCommand('copy');el.remove();focused?.focus?.();if(!ok)throw Error('复制失败，请允许剪贴板访问后重试');
 }
 function injectMenus(){
  for(const menu of document.querySelectorAll('[role="menu"],[data-testid="Dropdown"]')){
   for(const el of menu.querySelectorAll('[data-why-share]'))if(!options[el.dataset.whyShare])el.remove();
   if(!shareContext||!shareContext.article.isConnected)continue;
   const current=context(shareContext.article);if(!current||current.id!==shareContext.id)continue;
   for(const [key,label] of [['markdown',options.copyFormat==='plain'?'复制正文':'复制为 Markdown']]){
    const existing=menu.querySelector('[data-why-share="'+key+'"]');if(existing){text(existing,label);existing.whyShareContext={...current};continue;}if(!options[key])continue;
    const item=document.createElement('button');item.type='button';item.className='why-share-item';item.dataset.whyShare=key;item.setAttribute('role','menuitem');item.textContent=label;
    item.whyShareContext={...current};
    item.onclick=async event=>{
     event.preventDefault();event.stopPropagation();if(!event.isTrusted)return;
     const captured=item.whyShareContext;
     const fresh=context(captured.article);if(!fresh||fresh.id!==captured.id){notify('帖子已变化，请重新打开分享菜单');return;}
     if(key==='markdown'){try{await copy(E.copyOutput(fresh.post,{format:options.copyFormat,images:options.copyImages}));notify(options.copyFormat==='plain'?'已复制正文':options.copyImages?'已复制 Markdown · 含出处和图片':'已复制 Markdown · 含出处，不含图片');}catch(e){notify(e.message);}}
     closeMenu(menu);
    };
    const last=[...menu.querySelectorAll('[role="menuitem"]')].at(-1);(last?.parentElement||menu).append(item);
   }
  }
 }
 document.addEventListener('click',event=>{
  const button=event.target.closest?.('button,[role="button"]');if(!button||button.dataset.whyShare)return;
  const article=button.closest('article[data-testid="tweet"]');
  if(!article)return;
  const label=(button.getAttribute('aria-label')||'')+' '+(button.getAttribute('data-testid')||'');
  const isShare=/分享|Share|share/i.test(label)||[...button.querySelectorAll('path')].some(p=>/^M17\.53 7\.47/.test(p.getAttribute('d')||''));
  shareContext=isShare?context(article):null;
  if(isShare)setTimeout(injectMenus,0);
 },true);
 window.addEventListener('message',event=>{
  if(event.source!==window||event.origin!==location.origin||event.data?.type!=='WHY_X_HELPER_DATA_V1')return;
  const data=event.data.data;
  for(const row of (Array.isArray(data?.tweets)?data.tweets:[]).slice(0,2000))if(/^\d{1,30}$/.test(String(row.id))&&Number.isFinite(row.at)&&row.at<=Date.now()+60000&&typeof row.text==='string')posts.set(row.id,row);
  for(const row of (Array.isArray(data?.users)?data.users:[]).slice(0,3000))if(/^[a-z0-9_]{1,15}$/i.test(row.handle)&&Number.isFinite(row.at)&&row.at<=Date.now()+60000)users.set(row.handle.toLowerCase(),row);
  while(posts.size>1800)posts.delete(posts.keys().next().value);while(users.size>3000)users.delete(users.keys().next().value);schedule();
 });
 async function save(patch){options={...options,...patch};await chrome.storage.local.set({whyExtras:options});rebuild();}
 function checkbox(parent,key,label){const row=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.id='extra-'+key;input.checked=!!options[key];input.onchange=()=>save({[key]:input.checked});row.append(input,document.createTextNode(label));parent.append(row);}
 function mount(main){
  const section=document.createElement('section');section.className='settings-group';section.id='extraReading';const title=document.createElement('h3');title.textContent='图片与分享';section.append(title);
  const checks=document.createElement('div');checks.className='checks';section.append(checks);
  for(const [key,label]of [['bookmarks','显示书签数'],['images','图片缩放与拖动'],['longImages','长图纵向阅读'],['markdown','分享菜单：显示复制入口']])checkbox(checks,key,label);
  const copyLabel=document.createElement('label');copyLabel.className='field';copyLabel.textContent='复制格式';
  const copyChoice=document.createElement('select');copyChoice.id='extra-copyFormat';for(const [value,label]of [['markdown','Markdown · 带作者与原帖链接'],['plain','纯正文']]){const option=document.createElement('option');option.value=value;option.textContent=label;copyChoice.append(option);}copyChoice.value=options.copyFormat==='plain'?'plain':'markdown';copyLabel.append(copyChoice);section.append(copyLabel);
  const copyChecks=document.createElement('div');copyChecks.className='checks';section.append(copyChecks);checkbox(copyChecks,'copyImages','Markdown 包含图片链接');const imageChoice=copyChecks.querySelector('input');imageChoice.disabled=options.copyFormat==='plain';copyChoice.onchange=()=>{imageChoice.disabled=copyChoice.value==='plain';save({copyFormat:copyChoice.value});};
  const tip=document.createElement('p');tip.className='hint';tip.textContent='图片：Ctrl＋滚轮缩放，放大后拖动；双击切换，0 复位。';section.append(tip);
  const filter=document.createElement('details');filter.id='contentFilterOptions';filter.className='section';const summary=document.createElement('summary');summary.textContent='内容过滤';filter.append(summary);
  const filterStatus=document.createElement('p');filterStatus.id='extra-filterStatus';filterStatus.className='hint';filterStatus.setAttribute('role','status');filterStatus.textContent=options.filter?'当前已加载帖子：折叠 '+stats.folded+' 条，手动展开 '+stats.revealed+' 条。':'内容过滤已关闭，匹配内容正常显示。';filter.append(filterStatus);
  const controls=document.createElement('div');controls.className='checks';filter.append(controls);checkbox(controls,'filter','开启内容过滤（折叠匹配项）');checkbox(controls,'builtin','使用内置反垃圾规则');
  const label=document.createElement('label');label.textContent='过滤强度';label.className='field';const select=document.createElement('select');select.id='extra-filterLevel';for(const [value,text]of [['light','轻度：明显引流'],['standard','标准：更多广告与垃圾内容'],['strict','严格：可能误伤普通讨论']]){const option=document.createElement('option');option.value=value;option.textContent=text;select.append(option);}select.value=options.filterLevel;select.onchange=()=>save({filterLevel:select.value});label.append(select);filter.append(label);
  function area(key,labelText,placeholder){const label=document.createElement('label');label.className='field';label.textContent=labelText;const input=document.createElement('textarea');input.id='extra-'+key;input.rows=key==='customRules'?5:2;input.maxLength=key==='customRules'?20000:2000;input.placeholder=placeholder;input.value=options[key]||'';input.style.cssText='width:100%;box-sizing:border-box;font:inherit;background:transparent;color:inherit;border:1px solid #8293a466;border-radius:8px;padding:8px';input.onchange=()=>save({[key]:input.value});label.append(input);filter.append(label);}
  area('customRules','自定义规则 · 每行一条','正文:抽奖引流\n作者:example\n昵称:推广号\n简介:接广告\n链接:example.com');area('allowAccounts','保留账号 · 不参与内容过滤','@username，一行一个，或用逗号分隔');
  const help=document.createElement('p');help.className='hint';help.textContent='自定义内容按字面匹配，不执行代码或正则。无前缀时匹配正文；最多 100 条。折叠后可单独展开，关闭过滤立即恢复。';filter.append(help);
  const remoteStatus=document.createElement('p');remoteStatus.className='hint';remoteStatus.id='extra-remoteStatus';remoteStatus.textContent=(options.remoteRules?'远程更新已开启':'远程更新默认关闭')+(remote?.at?' · 上次成功 '+new Date(remote.at).toLocaleString():'')+(remote?.data?.skipped?' · '+remote.data.skipped+' 条复杂规则未启用':'');filter.append(remoteStatus);
  const button=document.createElement('button');button.type='button';button.className='secondary';button.id='extra-remoteSettings';button.textContent='远程规则更新与授权 ↗';button.onclick=()=>chrome.runtime.sendMessage({type:'rules-open-settings'}).catch(()=>notify('请重新加载扩展后再试'));filter.append(button);
  const credit=document.createElement('p');credit.className='hint';credit.textContent='图片增强、规则参考并改编自 IcyCat 的 X Viral Monitor（MIT）。';filter.append(credit);
  main.querySelector('#heatOptions').before(section,filter);
  updateStats();
 }
 globalThis.WHYExtras={mount};
 chrome.storage.onChanged.addListener((changes,area)=>{if(area!=='local')return;if(changes.whyExtras)options={...defaults,...changes.whyExtras.newValue};if(changes.whyRemoteRules)remote=changes.whyRemoteRules.newValue;if(changes.whyExtras||changes.whyRemoteRules)rebuild();});
 chrome.storage.local.get(['whyExtras','whyRemoteRules'],data=>{options={...defaults,...data.whyExtras};remote=data.whyRemoteRules;rebuild();if(options.remoteRules)chrome.runtime.sendMessage({type:'rules-update'}).catch(()=>{});});
 function start(){new MutationObserver(records=>{if(records.some(r=>!r.target.closest?.('#why-x-helper,.why-filter-notice,.why-bookmark-count,#why-extras-toast')&&!r.target.parentElement?.closest?.('.why-filter-notice,.why-bookmark-count')))schedule();}).observe(document.body,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['href','datetime','data-testid']});scan();window.postMessage({type:'WHY_X_HELPER_READY_V1'},location.origin);}
 if(document.body)start();else document.addEventListener('DOMContentLoaded',start,{once:true});
})();
