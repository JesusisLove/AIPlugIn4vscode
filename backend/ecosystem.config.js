module.exports = {
  apps: [
    {
      name: 'ai-backend',
      script: 'dist/server.js',
      cwd: '/Users/kazuyoshi/Documents/VSCodePlugIn/backend',
      env: {
        PORT: 3000,
        CLAUDE_PATH: '/Users/kazuyoshi/.local/bin/claude',
        OLLAMA_BASE_URL: 'http://localhost:11434/v1',
        OLLAMA_MODEL: 'gemma4-E4B',
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: '/Users/kazuyoshi/.pm2/logs/ai-backend-error.log',
      out_file: '/Users/kazuyoshi/.pm2/logs/ai-backend-out.log',
      restart_delay: 3000,
    },
  ],
};
