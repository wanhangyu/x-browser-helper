const fs=require('node:fs'),path=require('node:path');
const folder=path.resolve(__dirname,'../extension');
const source=['core.js','dom.js','content.js'].map(name=>fs.readFileSync(path.join(folder,name),'utf8').replace(/\r\n/g,'\n')).join('\n');
fs.writeFileSync(path.join(folder,'content.bundle.js'),source);
console.log('Built content.bundle.js');
