from pathlib import Path
import hashlib
import json
import zipfile

root=Path(__file__).resolve().parent.parent
folder=root/'extension'
manifest=json.loads((folder/'manifest.json').read_text(encoding='utf-8'))
files={'manifest.json','core.js','dom.js','hook.js','post-dom.js','content.js','content.bundle.js','reading.js','follow.js','popup.html','popup.js','translation.js','translation-background.js','translation-options.js','translation-options.html','translation-options.css','LICENSE','THIRD_PARTY_NOTICES.txt','third-party/xpandmax-LICENSE.txt','使用说明.md'}
files.update(manifest['icons'].values())
sources='\n'.join((folder/name).read_text(encoding='utf-8') for name in ['core.js','dom.js','content.js'])
assert (folder/'content.bundle.js').read_text(encoding='utf-8')==sources,'Run npm run build first'
dist=root/'dist';dist.mkdir(exist_ok=True)
target=dist/f"x-browser-helper-{manifest['version']}.zip"
with zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED) as archive:
 for name in sorted(files):
  data=(folder/name).read_bytes()
  info=zipfile.ZipInfo('x-browser-helper/'+name,(2026,1,1,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o100644<<16
  archive.writestr(info,data)
with zipfile.ZipFile(target) as archive:
 assert archive.testzip() is None
 assert len(archive.namelist())==len(files)
 for name in files:assert archive.read('x-browser-helper/'+name)==(folder/name).read_bytes()
digest=hashlib.sha256(target.read_bytes()).hexdigest()
target.with_suffix('.sha256').write_text(f'{digest}  {target.name}\n',encoding='utf-8')
print(f'Verified {len(files)} runtime files; SHA-256 {digest}')
