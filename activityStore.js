const activeUsers = new Map();

const DEFAULT_ACTIVE_WINDOW_MS = 5 * 60 * 1000;

const pruneInactive = (withinMs) => {
  const cutoffMs = Number.isFinite(Number(withinMs)) ? Number(withinMs) : 0;
  if (!cutoffMs) return;
  const cutoff = Date.now() - cutoffMs;
  for (const [id, data] of activeUsers.entries()) {
    if (!data || !data.lastSeen || data.lastSeen < cutoff) {
      activeUsers.delete(id);
    }
  }
};

const markActive = (user) => {
  if (!user || !user.id) return;
  activeUsers.set(String(user.id), {
    lastSeen: Date.now(),
    role: user.role || ''
  });
};

const markInactive = (userId) => {
  if (!userId) return;
  activeUsers.delete(String(userId));
};

const getActiveUserIds = (options) => {
  const resolved = options || {};
  const withinMs = Number.isFinite(Number(resolved.withinMs)) ? Number(resolved.withinMs) : DEFAULT_ACTIVE_WINDOW_MS;
  const role = resolved.role ? String(resolved.role) : '';
  pruneInactive(withinMs);
  const cutoff = Date.now() - withinMs;
  const ids = [];
  for (const [id, data] of activeUsers.entries()) {
    if (!data || !data.lastSeen || data.lastSeen < cutoff) continue;
    if (role && data.role !== role) continue;
    ids.push(id);
  }
  return ids;
};

module.exports = {
  DEFAULT_ACTIVE_WINDOW_MS,
  markActive,
  markInactive,
  getActiveUserIds
};
