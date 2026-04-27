function getDashboardSummary(filters) {
  var projects = readAsObjects('TXN_PROJECT');
  var totalProjects = projects.length;

  var recentProjects = projects.slice(0, 8);
  return {
    totalProjects: totalProjects,
    readyForInstall: countByStage(projects, 'READY_FOR_INSTALL'),
    billingPending: projects.filter(function(r) {
      return String(r.CURRENT_STAGE_CODE || '') === 'CONTRACTOR_BILLING' ||
        (String(r.CURRENT_STAGE_CODE || '') === 'CONTRACTOR_PAYMENT' && String(r.CURRENT_STATUS_CODE || '') !== 'DONE');
    }).length,
    contractorPaid: projects.filter(function(r) {
      return String(r.CURRENT_STAGE_CODE || '') === 'CONTRACTOR_PAYMENT' && String(r.CURRENT_STATUS_CODE || '') === 'DONE';
    }).length,
    overdue: projects.filter(function(r) { return String(r.RISK_FLAG || '') === 'Y'; }).length,
    recentProjects: recentProjects,
    leads: countByStage(projects, 'LEAD'),
    survey: countByStage(projects, 'SURVEY'),
    tssr: countByStage(projects, 'TSSR'),
    install: countByStage(projects, 'INSTALL')
  };
}

function countByStage(rows, stageCode) {
  return rows.filter(function(r) {
    return String(r.CURRENT_STAGE_CODE || '') === String(stageCode || '');
  }).length;
}
