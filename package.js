const fs = require('fs');

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

function updateDependencies(packageText, versions) {

    return packageText.replace(
        /^(\s*)"([^"]+)":\s*"([^"]+)"([,]?)$/gm,
        (match, indent, name, currentVersion, comma) => {

            const newVersion = versions[name];

            if (!newVersion)
                return match;

            if (compareVersions(newVersion, currentVersion) <= 0)
                return match;

            return `${indent}"${name}": "${newVersion}"${comma}`;
        }
    );
}

function updatePackageJson(
    sourceFile,
    targetFile,
    versions
) {

    let packageText =
        fs.readFileSync(
            sourceFile,
            'utf8'
        );

    packageText =
        updateDependencies(
            packageText,
            versions
        );

    fs.writeFileSync(
        targetFile,
        packageText,
        'utf8'
    );
}

module.exports = {
    updatePackageJson
};