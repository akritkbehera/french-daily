import { build } from 'esbuild';
await build({ entryPoints: ['src/index.ts'], outdir: 'dist', bundle: true, format: 'esm', platform: 'browser', target: 'es2022' });
