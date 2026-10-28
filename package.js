// Сборка нового package.json: поднимаются только версии библиотек и только если новая версия выше.
// Файл правится регуляркой по тексту, а не через JSON.parse, чтобы исходное форматирование
// сохранилось символ в символ
const fs = require('fs');

// Версии вида 3.1.19, 3.1.19-3, 3.0.56-beta.2.
// Суффикс на wiki означает сборку ПОСЛЕ базовой версии (хотфикс), а не пре-релиз:
// 3.1.19 < 3.1.19-1 < 3.1.19-2 < 3.1.20
function compareVersions(a, b) {
    const [aMain, aSuffix = ''] = a.split(/-(.*)/);
    const [bMain, bSuffix = ''] = b.split(/-(.*)/);
    const aNumbers = aMain.split('.').map(Number);
    const bNumbers = bMain.split('.').map(Number);
    for (let i = 0; i < Math.max(aNumbers.length, bNumbers.length); i++) {
        const diff = (aNumbers[i] || 0) - (bNumbers[i] || 0);
        if (diff)
            return Math.sign(diff);
    }
    return compareSuffixes(aSuffix, bSuffix);
}

// Суффиксы сравниваются по частям: числа как числа, текст как текст ("beta.2" -> "beta", "2").
// Пустой суффикс (базовая версия) меньше любого непустого
function compareSuffixes(a, b) {
    const aParts = a.match(/\d+|[^\d.]+/g) || [];
    const bParts = b.match(/\d+|[^\d.]+/g) || [];
    for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
        if (aParts[i] === undefined)
            return -1;
        if (bParts[i] === undefined)
            return 1;
        const bothNumbers = /^\d+$/.test(aParts[i]) && /^\d+$/.test(bParts[i]);
        const diff = bothNumbers ? aParts[i] - bParts[i] : aParts[i].localeCompare(bParts[i]);
        if (diff)
            return Math.sign(diff);
    }
    return 0;
}

// Меняет версию в строках вида `"имя": "версия",`, если для имени есть версия выше текущей.
// Заменяется только сама версия, всё вокруг неё остаётся как было
function updateDependencies(packageText, versions) {
    return packageText.replace(
        /^(\s*"([^"]+)":\s*")([^"]+)("[,]?)$/gm,
        (match, before, name, currentVersion, after) => {
            const newVersion = versions[name];
            if (!newVersion || compareVersions(newVersion, currentVersion) <= 0)
                return match;
            return `${before}${newVersion}${after}`;
        }
    );
}

function updatePackageJson(sourceFile, targetFile, versions) {
    const packageText = fs.readFileSync(sourceFile, 'utf8');
    fs.writeFileSync(targetFile, updateDependencies(packageText, versions), 'utf8');
}

module.exports = {
    updatePackageJson
};
