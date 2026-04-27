function getProjectById(projectId) {
  var project = findById(SHEET_NAMES.TXN_PROJECT, 'PROJECT_ID', projectId);
  if (!project) return null;

  var timeline = getTimelineView(projectId);

  project.HANDOVER_SIGNED_AT = findLatestEffectiveAt_(timeline, 'HANDOVER', 'DONE');
  project.BILLING_SUBMITTED_AT = findLatestEffectiveAt_(timeline, 'CONTRACTOR_BILLING', 'SUBMITTED_TO_ENGINEER');
  project.ENGINEER_APPROVED_AT = findLatestEffectiveAt_(timeline, 'CONTRACTOR_BILLING', 'APPROVED_BY_ENGINEER');
  project.PAYMENT_SUBMITTED_AT = findLatestEffectiveAt_(timeline, 'CONTRACTOR_PAYMENT', 'SUBMITTED_TO_PAYMENT');
  project.APPROVED_FOR_PAYMENT_AT = findLatestEffectiveAt_(timeline, 'CONTRACTOR_PAYMENT', 'APPROVED_FOR_PAYMENT');
  project.PAID_AT = findLatestEffectiveAt_(timeline, 'CONTRACTOR_PAYMENT', 'DONE');

  return project;
}

function listProjects(filters) {
  var rows = readAsObjects(SHEET_NAMES.TXN_PROJECT);
  filters = filters || {};

  return rows.filter(function(r) {
    if (filters.PROJECT_ID && String(r.PROJECT_ID || '') !== String(filters.PROJECT_ID || '')) return false;

    if (filters.KEYWORD) {
      var kw = String(filters.KEYWORD || '').toLowerCase();
      var text = [
        r.PROJECT_ID,
        r.PROJECT_NAME,
        r.CUSTOMER_ID,
        r.CURRENT_OWNER_ID
      ].join(' ').toLowerCase();

      if (text.indexOf(kw) === -1) return false;
    }

    if (filters.PAYMENT_TYPE && String(r.PAYMENT_TYPE || '') !== String(filters.PAYMENT_TYPE || '')) return false;
    if (filters.CURRENT_STAGE_CODE && String(r.CURRENT_STAGE_CODE || '') !== String(filters.CURRENT_STAGE_CODE || '')) return false;
    if (filters.CURRENT_STATUS_CODE && String(r.CURRENT_STATUS_CODE || '') !== String(filters.CURRENT_STATUS_CODE || '')) return false;

    return true;
  });
}

function getTimelineView(projectId) {
  return readAsObjects(SHEET_NAMES.TXN_PROJECT_STAGE_LOG)
    .filter(function(r) {
      return String(r.PROJECT_ID || '') === String(projectId || '');
    })
    .sort(function(a, b) {
      return String(b.EFFECTIVE_AT || '').localeCompare(String(a.EFFECTIVE_AT || ''));
    });
}

function getProjectActivities(projectId) {
  if (!SHEET_NAMES.TXN_ACTIVITY_LOG) return [];

  return readAsObjects(SHEET_NAMES.TXN_ACTIVITY_LOG)
    .filter(function(r) {
      return String(r.ENTITY_ID || r.PROJECT_ID || '') === String(projectId || '');
    })
    .sort(function(a, b) {
      return String(b.CREATED_AT || '').localeCompare(String(a.CREATED_AT || ''));
    });
}

function updateProjectSnapshot(projectId, updates) {
  var currentUser = requireLogin();
  updates = updates || {};
  updates.UPDATED_AT = formatDateTime(now());
  updates.UPDATED_BY = currentUser.USER_ID;

  return updateRowById(SHEET_NAMES.TXN_PROJECT, 'PROJECT_ID', projectId, updates);
}

function getProjectDocuments(projectId) {
  var project = findById(SHEET_NAMES.TXN_PROJECT, 'PROJECT_ID', projectId);
  if (!project) return [];

  var actualDocs = SHEET_NAMES.TXN_DOCUMENT
    ? readAsObjects(SHEET_NAMES.TXN_DOCUMENT).filter(function(r) {
        return String(r.PROJECT_ID || '') === String(projectId || '');
      })
    : [];

  var requiredDocs = (typeof getRequiredDocuments === 'function')
    ? getRequiredDocuments(project.CURRENT_STAGE_CODE, project.PAYMENT_TYPE)
    : [];

  if (!requiredDocs.length) {
    return actualDocs.map(function(r) {
      return {
        DOC_CODE: r.DOC_CODE || '',
        DOC_NAME: r.DOC_NAME || r.FILE_NAME || r.DOC_CODE || '',
        VERIFY_STATUS: r.VERIFY_STATUS || 'PENDING',
        FILE_NAME: r.FILE_NAME || '',
        UPDATED_AT: r.UPDATED_AT || ''
      };
    });
  }

  return requiredDocs.map(function(req) {
    var hit = actualDocs.find(function(doc) {
      return String(doc.DOC_CODE || '') === String(req.DOC_CODE || '');
    });

    return {
      DOC_CODE: req.DOC_CODE || '',
      DOC_NAME: req.DOC_NAME_TH || req.DOC_CODE || '',
      VERIFY_STATUS: hit ? (hit.VERIFY_STATUS || 'PENDING') : 'MISSING',
      FILE_NAME: hit ? (hit.FILE_NAME || '') : '',
      UPDATED_AT: hit ? (hit.UPDATED_AT || '') : ''
    };
  });
}

function findLatestEffectiveAt_(timeline, stageCode, statusCode) {
  var hit = (timeline || []).find(function(r) {
    return String(r.STAGE_CODE || '') === String(stageCode || '') &&
           String(r.STATUS_CODE || '') === String(statusCode || '');
  });
  return hit ? (hit.EFFECTIVE_AT || '-') : '-';
}