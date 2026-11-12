/**
 * Bundle the MCP server into a single executable ESM file with esbuild.
 * Run: node build.mjs   (or `npm run build --workspace @fd/mcp-server`)
 */
import { build } from 'esbuild';
import { chmod, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));

await mkdir(path.join(dir, 'dist'), { recursive: true });

await build({
  entryPoints: [path.join(dir, 'src/index.ts')],
  outfile: path.join(dir, 'dist/index.js'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  minify: false,
  sourcemap: false,
  banner: {
    // Some CJS dependencies expect `require` to exist in the ESM scope.
    js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);",
  },
});

await chmod(path.join(dir, 'dist/index.js'), 0o755);
console.log('built packages/mcp-server/dist/index.js');
