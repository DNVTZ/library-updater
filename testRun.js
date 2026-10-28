// Прогон index.js на тестовой таблице: node testRun.js
// Прод-настройку в config.js не трогает, подменяет таблицу только на время запуска
const config = require('./config');

config.spreadsheetId = config.spreadsheets.test;
if (!config.spreadsheetId || config.spreadsheetId === config.spreadsheets.prod)
    throw new Error('Таблица не тестовая — запуск остановлен');

console.log(`Тестовая таблица: ${config.spreadsheetId}`);
require('./index');
