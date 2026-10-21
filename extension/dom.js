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
