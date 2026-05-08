module.exports = {
  apps: [
    {
      name: 'finsfree-bot',
      script: 'src/index.js',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      max_memory_restart: '200M',
      // PM2 otomatis akan membaca file .env di directory yang sama
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};
