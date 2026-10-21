import { initializeData, addXP, flushLevelingData } from '../../src/utils/levelingSystem.js';
import { initializePubgWinsData, updatePlayerWins, flushPubgWinsData } from '../../src/utils/pubgWinsSystem.js';
import { initializeColonistData, addWin, flushColonistData } from '../../src/utils/colonistSystem.js';
import { economy } from '../../src/utils/economySystem.js';
import { reminders } from '../../src/utils/reminderSystem.js';
import { createLifecycle } from '../../src/utils/lifecycle.js';

await Promise.all([initializeData(), initializePubgWinsData(), initializeColonistData(), economy.initialize(), reminders.initialize()]);
const heartbeat = setInterval(() => {}, 1000);
const lifecycle = createLifecycle({
  client: { destroy: async () => {} },
  stop: async () => { clearInterval(heartbeat); await reminders.stop(); },
  flushers: [flushLevelingData, flushPubgWinsData, flushColonistData, economy.flush, reminders.flush],
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => { void lifecycle.shutdown(signal); });
}
await Promise.all([
  addXP('user', 75),
  updatePlayerWins('player', 'steam', 'pc-eu', 2, 10, 20),
  addWin('user', 'player'),
  economy.addCoins('user', 25),
  reminders.add({ userId: 'user', channelId: 'channel', message: 'pending', dueAt: Date.now() + 3600000 }),
]);
process.send('ready');
