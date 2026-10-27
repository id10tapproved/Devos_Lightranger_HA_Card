import {fileURLToPath} from 'node:url';
import {readFileSync, readdirSync} from 'node:fs';
import {strict as assert} from 'node:assert';
import {execFileSync} from 'node:child_process';
const root = new URL('../', import.meta.url);
const read = p => readFileSync(new URL(p, root), 'utf8');
const manifest = JSON.parse(read('hacs.json'));
assert.equal(manifest.filename, 'devos-lightranger-card.js');
assert.equal(manifest.content_in_root, false);
assert.equal(manifest.render_readme, true);
assert.ok(!manifest.zip_release);
const targets = {
  'devos-lightranger-card.js': ['src/view.js', 'src/ha-card.js'],
  'devos-lightranger-pi.js': ['src/view.js', 'src/pi-app.js'],
  'devos-lightranger-view.js': ['src/view.js']
};
for (const [name, sources] of Object.entries(targets)) {
  const built = read('dist/' + name);
  const expected = '/* Built from ' + sources.join(', ') + '; edit src/, not dist/. */\n' +
    sources.map(read).join('\n');
  assert.equal(built, expected, name + ' must match source');
  assert.doesNotMatch(built, /^\s*(?:import\s|export\s)/m, 'Bundle must be self-contained');
  execFileSync(process.execPath, ['--check', fileURLToPath(new URL('dist/' + name, root))], {stdio:'inherit'});
}
for (const file of readdirSync(new URL('src/', root))) {
  if (file.endsWith('.js')) execFileSync(process.execPath,
    ['--check', fileURLToPath(new URL('src/' + file, root))], {stdio:'inherit'});
}
assert.match(read('examples/hacs-resources.yaml'), /hacsfiles\/devos-lightranger-card\/devos-lightranger-card\.js/);
console.log('Manifest, installation layout, source/bundle parity and JavaScript syntax passed');
