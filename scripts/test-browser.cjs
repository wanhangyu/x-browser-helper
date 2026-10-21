const {spawnSync}=require('node:child_process'),path=require('node:path');
const root=path.resolve(__dirname,'..');
for(const name of ['heat.browser.cjs','reading.browser.cjs','integrations.browser.cjs','regression.browser.cjs']){
 console.log('\nRunning '+name);
 const result=spawnSync(process.execPath,[path.join(root,'tests',name)],{cwd:root,stdio:'inherit'});
 if(result.status!==0)process.exit(result.status||1);
}
