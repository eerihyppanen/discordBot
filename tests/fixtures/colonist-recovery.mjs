import fs from 'node:fs/promises';
const { economy } = await import('../../src/utils/economySystem.js');
const { recordWinWithRewards, initializeColonistData, getPlayerStats, addLoss, REWARDS } = await import('../../src/utils/colonistSystem.js');
const { getUserLevel } = await import('../../src/utils/levelingSystem.js');
if (process.argv[3] === 'old-rates') { REWARDS.WIN_XP = 50; REWARDS.STREAK_BONUS_XP = 25; }
const approval = { matchId: 'recovery-match', confirmedBy: 'moderator', guildId: 'guild' };

if (['coins', 'xp'].includes(process.argv[2])) await addLoss('winner', 'Winner');

if (process.argv[2] === 'coins') {
  const grant = economy.grantColonistReward;
  economy.grantColonistReward = async (...args) => { await grant(...args); process.exit(0); };
} else if (process.argv[2] === 'xp') {
  const rename = fs.rename;
  fs.rename = async (...args) => {
    await rename(...args);
    if (args[1].endsWith('/userLevels.json')) process.exit(0);
  };
} else {
  await initializeColonistData();
}
const outcome = await recordWinWithRewards('winner', 'Winner', approval);
console.log(JSON.stringify({
  alreadyRecorded: outcome.alreadyRecorded,
  coins: (await economy.getBalance('winner')).coins,
  xp: (await getUserLevel('winner')).xp,
  wins: (await getPlayerStats('winner')).wins,
  totalGames: (await getPlayerStats('winner')).totalGames,
}));
