
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
      if(!tweets.get(id)?.invalid) tweets.set(id,{id,handle:author?.handle||'',name:author?.name||'',text:String(note||l.full_text||'').slice(0,100000),truncated:String(note||l.full_text||'').length>100000,urls:(v.note_tweet?.note_tweet_results?.result?.entity_set?.urls||l.entities?.urls||[]).slice(0,100).map(e=>({url:String(e.url||'').slice(0,500),expanded_url:String(e.expanded_url||'').slice(0,2000)})),media:(l.extended_entities?.media||l.entities?.media||[]).slice(0,20).map(e=>({type:e.type,url:String(e.media_url_https||'').slice(0,2000),alt:String(e.ext_alt_text||'').slice(0,1000)})),created:date,views:invalid?null:first(v.views?.count,l.views_count,v.public_metrics?.impression_count),invalid,quotedId:/^\d{1,30}$/.test(quotedId)?quotedId:null,likes:first(l.favorite_count),reposts:first(l.retweet_count),replies:first(l.reply_count),bookmarks:first(l.bookmark_count),at:now});
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
