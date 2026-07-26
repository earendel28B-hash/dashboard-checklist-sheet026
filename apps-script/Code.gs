const SHEET_NAME = 'InspectionRecords';
const API_KEY = 'nozwaAgB2MnsrbJJryBQzYDO';
const SPREADSHEET_ID = '1luxcU-u1sAtAQLZlpXTdMeTOUXP-Q23NmvjtQuZQZqY';

const HEADERS = [
  'record_id',
  'checklist_type',
  'checklist_name',
  'inspection_date',
  'operator_name',
  'employee_id',
  'machine_location',
  'smu',
  'inspection_type',
  'ng_count',
  'created_at',
  'updated_at',
  'inspection_data'
];

function doGet(e) {
  const params = (e && e.parameter) || {};
  if (!params.action && !params.api_key && canServeHtml_()) {
    return HtmlService
      .createHtmlOutputFromFile('index')
      .setTitle('Drive Station Checklist')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
  return handleRequest_(e);
}

function doPost(e) {
  return handleRequest_(e);
}

function handleRequest_(e) {
  try {
    const request = parseRequest_(e);
    validateApiKey_(request);
    const action = String(request.action || 'read').toLowerCase();
    let data = {};
    let message = 'ดำเนินการสำเร็จ';

    if (action === 'create') {
      data = withLock_(function () { return createRecord_(request.data || {}); });
      message = 'บันทึกข้อมูลสำเร็จ';
    } else if (action === 'read') {
      data = readRecords_();
      message = 'อ่านข้อมูลสำเร็จ';
    } else if (action === 'update') {
      data = withLock_(function () { return updateRecord_(request.data || {}); });
      message = 'แก้ไขข้อมูลสำเร็จ';
    } else if (action === 'delete') {
      data = withLock_(function () { return deleteRecord_(request.record_id || (request.data && request.data.record_id)); });
      message = 'ลบข้อมูลสำเร็จ';
    } else if (action === 'getbyid' || action === 'get_by_id') {
      data = getRecordById_(request.record_id || (request.data && request.data.record_id));
      message = 'อ่านข้อมูลสำเร็จ';
    } else {
      throw new Error('ไม่รู้จัก action: ' + action);
    }

    return jsonOutput_({ success: true, message: message, data: data });
  } catch (error) {
    return jsonOutput_({ success: false, message: String(error && error.message || error) });
  }
}

function parseRequest_(e) {
  const request = {};
  const params = (e && e.parameter) || {};
  Object.keys(params).forEach(function (key) {
    request[key] = params[key];
  });

  const body = e && e.postData && e.postData.contents;
  if (body && /^[\[{]/.test(String(body).trim())) {
    const parsed = JSON.parse(body);
    Object.keys(parsed).forEach(function (key) {
      request[key] = parsed[key];
    });
  }

  if (typeof request.payload === 'string' && request.payload) {
    const payload = JSON.parse(request.payload);
    Object.keys(payload).forEach(function (key) {
      request[key] = payload[key];
    });
  }

  if (typeof request.data === 'string' && request.data) {
    request.data = JSON.parse(request.data);
  }

  return request;
}

function validateApiKey_(request) {
  const key = String(request.api_key || request.apiKey || '');
  if (!API_KEY || key !== API_KEY) {
    throw new Error('API_KEY ไม่ถูกต้อง');
  }
}

function withLock_(callback) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    return callback();
  } finally {
    lock.releaseLock();
  }
}

function createRecord_(input) {
  const sheet = getSheet_();
  const record = normalizeRecord_(input);
  const rowNumber = findRowById_(sheet, record.record_id);
  if (rowNumber > 0) {
    const existing = readRecordFromRow_(sheet, rowNumber);
    record.created_at = existing.created_at || record.created_at;
    writeRecordToRow_(sheet, rowNumber, record);
  } else {
    writeRecordToRow_(sheet, sheet.getLastRow() + 1, record);
  }
  return record;
}

function readRecords_() {
  const sheet = getSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const records = [];
  for (let row = 2; row <= lastRow; row++) {
    const record = readRecordFromRow_(sheet, row);
    if (record.record_id) records.push(record);
  }
  records.sort(function (a, b) {
    return String(b.updated_at || '').localeCompare(String(a.updated_at || ''));
  });
  return records;
}

function updateRecord_(input) {
  const sheet = getSheet_();
  const record = normalizeRecord_(input);
  const rowNumber = findRowById_(sheet, record.record_id);
  if (rowNumber < 0) {
    throw new Error('ไม่พบ record_id: ' + record.record_id);
  }
  const existing = readRecordFromRow_(sheet, rowNumber);
  record.created_at = existing.created_at || record.created_at;
  writeRecordToRow_(sheet, rowNumber, record);
  return record;
}

function deleteRecord_(recordId) {
  const id = String(recordId || '').trim();
  if (!id) throw new Error('ต้องระบุ record_id');
  const sheet = getSheet_();
  const rowNumber = findRowById_(sheet, id);
  if (rowNumber > 0) {
    sheet.deleteRow(rowNumber);
    return { record_id: id, deleted: true };
  }
  return { record_id: id, deleted: false };
}

function getRecordById_(recordId) {
  const id = String(recordId || '').trim();
  if (!id) throw new Error('ต้องระบุ record_id');
  const sheet = getSheet_();
  const rowNumber = findRowById_(sheet, id);
  if (rowNumber < 0) throw new Error('ไม่พบ record_id: ' + id);
  return readRecordFromRow_(sheet, rowNumber);
}

function normalizeRecord_(input) {
  const now = new Date().toISOString();
  const source = input || {};
  const inspectionData = parseJson_(source.inspection_data, {});
  const record = {
    record_id: String(source.record_id || inspectionData.record_id || generateRecordId_()).trim(),
    checklist_type: text_(source.checklist_type || inspectionData.checklist_type || ''),
    checklist_name: text_(source.checklist_name || inspectionData.checklist_name || ''),
    inspection_date: text_(source.inspection_date || inspectionData.inspection_date || ''),
    operator_name: text_(source.operator_name || inspectionData.operator_name || ''),
    employee_id: text_(source.employee_id || inspectionData.employee_id || ''),
    machine_location: text_(source.machine_location || inspectionData.machine_location || ''),
    smu: text_(source.smu || inspectionData.smu || ''),
    inspection_type: text_(source.inspection_type || inspectionData.inspection_type || ''),
    ng_count: numericOrCount_(source.ng_count, inspectionData),
    created_at: text_(source.created_at || now),
    updated_at: now,
    inspection_data: inspectionData
  };

  if (!record.record_id) throw new Error('ต้องระบุ record_id');
  record.inspection_data.record_id = record.record_id;
  record.inspection_data.checklist_type = record.checklist_type;
  record.inspection_data.checklist_name = record.checklist_name;
  record.inspection_data.inspection_date = record.inspection_date;
  record.inspection_data.operator_name = record.operator_name;
  record.inspection_data.employee_id = record.employee_id;
  record.inspection_data.machine_location = record.machine_location;
  record.inspection_data.smu = record.smu;
  record.inspection_data.inspection_type = record.inspection_type;
  return record;
}

function readRecordFromRow_(sheet, rowNumber) {
  const values = sheet.getRange(rowNumber, 1, 1, HEADERS.length).getValues()[0];
  const record = {};
  HEADERS.forEach(function (header, index) {
    record[header] = displayValue_(values[index]);
  });
  record.inspection_data = parseJson_(record.inspection_data, {});
  record.ng_count = numericOrCount_(record.ng_count, record.inspection_data);
  return record;
}

function writeRecordToRow_(sheet, rowNumber, record) {
  const row = HEADERS.map(function (header) {
    if (header === 'inspection_data') return JSON.stringify(record.inspection_data || {});
    return record[header] === undefined || record[header] === null ? '' : record[header];
  });
  sheet.getRange(rowNumber, 1, 1, HEADERS.length).setValues([row]);
}

function findRowById_(sheet, recordId) {
  const id = String(recordId || '').trim();
  if (!id || sheet.getLastRow() < 2) return -1;
  const ids = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getDisplayValues().flat();
  const index = ids.indexOf(id);
  return index >= 0 ? index + 2 : -1;
}

function getSheet_() {
  const spreadsheet = SPREADSHEET_ID
    ? SpreadsheetApp.openById(SPREADSHEET_ID)
    : SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) throw new Error('ไม่พบ Spreadsheet กรุณาเปิด Apps Script จาก Google Sheets หรือระบุ SPREADSHEET_ID');

  let sheet = spreadsheet.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = spreadsheet.insertSheet(SHEET_NAME);
  ensureHeaders_(sheet);
  return sheet;
}

function ensureHeaders_(sheet) {
  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  sheet.setFrozenRows(1);
}

function parseJson_(value, fallback) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(String(value));
  } catch (error) {
    return fallback;
  }
}

function numericOrCount_(value, data) {
  const number = Number(value);
  return Number.isFinite(number) ? number : countNG_(data || {});
}

function countNG_(data) {
  return Object.keys(data || {}).filter(function (key) {
    return /^(visual|sound|vibration)_/.test(key) && data[key] === 'NG';
  }).length;
}

function displayValue_(value) {
  return value instanceof Date ? value.toISOString() : value;
}

function text_(value) {
  return String(value === undefined || value === null ? '' : value).trim();
}

function generateRecordId_() {
  const date = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd');
  const suffix = Utilities.getUuid().slice(0, 8).toUpperCase();
  return 'REC-' + date + '-' + suffix;
}

function jsonOutput_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function canServeHtml_() {
  try {
    HtmlService.createTemplateFromFile('index');
    return true;
  } catch (error) {
    return false;
  }
}
