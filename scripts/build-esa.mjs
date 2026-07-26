import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const nextCli = require.resolve('next/dist/bin/next');
const result = spawnSync(process.execPath, [nextCli, 'build'], {
  env: {
    ...process.env,
    ESA_STATIC_EXPORT: '1',
    NEXT_PUBLIC_ESA_PAGES: '1',
  },
  stdio: 'inherit',
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
