function getAvailableTransitions(projectId) {
  var currentUser = requireLogin();
  var project = findById(SHEET_NAMES.TXN_PROJECT, 'PROJECT_ID', projectId);
  if (!project) throw new Error('Project not found: ' + projectId);

  var transitions = getActiveTransitions(
    project.PROCESS_CODE,
    project.CURRENT_STAGE_CODE,
    project.CURRENT_STATUS_CODE,
    project.PAYMENT_TYPE
  ) || [];

  return transitions.filter(function(tr) {
    return canUserExecuteTransition_(currentUser, tr);
  });
}

function executeTransition(projectId, transitionCode, payload) {
  var currentUser = requireLogin();
  var project = findById(SHEET_NAMES.TXN_PROJECT, 'PROJECT_ID', projectId);
  if (!project) throw new Error('Project not found: ' + projectId);

  payload = payload || {};

  var available = getActiveTransitions(
    project.PROCESS_CODE,
    project.CURRENT_STAGE_CODE,
    project.CURRENT_STATUS_CODE,
    project.PAYMENT_TYPE
  ) || [];

  var transition = available.find(function(tr) {
    return String(tr.TRANSITION_CODE || '') === String(transitionCode || '');
  });

  if (!transition) {
    throw new Error('Transition not allowed for current state: ' + transitionCode);
  }

  if (!canUserExecuteTransition_(currentUser, transition)) {
    throw new Error('You do not have permission for this action');
  }

  validateTransitionPayload_(transition, payload, currentUser);

  var toStage = transition.TO_STAGE_CODE || project.CURRENT_STAGE_CODE;
  var toStatus = transition.TO_STATUS_CODE || project.CURRENT_STATUS_CODE;

  var nextOwnerRole = resolveNextOwnerRole_(project, toStage);
  var nextOwnerId = resolveNextOwnerId_(project, nextOwnerRole);

  var updates = {
    CURRENT_STAGE_CODE: toStage,
    CURRENT_STATUS_CODE: toStatus,
    CURRENT_OWNER_ROLE: nextOwnerRole,
    CURRENT_OWNER_ID: nextOwnerId,
    NEXT_ACTION: buildNextActionText_(transition),
    NEXT_REVIEW_DATE: payload.EFFECTIVE_AT || '',
    UPDATED_AT: formatDateTime(now()),
    UPDATED_BY: currentUser.USER_ID
  };

  updateRowById(SHEET_NAMES.TXN_PROJECT, 'PROJECT_ID', projectId, updates);

  appendRow(SHEET_NAMES.TXN_PROJECT_STAGE_LOG, {
    STAGE_LOG_ID: generateId('LOG'),
    PROJECT_ID: projectId,
    PROCESS_CODE: project.PROCESS_CODE,
    STAGE_CODE: toStage,
    STATUS_CODE: toStatus,
    EFFECTIVE_AT: payload.EFFECTIVE_AT || formatDateTime(now()),
    OWNER_ID: nextOwnerId,
    SOURCE_TYPE: 'USER',
    CHANGED_BY: currentUser.USER_ID,
    COMMENT_TEXT: payload.COMMENT_TEXT || ''
  });

  if (typeof recalculateProjectProgress === 'function') {
    try {
      recalculateProjectProgress(projectId);
    } catch (e) {}
  }

  return getProjectById(projectId);
}

function validateTransitionPayload_(transition, payload, currentUser) {
  var requiresReason = String(transition.REQUIRES_REASON_FLAG || 'N') === 'Y';
  var requiresEffective = String(transition.REQUIRES_EFFECTIVE_DATE_FLAG || 'N') === 'Y';
  var requiresApproval = String(transition.REQUIRES_APPROVAL_FLAG || 'N') === 'Y';

  if (requiresReason && !String(payload.REASON_CODE || '').trim()) {
    throw new Error('REASON_CODE is required');
  }

  if (requiresEffective && !String(payload.EFFECTIVE_AT || '').trim()) {
    throw new Error('EFFECTIVE_AT is required');
  }

  if (requiresApproval) {
    var approverRole = String(transition.APPROVER_ROLE || '').trim();
    var userRole = String(currentUser.ROLE_CODE || currentUser.DEFAULT_ROLE_CODE || '').trim();

    if (!roleMatches_(userRole, approverRole)) {
      throw new Error('This action requires role: ' + approverRole);
    }
  }
}

