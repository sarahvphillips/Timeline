/** Daily cap from a shared read budget and how many people were active. */

function computeAllowance({ budget = 50000, activeUsers = 1, floor = 300, ceiling = 2000 } = {}) {
  const users = Math.max(1, Math.floor(Number(activeUsers) || 0));
  const spend = Math.max(1, Math.floor(Number(budget) || 50000));
  const low = Math.max(1, Math.floor(Number(floor) || 300));
  const high = Math.max(low, Math.floor(Number(ceiling) || 2000));
  const raw = Math.floor(spend / users);
  const cap = Math.min(high, Math.max(low, raw));
  return {
    cap,
    activeUsers: users,
    budget: spend,
    floor: low,
    ceiling: high,
    overBudget: low * users > spend,
  };
}

module.exports = { computeAllowance };
