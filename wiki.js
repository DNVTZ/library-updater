// Загрузка страниц библиотек с wiki и разбор раздела "Описание версий"
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { wikiApiUrl } = require('./config');

//#region Сохранение выгрузок

function saveJson(fileName, data) {
    fs.writeFileSync(fileName, JSON.stringify(data, null, 4), 'utf8');
}

const DEBUG_DIR = path.join(__dirname, 'debug');

function saveDebugJson(fileName, data) {
    if (!fs.existsSync(DEBUG_DIR))
        fs.mkdirSync(DEBUG_DIR);
    saveJson(path.join(DEBUG_DIR, fileName), data);
}

// Удаляет выгрузки прошлого запуска, чтобы в debug остались только библиотеки текущего
function clearDebugJson() {
    if (!fs.existsSync(DEBUG_DIR))
        return;
    for (const fileName of fs.readdirSync(DEBUG_DIR))
        if (fileName.endsWith('.json'))
            fs.unlinkSync(path.join(DEBUG_DIR, fileName));
}

function saveMarkdown(fileName, text) {
    fs.writeFileSync(fileName, text, 'utf8');
}

//#endregion

//#region Загрузка страницы

// http://wiki.lex.lan/index.php/Страница#якорь -> Страница
function extractPageName(url) {
    const prefix = '/index.php/';
    const pos = url.indexOf(prefix);
    if (pos === -1)
        throw new Error(`Не удалось определить страницу: ${url}`);
    return decodeURIComponent(url.substring(pos + prefix.length)).split('#')[0];
}

async function getWikiText(pageUrl) {
    const response = await axios.get(wikiApiUrl, {
        params: {
            action: 'query',
            prop: 'revisions',
            rvprop: 'content',
            format: 'json',
            titles: extractPageName(pageUrl)
        }
    });
    const pages = response.data.query.pages;
    const pageId = Object.keys(pages)[0];
    return pages[pageId].revisions[0]['*'];
}

//#endregion

//#region Разбор версий

// Заголовок версии: "=== Версия 3.1.19 ===", "=== Релиз 3.0.116-6 (спринт ...) ===", "=== Версия 3.0.56-beta.2 ==="
const VERSION_HEADER = /^===\s*(?:Версия|Релиз)\s+(\d+\.\d+\.\d+(?:-(?:\d+|beta\.\d+))?).*?===\s*$/;

// Черновики и версии, которые нельзя ставить: "=== Проект релиза 3.3.32 ===",
// "=== НЕ БРАТЬ ТЕКУЩИЙ СПРИНТ Проект релиза 3.3.37 ===", "=== Версия 3.1.24 (не брать) ==="
const SKIP_HEADER = /не брать|проект релиза/i;

function extractVersionsSection(wikiText) {
    const marker = /^==\s*Описание версий(?: на платформе 8\.4| прикладной библиотеки)?\s*==/m;
    const match = wikiText.match(marker);
    return match ? wikiText.substring(match.index) : null;
}

// Делит раздел на блоки по заголовкам "===" и оставляет только версии, которые можно ставить.
// Порядок как на wiki: сверху самая новая
function parseVersions(versionsText) {
    const versions = [];
    for (const block of versionsText.split(/^(?====[^=])/m)) {
        const header = block.split('\n', 1)[0];
        const match = header.match(VERSION_HEADER);
        if (!match || SKIP_HEADER.test(header))
            continue;
        const text = block.trim();
        versions.push({
            version: match[1],
            text,
            manualScripts: extractManualScripts(text)
        });
    }
    return versions;
}

// SQL из блоков <source>, которые нужно выполнить вручную
function extractManualScripts(text) {
    const scripts = [];
    for (const block of text.matchAll(/<source[^>]*>([\s\S]*?)<\/source>/g)) {
        const code = block[1].trim();
        if (/^\s*(alter|update|insert|delete|create|drop|truncate)\b/im.test(code))
            scripts.push(cleanScript(code));
    }
    return scripts;
}

