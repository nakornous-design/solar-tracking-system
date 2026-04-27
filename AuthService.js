var APP_CACHE = CacheService.getScriptCache();
var SESSION_USER_KEY = 'SOLAR_CURRENT_USER';

function login(payload) {
  var userId = safeString(payload && payload.USER_ID);
  if (!userId) throw new Error('USER_ID is required');

  var user = findById('MST_USER', 'USER_ID', userId);
  if (!user) throw new Error('User not found: ' + userId);
  if (String(user.ACTIVE_FLAG || 'Y') !== 'Y') throw new Error('User inactive: ' + userId);

  APP_CACHE.put(SESSION_USER_KEY, JSON.stringify(user), 21600);
  return user;
}

function logout() {
  APP_CACHE.remove(SESSION_USER_KEY);
  return true;
}

function getCurrentUser() {
  var raw = APP_CACHE.get(SESSION_USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function requireLogin() {
  var user = getCurrentUser();
  if (!user) throw new Error('Please login first');
  return user;
}
