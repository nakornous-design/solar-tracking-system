function getSheet(sheetName) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(sheetName);
  if (!sh) throw new Error('Sheet not found: ' + sheetName);
  return sh;
}

function getHeaders(sheetName) {
  var sh = getSheet(sheetName);
  return sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
}

function readAsObjects(sheetName) {
  var sh = getSheet(sheetName);
  var lastRow = sh.getLastRow();
  var lastCol = sh.getLastColumn();
  if (lastRow < 2) return [];
  var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0];
  var values = sh.getRange(2, 1, lastRow - 1, lastCol).getValues();
  return values.map(function(row) { return mapRowToObject(headers, row); });
}

function mapRowToObject(headers, rowValues) {
  var obj = {};
  headers.forEach(function(h, i) { obj[h] = rowValues[i]; });
  return obj;
}

function mapObjectToRow(headers, rowObject) {
  return headers.map(function(h) {
    return rowObject[h] !== undefined ? rowObject[h] : '';
  });
}

function appendRow(sheetName, rowObject) {
  var sh = getSheet(sheetName);
  var headers = getHeaders(sheetName);
  sh.appendRow(mapObjectToRow(headers, rowObject));
}

function appendRows(sheetName, rowObjects) {
  if (!rowObjects || !rowObjects.length) return;
  var sh = getSheet(sheetName);
  var headers = getHeaders(sheetName);
  var rows = rowObjects.map(function(obj) { return mapObjectToRow(headers, obj); });
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, headers.length).setValues(rows);
}

function findById(sheetName, idField, idValue) {
  var rows = readAsObjects(sheetName);
  return rows.find(function(r) { return String(r[idField]) === String(idValue); }) || null;
}

function filterByField(sheetName, fieldName, value) {
  return readAsObjects(sheetName).filter(function(r) { return String(r[fieldName]) === String(value); });
}

function findMany(sheetName, predicateFn) {
  return readAsObjects(sheetName).filter(predicateFn);
}

function updateRowById(sheetName, idField, idValue, updates) {
  var sh = getSheet(sheetName);
  var headers = getHeaders(sheetName);
  var all = sh.getDataRange().getValues();
  for (var r = 1; r < all.length; r++) {
    var rowObj = mapRowToObject(headers, all[r]);
    if (String(rowObj[idField]) === String(idValue)) {
      var merged = Object.assign({}, rowObj, updates);
      sh.getRange(r + 1, 1, 1, headers.length).setValues([mapObjectToRow(headers, merged)]);
      return merged;
    }
  }
  throw new Error('Record not found: ' + sheetName + ' / ' + idField + '=' + idValue);
}
