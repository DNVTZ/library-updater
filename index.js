const {
    processLibrary,
    saveJson,
    saveDebugJson,
    saveMarkdown
} = require('./wiki');

const { 
    getLibraries,
    updateVersions
 } = require('./sheets');

const {
    updatePackageJson
} = require('./package');

async function main() {

    const libraries = await getLibraries(
        //'1xOsKXO0-JE3wvWjx5dSMNCnhxWy4pfDDWdghq3dKp88', //тест
        '1qCQc827CROySaLGj0ecSx4zaV9yS86M4sDA71IPP7E4', //прод
        'lexpg'
    );

    const packageJson = {};
    const manualScripts = [];

    for (const library of libraries) {
        if (!library.wikiUrl)
            continue;
        console.log(`Обрабатывается ${library.name}`);
        try {
            const result =
                await processLibrary(
                    library.wikiUrl,
                    library.currentVersion,
                    library.name
                );
            if (!result) {
                console.log(
                    `${library.name} -> секция "Описание версий" не найдена`
                );
                continue;
            }
            packageJson[
                library.name.replace(/"/g, '')
            ] = result.latestVersion;
            if (result.scripts.length) {
                manualScripts.push({
                    library: library.name.replace(/"/g, ''),
                    currentVersion: library.currentVersion,
                    latestVersion: result.latestVersion,
                    versions: result.scripts
                });
            }
        }
        catch (e) {
            console.log(
                `${library.name} -> ${e.message}`
            );
        }
    }

    saveJson(
        'packageVersions.json',
        packageJson
    );

    updatePackageJson(
        'originalPackage.json',
        'updatedPackage.json',
        packageJson
    );

    const librariesWithVersions =
        libraries.map(library => ({
            ...library,
            version: packageJson[
                library.name.replace(/"/g, '')
            ]
        }));

    await updateVersions(
        //'1xOsKXO0-JE3wvWjx5dSMNCnhxWy4pfDDWdghq3dKp88', //тест
        '1qCQc827CROySaLGj0ecSx4zaV9yS86M4sDA71IPP7E4', //прод
        'lexpg',
        librariesWithVersions
    );

    const markdown = buildManualScriptsMarkdown(manualScripts);
    saveMarkdown(
        'manualScripts.md',
        markdown
    );
    console.log('Готово');
}

function buildManualScriptsMarkdown(manualScripts) {
    let md = '# Ручные SQL-скрипты\n\n';
    if (!manualScripts.length) {
        md += 'Ручных SQL-скриптов не найдено.\n';
        return md;
    }

    for (const library of manualScripts) {
        md += `## ${library.library}\n\n`;
        md += `- Текущая версия: **${library.currentVersion}**\n`;
        md += `- Последняя версия: **${library.latestVersion}**\n\n`;

        for (const version of library.versions) {
            md += `### Версия ${version.version}\n\n`;
            for (const script of version.scripts) {
                md += '```sql\n';
                md += script.trim();
                md += '\n```\n\n';
            }
        }

        md += '---\n\n';
    }
    return md;
}

main();