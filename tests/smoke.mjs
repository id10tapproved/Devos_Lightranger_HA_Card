// Browser-driven tests use /demo/offline.html. Instructions: python -m http.server 8088
// The actual browser smoke runner is optional; test interactions manually with preview.
import {readFileSync} from 'node:fs';
import {strict as assert} from 'node:assert';
const card=readFileSync(new URL('../dist/devos-lightranger-card.js',import.meta.url),'utf8');
const pi=readFileSync(new URL('../dist/devos-lightranger-pi.js',import.meta.url),'utf8');
assert.match(card,/devos-lightranger-card/);
assert.match(pi,/devos-lightranger-pi/);
assert.match(card,/lightranger-command/);
assert.match(pi,/WebSocket/);
console.log('Bundle smoke tests passed');
