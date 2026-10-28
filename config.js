// Настройки запуска: какая таблица, какой сайт обновляем, адреса и файлы

const spreadsheets = {
    prod: '1qCQc827CROySaLGj0ecSx4zaV9yS86M4sDA71IPP7E4',
    test: '1xOsKXO0-JE3wvWjx5dSMNCnhxWy4pfDDWdghq3dKp88'
};

// Сайты = листы таблицы.
// baseSite — сайт, версии которого из таблицы являются верхней границей для этого сайта.
// null — сайт эталонный, берёт последние версии с wiki (так обновляется lexpg).
const sites = {
    lexpg: {
        sheetName: 'lexpg',
        baseSite: null,
        originalPackage: 'originalPackage.json',
        updatedPackage: 'updatedPackage.json'
    }
};

module.exports = {
    spreadsheetId: spreadsheets.prod,
    spreadsheets,
    site: sites.lexpg,
    sites,
    keyFile: './libraryUpdaterKey.json',
    wikiApiUrl: 'http://wiki.lex.lan/api.php',
    forumUrl: 'http://forum.lex.lan',
    packageVersionsFile: 'packageVersions.json',
    manualScriptsFile: 'manualScripts.md'
};
