var SHEET_NAMES = {
  MST_PROCESS: 'MST_PROCESS',
  MST_STAGE: 'MST_STAGE',
  MST_STATUS: 'MST_STATUS',
  MST_TRANSITION: 'MST_TRANSITION',
  MST_SLA: 'MST_SLA',
  MST_MILESTONE: 'MST_MILESTONE',
  MST_DOCUMENT: 'MST_DOCUMENT',
  MST_USER: 'MST_USER',

  TXN_CUSTOMER: 'TXN_CUSTOMER',
  TXN_LEAD: 'TXN_LEAD',
  TXN_PROJECT: 'TXN_PROJECT',
  TXN_PROJECT_STAGE_LOG: 'TXN_PROJECT_STAGE_LOG',
  TXN_ACTIVITY_LOG: 'TXN_ACTIVITY_LOG',
  TXN_DOCUMENT: 'TXN_DOCUMENT',
  TXN_CONTRACTOR_BILLING: 'TXN_CONTRACTOR_BILLING',
  TXN_CONTRACTOR_PAYMENT: 'TXN_CONTRACTOR_PAYMENT',
  TXN_PROJECT_MILESTONE_LOG: 'TXN_PROJECT_MILESTONE_LOG'
};

function now() {
  return new Date();
}

function formatDateTime(d) {
  return Utilities.formatDate(new Date(d), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
}

function formatDate(d) {
  return Utilities.formatDate(new Date(d), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function safeString(v) {
  return String(v == null ? '' : v).trim();
}

function safeNumber(v) {
  var n = Number(v || 0);
  return isNaN(n) ? 0 : n;
}

function throwIfErrors(errors) {
  if (errors && errors.length) throw new Error('Validation error: ' + errors.join(', '));
}

function generateProjectId() {
  return 'PRJ-' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd-HHmmss');
}

function generateLeadId() {
  return 'LEAD-' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd-HHmmss');
}

function generateActivityId() {
  return 'ACT-' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd-HHmmss-SSS');
}

function generateId(prefix) {
  return String(prefix || 'ID') + '-' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd-HHmmss-SSS');
}

function ok(data, message) {
  return {
    success: true,
    message: message || '',
    data: data
  };
}

function fail(message, errors) {
  return {
    success: false,
    message: message || 'Error',
    errors: errors || []
  };
}