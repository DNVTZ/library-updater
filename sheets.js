const { google } = require('googleapis');

const auth = new google.auth.GoogleAuth({
    keyFile: './libraryUpdaterKey.json',
    scopes: [
        'https://www.googleapis.com/auth/spreadsheets'
    ]
});

async function getLibraries(spreadsheetId, sheetName) {

    const client = await auth.getClient();

    const sheets = google.sheets({
        version: 'v4',
        auth: client
    });

    const response = await sheets.spreadsheets.get({
        spreadsheetId,
        ranges: [`${sheetName}!B:ZZ`],
        includeGridData: true
    });

    const rows = response.data.sheets[0].data[0].rowData;

    const libraries = [];

    const dateRow = rows[1].values;

    let sourceColumn = dateRow.length - 1;

    while (
        sourceColumn > 0 &&
        !dateRow[sourceColumn]?.formattedValue
    ) {
        sourceColumn--;
    }

    const today = new Date();

    const todayString =
        `${today.getDate().toString().padStart(2, '0')}.${(today.getMonth() + 1).toString().padStart(2, '0')}.${today.getFullYear()}`;

    let targetColumn = sourceColumn;

    for (let column = 1; column < dateRow.length; column++) {

        if (dateRow[column]?.formattedValue === todayString) {
            targetColumn = column;
            break;
        }
    }

    if (targetColumn === sourceColumn) {
        targetColumn = sourceColumn + 1;
    }

    for (let row = 2; row < rows.length; row++) {

        const cells = rows[row].values;

        if (!cells || !cells.length)
            continue;

        const name = cells[0]?.formattedValue;
        const wikiUrl = cells[0]?.hyperlink;
        const currentVersion = cells[sourceColumn]?.formattedValue;

        if (!name || name.toLowerCase() === 'конец')
            break;

        libraries.push({
            name,
            wikiUrl,
            currentVersion,
            sourceColumn,
            targetColumn,
            rowIndex: row
        });
    }

    return libraries;
}

async function updateVersions( spreadsheetId, sheetName, libraries ) {
    const client = await auth.getClient();

    const sheets = google.sheets({
        version: 'v4',
        auth: client
    });

    const spreadsheet =
        await sheets.spreadsheets.get({
            spreadsheetId,
            ranges: [sheetName],
            fields: 'sheets(properties(sheetId,title))'
        });

    const sheet =
        spreadsheet.data.sheets.find(
            sheet => sheet.properties.title === sheetName
        );

    const sheetId =
        sheet.properties.sheetId;

    const targetColumn =
        libraries[0].targetColumn + 1;

    const sourceColumn =
        libraries[0].sourceColumn + 1;

    const requests = [];

    if (targetColumn > sourceColumn) {

        requests.push({
            insertDimension: {
                range: {
                    sheetId,
                    dimension: 'COLUMNS',
                    startIndex: targetColumn,
                    endIndex: targetColumn + 1
                },
                inheritFromBefore: true
            }
        });
    }

    requests.push({
        updateCells: {
            rows: [{
                values: [{
                    userEnteredValue: {
                        stringValue: new Date().toLocaleDateString('ru-RU')
                    }
                }]
            }],
            fields: 'userEnteredValue',
            start: {
                sheetId,
                rowIndex: 1,
                columnIndex: targetColumn
            }
        }
    });

    for (const library of libraries) {
        if (library.version) {
            requests.push({
                updateCells: {
                    rows: [{
                        values: [{
                            userEnteredValue: {
                                stringValue: library.version
                            }
                        }]
                    }],
                    fields: 'userEnteredValue',
                    start: {
                        sheetId,
                        rowIndex: library.rowIndex,
                        columnIndex: targetColumn
                    }
                }
            });
        } else {
            requests.push({
                copyPaste: {
                    source: {
                        sheetId,
                        startRowIndex: library.rowIndex,
                        endRowIndex: library.rowIndex + 1,
                        startColumnIndex: sourceColumn,
                        endColumnIndex: sourceColumn + 1
                    },
                    destination: {
                        sheetId,
                        startRowIndex: library.rowIndex,
                        endRowIndex: library.rowIndex + 1,
                        startColumnIndex: targetColumn,
                        endColumnIndex: targetColumn + 1
                    },
                    pasteType: 'PASTE_VALUES'
                }
            });
        }
    }

    await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
            requests
        }
    });
}

module.exports = {
    getLibraries,
    updateVersions
};