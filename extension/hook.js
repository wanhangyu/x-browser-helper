
(()=>{
 'use strict';if(window.__WHY_HOOK__)return;window.__WHY_HOOK__=true;
 const C=window.WHYCore, users=new Map(),tweets=new Map();
 const CHANNEL='WHY_X_HELPER_DATA_V1';
 function emit(batch){window.postMessage({type:CHANNEL,data:batch},location.origin);}
 function accept(json,url=''){
  try{
   const batch=C.extract(json);
   const action=url.match(/\/friendships\/(create|destroy|cancel)\.json(?:\?|$)/)?.[1];
   if(action&&json?.errors)return;
   if(action){const h=C.handle(json?.screen_name||json?.legacy?.screen_name);for(const u of batch.users)if(u.handle===h){u.isFollowing=action==='create'&&u.followRequestSent!==true;u.isFollowingAt=Date.now();if(action!=='create'){u.followRequestSent=false;u.followRequestSentAt=Date.now();}}}
   if(!batch.users.length&&!batch.tweets.length)return;
   batch.users.forEach(u=>{const old=users.get(u.handle);const merged={...old,...u};if(u.followers===null&&old){merged.followers=old.followers;merged.at=old.at;}users.set(u.handle,merged);});batch.tweets.forEach(t=>tweets.set(t.id,t));
   while(users.size>3000)users.delete(users.keys().next().value);
   while(tweets.size>1800)tweets.delete(tweets.keys().next().value);
   emit(batch);
  }catch{/* Unknown X response structure: leave the page untouched. */}
 }
 function allowed(url){try{const u=new URL(url,location.href);return ['x.com','twitter.com','pro.x.com','api.x.com','api.twitter.com'].includes(u.hostname)&&(/\/graphql\//.test(u.pathname)||/^\/i\/api\/1\.1\/friendships\/(create|destroy|cancel)\.json$/.test(u.pathname));}catch{return false;}}
 const nativeFetch=window.fetch;
 window.fetch=function(...args){
  const p=nativeFetch.apply(this,args);
  const url=args[0] instanceof Request?args[0].url:String(args[0]);
  if(allowed(url))p.then(response=>{
   if(response.ok&&response.headers.get('content-type')?.includes('json'))response.clone().json().then(json=>accept(json,url)).catch(()=>{});
  }).catch(()=>{});
  return p;
 };
 const nativeOpen=XMLHttpRequest.prototype.open;
 XMLHttpRequest.prototype.open=function(method,url,...rest){
  this.__whyURL=String(url);return nativeOpen.call(this,method,url,...rest);
 };
 const nativeSend=XMLHttpRequest.prototype.send;
 XMLHttpRequest.prototype.send=function(...args){
  if(allowed(this.__whyURL))this.addEventListener('load',()=>{
   if(this.status<200||this.status>=300)return;
   try{accept(this.responseType==='json'?this.response:JSON.parse(this.responseText),this.__whyURL);}catch{}
  },{once:true});
  return nativeSend.apply(this,args);
 };
 window.addEventListener('message',ev=>{
  if(ev.source===window&&ev.origin===location.origin&&ev.data?.type==='WHY_X_HELPER_READY_V1')emit({users:[...users.values()],tweets:[...tweets.values()]});
 });
})();
