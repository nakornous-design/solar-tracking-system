function getMasterDataBundle() {
  return {
    process: readAsObjects('MST_PROCESS'),
    stage: readAsObjects('MST_STAGE'),
    status: readAsObjects('MST_STATUS'),
    transition: readAsObjects('MST_TRANSITION'),
    sla: readAsObjects('MST_SLA'),
    milestone: readAsObjects('MST_MILESTONE'),
    document: readAsObjects('MST_DOCUMENT')
  };
}

function getActiveStages(processCode, paymentType) {
  return readAsObjects('MST_STAGE').filter(function(r) {
    return String(r.ACTIVE_FLAG || '') === 'Y' &&
      String(r.PROCESS_CODE || '') === String(processCode || '') &&
      (String(r.PAYMENT_SCOPE || 'ALL') === 'ALL' || String(r.PAYMENT_SCOPE || '') === String(paymentType || 'ALL'));
  }).sort(function(a, b) {
    return Number(a.SEQ_NO || 0) - Number(b.SEQ_NO || 0);
  });
}

function getActiveStatuses() {
  return readAsObjects('MST_STATUS').filter(function(r) {
    return String(r.ACTIVE_FLAG || '') === 'Y';
  });
}

function getActiveTransitions(processCode, fromStage, fromStatus, paymentType) {
  return readAsObjects('MST_TRANSITION').filter(function(r) {
    return String(r.ACTIVE_FLAG || '') === 'Y' &&
      String(r.PROCESS_CODE || '') === String(processCode || '') &&
      String(r.FROM_STAGE_CODE || '') === String(fromStage || '') &&
      String(r.FROM_STATUS_CODE || '') === String(fromStatus || '') &&
      (String(r.PAYMENT_SCOPE || 'ALL') === 'ALL' || String(r.PAYMENT_SCOPE || '') === String(paymentType || 'ALL'));
  });
}

function getRequiredDocuments(stageCode, paymentType) {
  return readAsObjects('MST_DOCUMENT').filter(function(r) {
    return String(r.ACTIVE_FLAG || '') === 'Y' &&
      String(r.REQUIRED_STAGE_CODE || '') === String(stageCode || '') &&
      (String(r.PAYMENT_SCOPE || 'ALL') === 'ALL' || String(r.PAYMENT_SCOPE || '') === String(paymentType || 'ALL'));
  });
}
