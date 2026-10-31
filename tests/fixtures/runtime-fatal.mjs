import { Client } from 'discord.js';
let client;
Client.prototype.login = async function () {
  client = this;
  this.user = { id: '999', username: 'OfflineBot', tag: 'OfflineBot#0000' };
  this.emit('clientReady', this);
  return 'offline';
};
await import('../../src/app.js');
const { addXP } = await import('../../src/utils/levelingSystem.js');
await addXP('fatal-user', 75);
process.on('message', mode => {
  if (mode === 'exception') throw new Error('Expected fatal exception');
  if (mode === 'rejection') void Promise.reject(new Error('Expected fatal rejection'));
});
process.send({ type: 'ready', legacyReadyListeners: client.listenerCount('ready') });
