
import * as esbuild from 'esbuild';

const options = {
  entryPoints: ['src/ha-card.js'],
  bundle: true,
  outfile: 'dist/devos-lightranger-card.js',
  format: 'iife',
  platform: 'browser',
  target: ['es2020'],
  minify: false,
  sourcemap: false,
  legalComments: 'none',
  logLevel: 'info',
};

await esbuild.build(options);
