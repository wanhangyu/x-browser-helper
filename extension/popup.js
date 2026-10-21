const button=document.getElementById('open'),status=document.getElementById('status');
button.onclick=()=>{
 button.disabled=true;status.textContent='正在连接 X 页面…';
 chrome.tabs.query({active:true,currentWindow:true},tabs=>{
  const t=tabs[0];
  if(!t?.url||!/^https:\/\/(?:x\.com|twitter\.com|pro\.x\.com)\//.test(t.url)){
   status.textContent='请先在当前标签页打开 x.com/home。';button.disabled=false;return;
  }
  chrome.tabs.sendMessage(t.id,{type:'WHY_TOGGLE'},response=>{
   const error=chrome.runtime.lastError;button.disabled=false;
   if(error){status.textContent='页面脚本尚未连接：请先到扩展管理页重新加载本插件，再刷新 X。';return;}
   status.textContent=response?.ok?(response.open===false?'已收起，点击“X 助手”标签可展开。':'已展开 X 浏览助手。'):('打开失败：'+(response?.error||'页面没有返回确认，请重新加载插件后刷新 X。'));
  });
 });
};
window.addEventListener('error',event=>{status.textContent='插件错误：'+event.message;button.disabled=false;});

const readingDefaults={bios:false,hideUnread:false,hideLeft:false,hideRight:false};
chrome.storage.local.get('whyReading',data=>{
 const reading={...readingDefaults,...data.whyReading};if(reading.profileRowsVersion!==1)reading.bios=false;
 for(const key of Object.keys(readingDefaults)){
  const input=document.getElementById(key);input.checked=!!reading[key];
  input.onchange=()=>{reading[key]=input.checked;reading.profileRowsVersion=1;chrome.storage.local.set({whyReading:reading},()=>{status.textContent=chrome.runtime.lastError?'设置保存失败，请重试。':'阅读设置已保存，X 页面立即生效。';});};
 }
});
