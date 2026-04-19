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

// ── Tailwind CSS step (added by add-tailwind-to-plugin.mjs) ─────────────────
import { spawn, spawnSync } from 'child_process';

const twWatch = process.argv.includes('--watch');
const tailwindArgs = [
  '-c', resolve(__dirname, 'tailwind.config.js'),
  '-i', resolve(__dirname, 'frontend/index.css'),
  '-o', resolve(__dirname, 'dist/frontend/index.css'),
  ...(twWatch ? ['--watch'] : ['--minify']),
];

if (twWatch) {
  // Fire-and-forget in watch mode; the CLI's own watcher owns the lifecycle.
  const twChild = spawn('npx', ['tailwindcss', ...tailwindArgs], { stdio: 'inherit', cwd: __dirname });
  twChild.on('exit', (code) => { if (code !== null && code !== 0) process.exit(code); });
} else {
  const twResult = spawnSync('npx', ['tailwindcss', ...tailwindArgs], { stdio: 'inherit', cwd: __dirname });
  if (twResult.status !== 0) process.exit(twResult.status || 1);
  console.log('Frontend (CSS) built → dist/frontend/index.css');
}
