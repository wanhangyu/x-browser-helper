(()=>{
 const origin='https://raw.githubusercontent.com/*',status=document.getElementById('status');
 async function report(action){try{status.textContent='正在处理…';await action();}catch(e){status.textContent=e.message||'操作失败，保留原设置';}}
 async function update(){const r=await chrome.runtime.sendMessage({type:'rules-update',force:true});if(r?.error)throw Error(r.error);status.textContent='已更新 · '+new Date(r.at).toLocaleString()+(r.count?' · '+r.count+' 条可用规则':'')+(r.skipped?' · '+r.skipped+' 条复杂规则未启用':'');}
 document.getElementById('enable').onclick=()=>report(async()=>{if(!await chrome.permissions.request({origins:[origin]}))throw Error('未授权，远程更新保持关闭');const {whyExtras={}}=await chrome.storage.local.get('whyExtras');await chrome.storage.local.set({whyExtras:{...whyExtras,remoteRules:true}});await update();});
 document.getElementById('update').onclick=()=>report(update);
 document.getElementById('disable').onclick=()=>report(async()=>{const {whyExtras={}}=await chrome.storage.local.get('whyExtras');await chrome.storage.local.set({whyExtras:{...whyExtras,remoteRules:false}});await chrome.permissions.remove({origins:[origin]});status.textContent='远程更新已关闭，过滤使用内置规则；自定义规则保留。';});
 chrome.storage.local.get(['whyExtras','whyRemoteRules'],data=>{status.textContent=(data.whyExtras?.remoteRules?'远程更新已开启':'远程更新已关闭')+(data.whyRemoteRules?.at?' · 上次成功：'+new Date(data.whyRemoteRules.at).toLocaleString():'');});
})();
