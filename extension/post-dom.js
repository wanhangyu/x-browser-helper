/* Match X's visible author and permalink before attaching a metric. */
(()=>{
 'use strict';
 const author=node=>{
  if(!node)return null;
  for(const link of node.querySelectorAll('a[href]')){try{const url=new URL(link.href,location.href),m=url.pathname.match(/^\/([a-z0-9_]{1,15})\/?$/i);if(url.origin===location.origin&&m)return m[1].toLowerCase();}catch{}}
  return null;
 };
 const quoteRoot=(node,article)=>{
  for(let p=node.parentElement;p&&p!==article;p=p.parentElement){
   // X gives ordinary timestamp anchors role=link too. Only a card containing
   // an author header (or an explicit quote marker) defines a quoted subtree.
   if(p.matches('[data-testid="quoteTweet"]'))return p;
   if(p.matches('[role="link"]')&&p.querySelector('[data-testid="User-Name"], [data-testid="UserName"]'))return p;
  }return null;
 };
 function identify(article){
  const header=[...article.querySelectorAll('[data-testid="User-Name"], [data-testid="UserName"]')].find(n=>!quoteRoot(n,article));
  const h=author(header);if(!h)return null;
  const candidates=[];
  for(const time of article.querySelectorAll('time')){
   if(quoteRoot(time,article))continue;
   const link=time.closest('a[href]');if(!link)continue;
   try{const url=new URL(link.href,location.href),m=url.pathname.match(/^\/([a-z0-9_]{1,15})\/status\/(\d{1,30})(?:\/)?$/i);
    if(url.origin===location.origin&&m&&m[1].toLowerCase()===h)candidates.push({id:m[2],handle:h,time,header});
   }catch{}
  }
  if(new Set(candidates.map(c=>c.id)).size!==1)return null;
  return candidates[0]||null;
 }
 function quotes(article,main,posts){
  const results=[];
  for(const header of article.querySelectorAll('[data-testid="User-Name"], [data-testid="UserName"]')){
   if(header===main.header)continue;
   const root=quoteRoot(header,article),h=author(header);if(!root||!h)continue;
   const times=[...root.querySelectorAll('time')];if(times.length!==1)continue;
   const time=times[0],stamp=Date.parse(time.dateTime);let id;
   const link=time.closest('a[href]');
   if(link){try{const u=new URL(link.href,location.href),m=u.pathname.match(/^\/([^/]+)\/status\/(\d{1,30})\/?$/);if(u.origin===location.origin&&m&&m[1].toLowerCase()===h)id=m[2];}catch{}}
   if(!id)id=posts.get(main.id)?.quotedId;
   const t=posts.get(id);
   if(t&&id!==main.id&&t.handle===h&&Number.isFinite(stamp)&&Math.abs(t.created-stamp)<1000)results.push({id,handle:h,header,time,t});
  }
  return results;
 }
 function promoted(article){return !!article.querySelector('[data-testid="promotedIndicator"], [data-testid="promotedTweet"]');}
 globalThis.WHYPostDOM={identify,quotes,promoted};
})();
