const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// 1. Копируем файлы окружения (.env)
try {
  fs.copyFileSync('.env', 'apps/web/.env');
  fs.copyFileSync('.env', 'apps/worker/.env');
  console.log('🚀 [Dev] Файлы .env успешно скопированы в приложения.');
} catch (err) {
  console.warn('⚠️ [Dev] Не удалось скопировать .env файлы:', err.message);
}

// Добавляем папку с запущенным node.exe в PATH, чтобы npx/npm/pnpm находились автоматически
const nodeDir = path.dirname(process.execPath);
if (nodeDir) {
  const delimiter = process.platform === 'win32' ? ';' : ':';
  process.env.PATH = `${nodeDir}${delimiter}${process.env.PATH}`;
}

// Проверяем наличие глобального pnpm
let useNpx = false;
try {
  execSync('pnpm -v', { stdio: 'ignore', shell: true });
  console.log('✅ [Dev] Обнаружен глобальный pnpm.');
} catch (e) {
  console.log('⚠️ [Dev] Глобальный pnpm не найден. Будет использован npx pnpm.');
  useNpx = true;
}

// 2. Функция для запуска сервисов
function runService(serviceName, filter) {
  const isWin = process.platform === 'win32';
  
  let cmd;
  let args;
  
  if (useNpx) {
    cmd = isWin ? 'npx.cmd' : 'npx';
    args = ['pnpm', '--filter', filter, 'dev'];
  } else {
    cmd = isWin ? 'pnpm.cmd' : 'pnpm';
    args = ['--filter', filter, 'dev'];
  }
  
  console.log(`📦 [Dev] Запуск сервиса ${serviceName}...`);
  
  const proc = spawn(cmd, args, {
    stdio: 'inherit',
    shell: true
  });

  proc.on('error', (err) => {
    console.error(`❌ [Dev] Ошибка запуска ${serviceName}:`, err.message);
  });

  return proc;
}

const webProcess = runService('Next.js Web App', '@tools/web');
const workerProcess = runService('Background Worker', '@tools/worker');

// 3. Корректное завершение дочерних процессов при выходе (Ctrl+C)
function cleanup() {
  console.log('\n🛑 [Dev] Завершение работы процессов...');
  if (webProcess) webProcess.kill('SIGINT');
  if (workerProcess) workerProcess.kill('SIGINT');
  process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
