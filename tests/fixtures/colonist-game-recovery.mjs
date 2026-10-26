import fs from 'node:fs/promises';
const { colonistGames } = await import('../../src/utils/colonistGameSystem.js');
const { initializeColonistData, getPlayerStats, flushColonistData } = await import('../../src/utils/colonistSystem.js');
const { economy } = await import('../../src/utils/economySystem.js');
const { getUserLevel, flushLevelingData } = await import('../../src/utils/levelingSystem.js');
const context = { guildId: 'guild', channelId: 'channel' };
const id = 'recover-game';
const mode = process.argv[2];
if (mode === 'recover') {
  await initializeColonistData();
  await colonistGames.initialize();
} else {
  await colonistGames.create({ ...context, id, creator: { id: '111', username: 'Creator' } });
  await colonistGames.join(id, { id: '222', username: 'Winner' }, context);
  await colonistGames.start(id, '111', context);
  if (mode === 'coins') {
    const grant = economy.grantColonistReward;
    economy.grantColonistReward = async receipt => { await grant(receipt); process.exit(0); };
  } else {
    const rename = fs.rename;
    fs.rename = async (...args) => {
      await rename(...args);
      if ((mode === 'xp' && args[1].endsWith('/userLevels.json')) || (mode === 'stats' && args[1].endsWith('/colonistWins.json'))) process.exit(0);
      if (mode === 'reservation' && args[1].endsWith('/colonistGames.json')) {
        const games = JSON.parse(await fs.readFile(args[1], 'utf8'));
        if (games[id].status === 'recording') process.exit(0);
      }
    };
  }
  await colonistGames.confirm(id, '222', context);
  throw new Error('Expected crash boundary was not reached: ' + mode);
}
const game = await colonistGames.get(id);
console.log(JSON.stringify({
  status: game.status, winnerId: game.winnerId,
  winnerWins: (await getPlayerStats('222')).wins,
  winnerGames: (await getPlayerStats('222')).totalGames,
  loserWins: (await getPlayerStats('111')).wins,
  loserGames: (await getPlayerStats('111')).totalGames,
  coins: (await economy.getBalance('222')).coins,
  xp: (await getUserLevel('222')).xp,
}));
await flushColonistData();
await flushLevelingData();
