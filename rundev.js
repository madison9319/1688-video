const { spawn } = require('child_process');

const env = Object.assign({}, process.env);
env.PATH = 'C:\\Program Files\\nodejs;' + (env.PATH || '');

const child = spawn('"C:\\Program Files\\nodejs\\npm.cmd" run dev -- -p 3014', {
  cwd: __dirname,
  env,
  stdio: 'inherit',
  shell: true,
});

child.on('exit', (code) => process.exit(code));
