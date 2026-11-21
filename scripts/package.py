"""Package the same standalone runtime for desktop, iOS and Android."""
import hashlib
import json
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

root = Path(__file__).resolve().parent.parent
manifest = json.loads((root / 'plugin.json').read_text())
assert manifest['main'] == 'index.js'
assert manifest['version'] == json.loads((root / 'package.json').read_text())['version']
# Public-file allowlist excludes local settings, credentials and test artifacts.
files = ['plugin.json', 'index.js', 'locales/zh-CN.json', 'README.md',
         'LICENSE', 'NOTICE.md', 'PyBodian-reference.LICENSE']
with ZipFile(root / 'plugin.zip', 'w', compression=ZIP_DEFLATED) as archive:
    for name in files:
        archive.write(root / name, name)
with ZipFile(root / 'plugin.zip') as archive:
    assert archive.testzip() is None
    assert set(archive.namelist()) == set(files)
print(f"plugin.zip: v{manifest['version']}, {len(files)} files")
print('SHA-256:', hashlib.sha256((root / 'plugin.zip').read_bytes()).hexdigest())
