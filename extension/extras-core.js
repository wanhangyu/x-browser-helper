/* X Browser Helper. Rule schema adapted from Icy-Cat/x-viral-monitor (MIT). */
(function(root){
 'use strict';
 const fields=['content','name','bio','location','url','handle'];
 // Remote files are data, never executable scripts. Reject looping groups,
 // backreferences and assertions; limit both pattern and input size.
 function safePattern(value){return typeof value==='string'&&value.length>0&&value.length<=700&&!/\\[1-9]|\(\?|\)[*+?{]|(?:[*+?]|\{\d+(?:,\d*)?\})\s*[*+?{]/.test(value);}
 function validateRules(data){
  if(!data||!Array.isArray(data.rules)||data.rules.length>100)throw Error('规则格式不正确，最多支持 100 条');
  const ids=new Set(),rules=[];let skipped=0;
  for(const row of data.rules){
   if(!row||typeof row.id!=='string'||row.id.length>100||ids.has(row.id)||!fields.includes(row.field)||!['regex','keyword','short-symbol'].includes(row.type)){skipped++;continue;}
   if(row.type==='regex'){if(!safePattern(row.value)){skipped++;continue;}try{new RegExp(row.value,'iu');}catch{skipped++;continue;}}
   if(row.type==='keyword'&&(typeof row.value!=='string'||!row.value.trim()||row.value.length>200)){skipped++;continue;}
   rules.push({id:row.id,type:row.type,field:row.field,value:String(row.value||'').slice(0,700),severity:String(row.severity||'high').slice(0,20)});ids.add(row.id);
  }
  if(!rules.length)throw Error('没有可安全使用的规则，继续保留原规则');
  const levels={};for(const name of ['light','standard','strict'])levels[name]=Array.isArray(data.levels?.[name])?data.levels[name].filter(id=>ids.has(id)):rules.map(r=>r.id);
  return {version:String(data.version||'1').slice(0,40),rules,levels,skipped};
 }
 function compile(data,level='light'){
  const allowed=new Set(data.levels[level]||[]);
  return data.rules.filter(r=>allowed.has(r.id)).map(r=>({...r,test:r.type==='regex'?new RegExp(r.value,'iu'):null}));
 }
 function customRules(value){
  const names={'正文':'content','作者':'handle','昵称':'name','简介':'bio','链接':'url'};
  return String(value||'').split('\n').map(s=>s.trim()).filter(s=>s&&!s.startsWith('#')).slice(0,100).map((s,i)=>{
   const m=s.match(/^(正文|作者|昵称|简介|链接)[:：](.+)$/);return{id:'custom-'+i,field:m?names[m[1]]:'content',value:(m?m[2]:s).trim().replace(m?.[1]==='作者'?/^@/:/^$/,'').slice(0,200),type:'keyword'};
  }).filter(r=>r.value);
 }
 function match(record,rules){
  for(const rule of rules){const value=String(record[rule.field]||'').slice(0,6000);if(!value)continue;
   const hit=rule.type==='regex'?rule.test.test(value):rule.type==='short-symbol'?value.length<15&&!/[\p{L}\p{N}]/u.test(value):rule.field==='handle'?value.toLowerCase()===rule.value.toLowerCase():value.toLocaleLowerCase().includes(rule.value.toLocaleLowerCase());
   if(hit)return rule.id;
  }return null;
 }
 const safeURL=value=>{try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)?u.href:'';}catch{return '';}};
 const escapeLabel=s=>String(s||'').replace(/[\\`*_[\]<>]/g,'\\$&');
 function bodyText(post){
  let text=String(post.text||'');
  for(const e of (Array.isArray(post.urls)?post.urls:[]).slice(0,100)){if(!e)continue;const url=safeURL(e.expanded_url);if(typeof e.url==='string'&&e.url&&url)text=text.split(e.url).join(url);}
  return text.trim();
 }
 function markdown(post,options={}){
  let text=bodyText(post);
  const media=(Array.isArray(post.media)?post.media:[]).filter(m=>m?.type==='photo'&&safeURL(m.url)).slice(0,20);
  if(options.images!==false)for(const m of media)text+='\n\n!['+escapeLabel(m.alt||'图片')+']('+safeURL(m.url).replace(/\(/g,'%28').replace(/\)/g,'%29')+')';
  const url=/^[a-z0-9_]{1,15}$/i.test(post.handle||'')&&/^\d{1,30}$/.test(String(post.id))?'https://x.com/'+post.handle+'/status/'+post.id:'';
  const date=new Date(post.created),meta=[escapeLabel(post.name||post.handle||'作者')+(post.handle?' (@'+post.handle+')':'')];
  if(Number.isFinite(date.getTime()))meta.push(date.toISOString());if(url)meta.push(url);
  return text.trim()+'\n\n---\n'+meta.join(' · ')+'\n'+(post.truncated?'\n> 正文超过本地保存上限，请打开原帖查看完整内容。\n':'');
 }
 function copyOutput(post,options={}){return options.format==='plain'?bodyText(post)+(post.truncated?'\n\n[正文已截断，请打开原帖查看完整内容。]':''):markdown(post,{images:options.images});}
 function describeRule(id,rules){
  const rule=rules.find(r=>r.id===id),field=({content:'正文',handle:'账号',name:'昵称',bio:'简介',location:'所在地',url:'链接'})[rule?.field]||'内容';
  if(id.startsWith('custom-'))return{label:'命中自定义关键词',detail:field+'匹配「'+String(rule?.value||'').slice(0,80)+'」'};
  const label=/gambling/.test(id)?'疑似博彩推广':/phishing|airdrop/.test(id)?'疑似钓鱼或空投引流':/adult/.test(id)?'疑似成人内容':/telegram|funnel|zhongtui|click-profile|vpn|marketing|invite/.test(id)?'疑似引流推广':/short-symbol/.test(id)?'疑似无意义短回复':'命中反垃圾规则';
  return{label,detail:'根据'+field+'匹配；可能误判，可展开查看或加入保留账号。'};
 }
 const api={safePattern,validateRules,compile,customRules,match,markdown,copyOutput,describeRule,safeURL};
 if(typeof module==='object'&&module.exports)module.exports=api;else root.WHYExtrasCore=api;
})(globalThis);
