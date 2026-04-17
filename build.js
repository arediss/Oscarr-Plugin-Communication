import { build, context } from 'esbuild';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { builtinModules } from 'module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const watch = process.argv.includes('--watch');

const nodeExternals = [
  ...builtinModules,
  ...builtinModules.map((m) => `node:${m}`),
  'fastify',
];

const backendOptions = {
  entryPoints: [resolve(__dirname, 'src/index.ts')],
  outfile: resolve(__dirname, 'dist/index.js'),
  platform: 'node',
  target: 'node20',
  format: 'esm',
  bundle: true,
  minify: false,
  sourcemap: true,
  external: nodeExternals,
  banner: {
    js: `import { createRequire } from 'module'; const require = createRequire(import.meta.url);`,
  },
  logLevel: 'info',
};

const frontendCommon = {
  platform: 'browser',
  target: ['es2022'],
  format: 'esm',
  bundle: true,
  minify: false,
  sourcemap: true,
  jsx: 'automatic',
  jsxImportSource: 'react',
  external: ['react', 'react-dom', 'react/jsx-runtime'],
  logLevel: 'info',
};

const adminOptions = {
  ...frontendCommon,
  entryPoints: [resolve(__dirname, 'frontend/index.tsx')],
  outfile: resolve(__dirname, 'dist/frontend/index.js'),
};

const headerHookOptions = {
  ...frontendCommon,
  entryPoints: [resolve(__dirname, 'frontend/hooks/header.actions.tsx')],
  outfile: resolve(__dirname, 'dist/frontend/hooks/header.actions.js'),
};

if (watch) {
  const ctxBack = await context(backendOptions);
  const ctxAdmin = await context(adminOptions);
  const ctxHook = await context(headerHookOptions);
  await Promise.all([ctxBack.watch(), ctxAdmin.watch(), ctxHook.watch()]);
  console.log('Watching for changes…');
} else {
  await build(backendOptions);
  console.log('Backend built → dist/index.js');
  await build(adminOptions);
  console.log('Frontend (admin) built → dist/frontend/index.js');
  await build(headerHookOptions);
  console.log('Frontend (header.actions hook) built → dist/frontend/hooks/header.actions.js');
}
