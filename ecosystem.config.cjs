const path = require('path');

const projectRoot = __dirname;
const reposRoot = process.env.STREAM_REPOS_ROOT
  || path.join(projectRoot, '..', 'VirtualBeing-Hub');
const stateDir = process.env.STREAM_SYNC_STATE_DIR
  || path.join(projectRoot, 'logs', 'state');

module.exports = {
  apps: [
    {
      name: 'sync-livers-cron',
      script: 'scripts/sync-cron-runner.mjs',
      cwd: projectRoot,
      interpreter: 'node',
      cron_restart: '0 4 * * *',
      autorestart: true,
      instances: 1,
      watch: false,
      max_memory_restart: '1G',
      restart_delay: 10000,
      kill_timeout: 30000,
      windowsHide: true,
      env: {
        NODE_ENV: 'production',
        STREAM_REPOS_ROOT: reposRoot,
        STREAM_SYNC_STATE_DIR: stateDir,
        STREAM_SYNC_RETRY_MINUTES: process.env.STREAM_SYNC_RETRY_MINUTES || '5,15,30,60',
        STREAM_GIT_RETRY_ATTEMPTS: process.env.STREAM_GIT_RETRY_ATTEMPTS || '4',
        STREAM_GIT_RETRY_DELAY_MS: process.env.STREAM_GIT_RETRY_DELAY_MS || '5000',
      },
      error_file: path.join(projectRoot, 'logs', 'sync-livers-error.log'),
      out_file: path.join(projectRoot, 'logs', 'sync-livers-out.log'),
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
    },
  ],
};
