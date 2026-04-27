function apiGetAppBootstrap() {
  try {
    return ok({
      currentUser: getCurrentUser(),
      master: (typeof getMasterDataBundle === 'function') ? getMasterDataBundle() : {},
      menu: [
        { id: 'dashboard', label: 'Dashboard' },
        { id: 'projects', label: 'Projects' },
        { id: 'documents', label: 'Documents' },
        { id: 'billing', label: 'Billing & Payment' },
        { id: 'stageMonitor', label: 'Stage Monitor' },
        { id: 'settings', label: 'Settings' }
      ]
    });
  } catch (err) {
    return fail(err.message);
  }
}

function apiLogin(payload) {
  try {
    return ok(login(payload), 'Login success');
  } catch (err) {
    return fail(err.message);
  }
}

function apiGetCurrentUser() {
  try {
    return ok(getCurrentUser());
  } catch (err) {
    return fail(err.message);
  }
}

function apiGetDashboardSummary(filters) {
  try {
    requireLogin();
    return ok(getDashboardSummary(filters || {}));
  } catch (err) {
    return fail(err.message);
  }
}

function apiListProjects(filters) {
  try {
    requireLogin();
    return ok(listProjects(filters || {}));
  } catch (err) {
    return fail(err.message);
  }
}

function apiGetProjectDetail(projectId) {
  try {
    requireLogin();
    return ok(getProjectById(projectId));
  } catch (err) {
    return fail(err.message);
  }
}

function apiGetProjectTimeline(projectId) {
  try {
    requireLogin();
    return ok(getTimelineView(projectId));
  } catch (err) {
    return fail(err.message);
  }
}

function apiGetProjectDocuments(projectId) {
  try {
    requireLogin();
    return ok(getProjectDocuments(projectId));
  } catch (err) {
    return fail(err.message);
  }
}

function apiGetProjectActivity(projectId) {
  try {
    requireLogin();
    return ok(getProjectActivities(projectId));
  } catch (err) {
    return fail(err.message);
  }
}

function apiGetAvailableTransitions(projectId) {
  try {
    requireLogin();
    return ok(getAvailableTransitions(projectId));
  } catch (err) {
    return fail(err.message);
  }
}

function apiExecuteTransition(projectId, actionCode, payload) {
  try {
    requireLogin();
    return ok(executeTransition(projectId, actionCode, payload || {}), 'Transition success');
  } catch (err) {
    return fail(err.message);
  }
}