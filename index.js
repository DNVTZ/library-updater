// Обновление версий библиотек сайта: таблица -> wiki -> package.json, таблица и отчёт с ручными SQL-скриптами
const config = require('./config');
const { processLibrary, clearDebugJson, saveJson, saveMarkdown } = require('./wiki');
const { getLibraries, updateVersions } = require('./sheets');
const { updatePackageJson } = require('./package');

async function main() {
    const { spreadsheetId, site } = config;
    if (site.baseSite)
        throw new Error('Обновление по версиям другого сайта пока не реализовано');

    const table = await getLibraries(spreadsheetId, site.sheetName);
    clearDebugJson();
    const { versions, manualScripts } = await collectUpdates(table.libraries);

    saveJson(config.packageVersionsFile, versions);
    updatePackageJson(site.originalPackage, site.updatedPackage, versions);
    await updateVersions(spreadsheetId, site.sheetName, table);
    saveMarkdown(config.manualScriptsFile, buildManualScriptsMarkdown(manualScripts));
    console.log('Готово');
}

// Для каждой библиотеки со ссылкой на wiki находит последнюю версию (записывает в library.version)
// и ручные SQL-скрипты версий между текущей и последней
async function collectUpdates(libraries) {
    const versions = {};
    const manualScripts = [];
    for (const library of libraries) {
        if (!library.wikiUrl)
            continue;
        console.log(`Обрабатывается ${library.name}`);
        try {
            const result = await processLibrary(library.wikiUrl, library.currentVersion, library.key);
            if (!result) {
                console.log(`${library.name} -> секция "Описание версий" не найдена`);
                continue;
            }
            library.version = result.latestVersion;
            versions[library.key] = result.latestVersion;
            if (result.scripts.length) {
                manualScripts.push({
                    library: library.key,
                    currentVersion: library.currentVersion,
                    latestVersion: result.latestVersion,
                    versions: result.scripts
                });
            }
        } catch (e) {
            console.log(`${library.name} -> ${e.message}`);
        }
    }
    return { versions, manualScripts };
}

function buildManualScriptsMarkdown(manualScripts) {
    let md = '# Ручные SQL-скрипты\n\n';
    if (!manualScripts.length)
        return md + 'Ручных SQL-скриптов не найдено.\n';

    for (const library of manualScripts) {
        md += `## ${library.library}\n\n`;
        md += `- Текущая версия: **${library.currentVersion}**\n`;
        md += `- Последняя версия: **${library.latestVersion}**\n\n`;
        for (const version of library.versions) {
            md += `### Версия ${version.version}\n\n`;
            for (const script of version.scripts)
                md += '```sql\n' + script.trim() + '\n```\n\n';
        }
        md += '---\n\n';
    }
    return md;
}

main().catch(error => console.error(error));
