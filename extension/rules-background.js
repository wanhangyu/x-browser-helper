(()=>{
 'use strict';
 const URL='https://raw.githubusercontent.com/Icy-Cat/x-viral-monitor/main/src/premium/content-filter/rules.json',ORIGIN='https://raw.githubusercontent.com/*';
 let running;
 async function update(force=false){
  if(running)return running;
  running=(async()=>{
   const {whyExtras:config={},whyRemoteRules:old}=await chrome.storage.local.get(['whyExtras','whyRemoteRules']);
   if(!config.remoteRules)throw Error('远程更新未开启');
   if(!await chrome.permissions.contains({origins:[ORIGIN]}))throw Error('请在远程规则设置中授权来源站点');
   if(!force&&old?.at&&Date.now()-old.at<86400000)return {updated:false,at:old.at};
   const response=await fetch(URL,{credentials:'omit',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000)});
   if(!response.ok)throw Error('规则下载失败：HTTP '+response.status);
   const reader=response.body.getReader();let size=0,text='';const decoder=new TextDecoder();
   try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>128000){await reader.cancel();throw Error('规则文件过大');}text+=decoder.decode(value,{stream:true});}text+=decoder.decode();}finally{reader.releaseLock();}
   const data=WHYExtrasCore.validateRules(JSON.parse(text));
   const latest=(await chrome.storage.local.get('whyExtras')).whyExtras;
   if(!latest?.remoteRules)throw Error('远程更新已关闭');
   const saved={data,at:Date.now(),source:URL};await chrome.storage.local.set({whyRemoteRules:saved});return{updated:true,at:saved.at,count:data.rules.length,skipped:data.skipped};
  })().finally(()=>{running=null;});return running;
 }
 chrome.runtime.onMessage.addListener((message,sender,reply)=>{
  if(sender.id!==chrome.runtime.id)return;
  const settings=sender.url===chrome.runtime.getURL('rules-options.html');
  const xPage=sender.tab&&sender.frameId===0&&/^https:\/\/(x\.com|twitter\.com|pro\.x\.com)\//.test(sender.url||'');
  if(!(settings||xPage)||!['rules-update','rules-open-settings'].includes(message?.type))return;
  (async()=>{if(message.type==='rules-open-settings'){await chrome.tabs.create({url:chrome.runtime.getURL('rules-options.html')});return{opened:true};}return update(settings&&message.force===true);})().then(reply,e=>reply({error:e.message||'规则更新失败，保留原规则'}));return true;
 });
})();
