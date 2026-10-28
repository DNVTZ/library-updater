const axios = require('axios');
const fs = require('fs');
const path = require('path');

function saveDebugJson(fileName, data) {
    const dir = path.join(__dirname, 'debug');
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir);
    }
    fs.writeFileSync(
        path.join(dir, fileName),
        JSON.stringify(data, null, 4),
        'utf8'
    );
}

function saveJson(fileName, data) {
    fs.writeFileSync(
        fileName,
        JSON.stringify(data, null, 4),
        'utf8'
    );
}

function extractPageName(url) {
    const prefix = '/index.php/';
    const pos = url.indexOf(prefix);
    if (pos === -1) {
        throw new Error(`Не удалось определить страницу: ${url}`);
    }
    let pageName = decodeURIComponent(
        url.substring(pos + prefix.length)
    );
    const hashPos = pageName.indexOf('#');
    if (hashPos !== -1) {
        pageName = pageName.substring(0, hashPos);
    }
    return pageName;
}

async function getWikiText(pageUrl) {
    const pageName = extractPageName(pageUrl);
    const apiUrl =
        'http://wiki.lex.lan/api.php' +
        '?action=query' +
        '&prop=revisions' +
        '&rvprop=content' +
        '&format=json' +
        '&titles=' +
        encodeURIComponent(pageName);
    const response = await axios.get(apiUrl);
    const pages = response.data.query.pages;
    const pageId = Object.keys(pages)[0];
    return pages[pageId].revisions[0]['*'];
}

function extractLatestVersion(wikiText) {
    // сначала оставляем только раздел с версиями
    let versionsText = extractVersionsSection(wikiText);
    if (!versionsText)
        return null;
    versionsText = versionsText.replace(
        /НЕ БРАТЬ[\s\S]*?Проект релиза[^\n]*\n?/gi,
        ''
    );
    versionsText = versionsText.replace(
        /Проект релиза[^\n]*\n?/gi,
        ''
    );
    const versions = parseVersions(versionsText);
    if (!versions.length)
        return null;
    return versions[0].version;
}

function extractVersionsSection(wikiText) {
    const marker = /^==\s*Описание версий(?: на платформе 8\.4| прикладной библиотеки)?\s*==/m;
    const match = wikiText.match(marker);
    if (!match) {
        return null;
    }
    return wikiText.substring(match.index);
}

function parseVersions(versionsText) {
    const regex = /^===\s*(?:Версия|Релиз)\s+(\d+\.\d+\.\d+(?:-(?:\d+|beta\.\d+))?).*?===\s*$/gm;
    const matches = [...versionsText.matchAll(regex)];
    const versions = [];
    for (let i = 0; i < matches.length; i++) {
        const match = matches[i];
        const start = match.index;
        const end = i + 1 < matches.length
            ? matches[i + 1].index
            : versionsText.length;
        const block = versionsText
            .substring(start, end)
            .trim();
        versions.push({
            version: match[1],
            text: block,
            manualScripts: extractManualScripts(block)
        });
    }
    return versions;
}

function compareVersions(a, b) {
    const aParts = a.split('.').map(Number);
    const bParts = b.split('.').map(Number);
    const length = Math.max(aParts.length, bParts.length);
    for (let i = 0; i < length; i++) {
        const av = aParts[i] || 0;
        const bv = bParts[i] || 0;
        if (av > bv)
            return 1;
        if (av < bv)
            return -1;
    }
    return 0;
}

function filterVersions(versions, currentVersion) {
    return versions.filter(version => {
        return compareVersions(
            version.version,
            currentVersion
        ) >= 0;
    });
}

function extractManualScripts(text) {
    const scripts = [];
    const sourceBlocks = [
        ...text.matchAll(
            /<source[^>]*>([\s\S]*?)<\/source>/g
        )
    ];

    for (const block of sourceBlocks) {
        const code = block[1].trim();
        if (!code)
            continue;
        const lower = code.toLowerCase();
        const isSql = /^\s*(alter|update|insert|delete|create|drop|truncate)\b/im.test(code);
        if (isSql) {
            scripts.push(
                cleanScript(code)
            );
        }
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

function saveMarkdown(fileName, text) {
    fs.writeFileSync(
        fileName,
        text,
        'utf8'
    );
}

function trimVersionsToCurrent(versions, currentVersion) {
    const index = versions.findIndex(
        version => version.version === currentVersion
    );
    if (index === -1) {
        return versions;
    }
    return versions.slice(0, index + 1);
}

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
        if (
            inFunctionalChanges &&
            /'''\s*Необходимые действия\s*:?\s*'''/i.test(line)
        ) {
            inFunctionalChanges = false;
            result.push(line);
            continue;
        }
        // Внутри "Изменения функционала"
        if (inFunctionalChanges) {

            // Оставляем только строки с <code>
            if (/<code\b[^>]*>[\s\S]*?<\/code>/i.test(line)) {
                result.push(line);
            }
            continue;
        }
        // Не сохраняем пустые строки
        if (!line.trim()) {
            continue;
        }
        // Строки с typicalticket считаем заявками,
        // если в них нет <code>...</code>
        const hasTypicalTicket =
            /\[(?:https?:\/\/)?(?:erp-office|desk)\.lexema\.ru\/#\/view\/typicalticket\/\d+\s+\d+\]/i.test(line);

        const hasCode =
            /<code\b[^>]*>[\s\S]*?<\/code>/i.test(line);
        if (hasTypicalTicket && !hasCode) {
            continue;
        }
        // Остальной текст оставляем как есть
        result.push(line);
    }
    return result;
}

async function processLibrary(wikiUrl, currentVersion, libraryName) {
    const wikiText =
        await getWikiText(wikiUrl);
    const versionsSection =
        extractVersionsSection(wikiText);
    if (!versionsSection) {
        return null;
    }
    const rawVersions =
        parseVersions(versionsSection);
    const trimmedVersions =
        trimVersionsToCurrent(
            rawVersions,
            currentVersion
        );

    saveDebugJson( `${libraryName.replace(/"/g, '')}.json`,
        {
            currentVersion,
            versions: trimmedVersions.map(version => ({
                version: version.version,
                text: cleanVersionText(
                    version.text.split('\n')
                )
            }))
        }
    );
        
    const latestVersion =
        extractLatestVersion(wikiText);
    const scripts =
        trimmedVersions
            .filter(v => v.manualScripts.length)
            .map(v => ({
                version: v.version,
                scripts: v.manualScripts
            }));

    return {
        latestVersion,
        trimmedVersions,
        scripts
    };
}

module.exports = {
    processLibrary,
    saveJson,
    saveDebugJson,
    saveMarkdown
};