function canUserExecuteTransition_(currentUser, transition) {
  var requiresApproval = String(transition.REQUIRES_APPROVAL_FLAG || 'N') === 'Y';
  if (!requiresApproval) return true;

  var approverRole = String(transition.APPROVER_ROLE || '').trim();
  var userRole = String(currentUser.ROLE_CODE || currentUser.DEFAULT_ROLE_CODE || '').trim();

  return roleMatches_(userRole, approverRole);
}

function roleMatches_(userRole, requiredRole) {
  if (!requiredRole) return true;
  if (String(userRole || '') === String(requiredRole || '')) return true;
  if (String(userRole || '') === 'ADMIN') return true;
  return false;
}

function resolveNextOwnerRole_(project, toStageCode) {
  var stage = readAsObjects(SHEET_NAMES.MST_STAGE).find(function(r) {
    return String(r.STAGE_CODE || '') === String(toStageCode || '') &&
           String(r.ACTIVE_FLAG || '') === 'Y';
  });

  return stage ? (stage.DEFAULT_OWNER_ROLE || project.CURRENT_OWNER_ROLE || '') : (project.CURRENT_OWNER_ROLE || '');
}

function resolveNextOwnerId_(project, ownerRole) {
  var role = String(ownerRole || '').toUpperCase();

  if (role === 'SALES') return project.SALES_OWNER_ID || project.CURRENT_OWNER_ID || '';
  if (role === 'FINANCE') return project.FINANCE_OWNER_ID || project.CURRENT_OWNER_ID || '';
  if (role === 'CONTRACTOR' || role === 'INSTALL') return project.INSTALL_VENDOR_ID || project.CURRENT_OWNER_ID || '';
  if (role === 'ENGINEER') return project.CURRENT_OWNER_ID || project.SALES_OWNER_ID || '';
  if (role === 'ADMIN') return project.CREATED_BY || project.CURRENT_OWNER_ID || '';

  return project.CURRENT_OWNER_ID || '';
}

function buildNextActionText_(transition) {
  var toStage = String(transition.TO_STAGE_CODE || '');
  var toStatus = String(transition.TO_STATUS_CODE || '');

  if (toStage === 'CONTRACTOR_BILLING' && toStatus === 'SUBMITTED_TO_ENGINEER') {
    return 'รอ Engineer ตรวจชุดวางบิล';
  }
  if (toStage === 'CONTRACTOR_BILLING' && toStatus === 'APPROVED_BY_ENGINEER') {
    return 'เตรียมส่งทีม Payment';
  }
  if (toStage === 'CONTRACTOR_PAYMENT' && toStatus === 'SUBMITTED_TO_PAYMENT') {
    return 'รอทีม Payment รับเรื่อง';
  }
  if (toStage === 'CONTRACTOR_PAYMENT' && toStatus === 'UNDER_REVIEW') {
    return 'รอทีมการเงินอนุมัติ';
  }
  if (toStage === 'CONTRACTOR_PAYMENT' && toStatus === 'APPROVED_FOR_PAYMENT') {
    return 'รอจ่ายเงินจริงให้ผู้รับเหมา';
  }
  if (toStage === 'CONTRACTOR_PAYMENT' && toStatus === 'DONE') {
    return 'พร้อมปิดโครงการ';
  }
  if (toStage === 'PROJECT_CLOSE' && toStatus === 'WON') {
    return 'โครงการปิดสมบูรณ์';
  }

  return transition.ACTION_NAME_TH || '';
}