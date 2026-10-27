"""Bundle the shared view with each platform adapter; no dependencies."""
from pathlib import Path
ROOT = Path(__file__).resolve().parent
DIST = ROOT / 'dist'
DIST.mkdir(exist_ok=True)
for name, files in {
    'devos-lightranger-card.js': ['src/view.js', 'src/ha-card.js'],
    'devos-lightranger-pi.js': ['src/view.js', 'src/pi-app.js'],
    'devos-lightranger-view.js': ['src/view.js'],
}.items():
    text = '/* Built from ' + ', '.join(files) + '; edit src/, not dist/. */\n'
    text += '\n'.join((ROOT / f).read_text(encoding='utf-8') for f in files)
    (DIST / name).write_bytes(text.encode('utf-8'))
    print(name)