function cleanScript(script) {
    return script
        // Windows переносы
        .replace(/\r/g, '')
        // HTML
        .replace(/<br\s*\/?>/gi, '\n')
        // wiki code
        .replace(/<code>/gi, '')
        .replace(/<\/code>/gi, '')
        // wiki жирный/курсив
        .replace(/'''/g, '')
        .replace(/''/g, '')
        // HTML entities
        .replace(/&nbsp;/g, ' ')
        .replace(/&quot;/g, '"')
        // лишние пустые строки
        .replace(/\n{3,}/g, '\n\n')
        // пробелы в конце строк
        .replace(/[ \t]+$/gm, '')
        .trim();
}

//#endregion

//#region Выбор версий

// Версии, которые ставятся поверх текущей: от целевой (включительно) до текущей (не включая).
// Опираемся на порядок на wiki, а не на сравнение номеров: ветки на wiki бывают не по порядку
function getVersionsToInstall(versions, currentVersion, targetVersion) {
    const start = versions.findIndex(version => version.version === targetVersion);
    const end = versions.findIndex(version => version.version === currentVersion);
    if (start === -1)
        return [];
    return versions.slice(start, end === -1 ? versions.length : end);
}

//#endregion

//#region Отладочная выгрузка

// Оставляет из текста версии то, что важно при обновлении:
// "Необходимые действия", код из "Изменений функционала" и всё, что не является ссылкой на заявку
function cleanVersionText(lines) {
    const result = [];
    let inFunctionalChanges = false;
    for (const line of lines) {
        // Начало "Изменения функционала"
        if (/'''\s*(?:Изменения|Развитие)\s+функционала\s*:?\s*'''/i.test(line)) {
            inFunctionalChanges = true;
            continue;
        }
        // Конец "Изменения функционала"
        if (inFunctionalChanges && /'''\s*Необходимые действия\s*:?\s*'''/i.test(line)) {
            inFunctionalChanges = false;
            result.push(line);
            continue;
        }
        // Внутри "Изменения функционала" оставляем только строки с <code>
        if (inFunctionalChanges) {
            if (/<code\b[^>]*>[\s\S]*?<\/code>/i.test(line))
                result.push(line);
            continue;
        }
        // Не сохраняем пустые строки
        if (!line.trim())
            continue;
        // Строки с typicalticket считаем заявками, если в них нет <code>...</code>
        const hasTypicalTicket =
            /\[(?:https?:\/\/)?(?:erp-office|desk)\.lexema\.ru\/#\/view\/typicalticket\/\d+\s+\d+\]/i.test(line);
        const hasCode = /<code\b[^>]*>[\s\S]*?<\/code>/i.test(line);
        if (hasTypicalTicket && !hasCode)
            continue;
        // Остальной текст оставляем как есть
        result.push(line);
    }
    return result;
}

//#endregion

// Последняя версия библиотеки на wiki и ручные SQL-скрипты версий, которые нужно поставить.
// null — на странице нет раздела "Описание версий"
async function processLibrary(wikiUrl, currentVersion, libraryName) {
    const versionsSection = extractVersionsSection(await getWikiText(wikiUrl));
    if (!versionsSection)
        return null;

    const versions = parseVersions(versionsSection);
    const latestVersion = versions.length ? versions[0].version : null;
    const versionsToInstall = getVersionsToInstall(versions, currentVersion, latestVersion);

    // выгрузка нужна только по библиотекам, версия которых поднимается
    if (versionsToInstall.length) {
        saveDebugJson(`${libraryName}.json`, {
            currentVersion,
            versions: versionsToInstall.map(version => ({
                version: version.version,
                text: cleanVersionText(version.text.split('\n'))
            }))
        });
    }

    const scripts = versionsToInstall
        .filter(version => version.manualScripts.length)
        .map(version => ({ version: version.version, scripts: version.manualScripts }));

    return { latestVersion, scripts };
}

module.exports = {
    processLibrary,
    clearDebugJson,
    saveJson,
    saveMarkdown
};
