const path = require('path');

const projectRoot = __dirname;

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
      windowsHide: true,
      env: {
        NODE_ENV: 'production',
      },
      error_file: path.join(projectRoot, 'logs', 'sync-livers-error.log'),
      out_file: path.join(projectRoot, 'logs', 'sync-livers-out.log'),
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
    },
  ],
};
