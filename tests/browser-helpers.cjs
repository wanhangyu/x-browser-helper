const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path');
async function launchExtension(folder,viewport){
 const root=path.resolve(__dirname,'..'),base=path.join(root,'artifacts','profiles');
 fs.mkdirSync(base,{recursive:true});fs.mkdirSync(path.join(root,'artifacts','screenshots'),{recursive:true});
 const profile=fs.mkdtempSync(path.join(base,'isolated-'));
 const executable=process.env.X_HELPER_BROWSER_PATH;
 const context=await chromium.launchPersistentContext(profile,{
  ...(executable?{executablePath:executable}:{channel:'chromium'}),
  headless:process.env.HEADED!=='1',
  args:[`--disable-extensions-except=${path.resolve(folder)}`,`--load-extension=${path.resolve(folder)}`],viewport
 });
 const close=context.close.bind(context);
 context.close=async()=>{try{await close();}finally{if(path.dirname(profile)!==base)throw Error('Unexpected test profile path');fs.rmSync(profile,{recursive:true,force:true});}};
 return context;
}
module.exports={launchExtension};
