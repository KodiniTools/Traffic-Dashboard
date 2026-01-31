module.exports = {
  apps: [
    {
      name: 'traffic-dashboard-api',
      script: 'backend/server.js',
      cwd: '/var/www/traffic-dashboard',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '200M',
      env: {
        NODE_ENV: 'production',
        PORT: 3847,
        // WICHTIG: Ändere diesen API-Key!
        DASHBOARD_API_KEY: 'dein-super-sicherer-api-key-hier-aendern'
      },
      error_file: '/var/log/pm2/traffic-dashboard-error.log',
      out_file: '/var/log/pm2/traffic-dashboard-out.log',
      time: true
    }
  ]
};
