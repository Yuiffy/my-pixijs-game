module.exports = {
  apps: [
    {
      name: 'sync-livers-cron',
      script: 'node',
      args: 'scripts/sync-and-push.mjs',
      cron: '0 4 * * *',
      autorestart: false,
      watch: false,
      max_memory_restart: '1G',
      windowsHide: true,
      env: {
        NODE_ENV: 'production',
      },
      error_file: './logs/sync-livers-error.log',
      out_file: './logs/sync-livers-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
    },
  ],
};
