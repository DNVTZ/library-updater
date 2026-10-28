// Чтение списка библиотек из Google Sheets и запись столбца с новыми версиями
const { google } = require('googleapis');
const { keyFile } = require('./config');

const auth = new google.auth.GoogleAuth({
    keyFile,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
});

// Индексы внутри диапазона B:ZZ: в колонке 0 (B) названия библиотек со ссылками на wiki,
// в строке 1 даты, со строки 2 библиотеки (до строки "конец")
const DATE_ROW = 1;
const FIRST_LIBRARY_ROW = 2;
// Диапазон начинается с колонки B, поэтому индекс колонки на листе на 1 больше
const RANGE_OFFSET = 1;

async function getSheetsApi() {
    return google.sheets({ version: 'v4', auth: await auth.getClient() });
}

// 28.10.2026
function formatDate(date) {
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    return `${day}.${month}.${date.getFullYear()}`;
}

// Ближайшая слева от column колонка с датой
function findDateColumnBefore(dateRow, column) {
    let result = column - 1;
    while (result > 0 && !dateRow[result]?.formattedValue)
        result--;
    return result;
}

// Библиотеки с текущими версиями и колонки: sourceColumn — откуда брать текущие версии,
// targetColumn — куда писать новые. Если столбец с сегодняшней датой уже есть (повторный запуск),
// пишем в него, иначе добавляем новый после последней даты (isNewColumn)
async function getLibraries(spreadsheetId, sheetName) {
    const sheets = await getSheetsApi();
    const response = await sheets.spreadsheets.get({
        spreadsheetId,
        ranges: [`${sheetName}!B:ZZ`],
        includeGridData: true
    });
    const rows = response.data.sheets[0].data[0].rowData;
    const dateRow = rows[DATE_ROW].values;

    const today = formatDate(new Date());
    const todayColumn = dateRow.findIndex((cell, column) => column > 0 && cell?.formattedValue === today);
    const isNewColumn = todayColumn === -1;
    const targetColumn = isNewColumn ? findDateColumnBefore(dateRow, dateRow.length) + 1 : todayColumn;
    const sourceColumn = findDateColumnBefore(dateRow, targetColumn);

    const libraries = [];
    for (let row = FIRST_LIBRARY_ROW; row < rows.length; row++) {
        const cells = rows[row].values;
        if (!cells || !cells.length)
            continue;
        const name = cells[0]?.formattedValue;
        if (!name || name.toLowerCase() === 'конец')
            break;
        libraries.push({
            name,
            // имя без кавычек — так библиотека называется в package.json
            key: name.replace(/"/g, ''),
            wikiUrl: cells[0]?.hyperlink,
            currentVersion: cells[sourceColumn]?.formattedValue,
            rowIndex: row
        });
    }

    return { libraries, sourceColumn, targetColumn, isNewColumn };
}

function setCellRequest(sheetId, rowIndex, columnIndex, value) {
    return {
        updateCells: {
            rows: [{ values: [{ userEnteredValue: { stringValue: value } }] }],
            fields: 'userEnteredValue',
            start: { sheetId, rowIndex, columnIndex }
        }
    };
}

function copyCellRequest(sheetId, rowIndex, sourceColumn, targetColumn) {
    return {
        copyPaste: {
            source: {
                sheetId,
                startRowIndex: rowIndex,
                endRowIndex: rowIndex + 1,
                startColumnIndex: sourceColumn,
                endColumnIndex: sourceColumn + 1
            },
            destination: {
                sheetId,
                startRowIndex: rowIndex,
                endRowIndex: rowIndex + 1,
                startColumnIndex: targetColumn,
                endColumnIndex: targetColumn + 1
            },
            pasteType: 'PASTE_VALUES'
        }
    };
}

// Записывает сегодняшнюю дату и версии (library.version) в targetColumn.
// Если версия библиотеки не определена — копирует значение из sourceColumn
async function updateVersions(spreadsheetId, sheetName, { libraries, sourceColumn, targetColumn, isNewColumn }) {
    const sheets = await getSheetsApi();
    const spreadsheet = await sheets.spreadsheets.get({
        spreadsheetId,
        ranges: [sheetName],
        fields: 'sheets(properties(sheetId,title))'
    });
    const sheetId = spreadsheet.data.sheets.find(sheet => sheet.properties.title === sheetName).properties.sheetId;
    const source = sourceColumn + RANGE_OFFSET;
    const target = targetColumn + RANGE_OFFSET;

    const requests = [];
    if (isNewColumn) {
        requests.push({
            insertDimension: {
                range: { sheetId, dimension: 'COLUMNS', startIndex: target, endIndex: target + 1 },
                inheritFromBefore: true
            }
        });
    }
    requests.push(setCellRequest(sheetId, DATE_ROW, target, formatDate(new Date())));
    for (const library of libraries) {
        if (library.version)
            requests.push(setCellRequest(sheetId, library.rowIndex, target, library.version));
        else
            requests.push(copyCellRequest(sheetId, library.rowIndex, source, target));
    }

    await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } });
}

module.exports = {
    getLibraries,
    updateVersions
};
