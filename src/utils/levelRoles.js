import { getRoleForLevel, LEVEL_ROLES, getUserLevel } from './levelingSystem.js';

// Serialize role changes per guild, including role creation and concurrent XP sources.
const queues = new Map();
export const syncLevelRole = (member) => {
  if (!member?.guild) return Promise.resolve();
  const guild = member.guild;
  const task = (queues.get(guild.id) || Promise.resolve()).then(async () => {
    const { level } = await getUserLevel(member.id);
    const roleName = getRoleForLevel(level);
    let role = guild.roles.cache.find(r => r.name === roleName);
    if (!role) {
      role = await guild.roles.create({ name: roleName, color: colorForLevel(level), reason: 'Level reward' });
    }
    // Add before removing: a permissions failure must not remove the previous reward.
    if (!member.roles.cache.has(role.id)) await member.roles.add(role);
    const oldRoles = member.roles.cache.filter(r => Object.values(LEVEL_ROLES).includes(r.name) && r.id !== role.id);
    // Collection removal replaces the role list using a potentially stale Gateway
    // cache. Individual DELETEs preserve the new role and concurrent role grants.
    for (const oldRole of oldRoles.values()) await member.roles.remove(oldRole.id);
  }).catch(error => { console.error('Error assigning level role:', error); });
  queues.set(guild.id, task);
  void task.then(() => { if (queues.get(guild.id) === task) queues.delete(guild.id); });
  return task;
};

const colorForLevel = level => {
  if (level >= 25) return '#ff6b35';
  if (level >= 20) return '#9b59b6';
  if (level >= 15) return '#e74c3c';
  if (level >= 10) return '#f39c12';
  if (level >= 5) return '#3498db';
  return '#95a5a6';
};
