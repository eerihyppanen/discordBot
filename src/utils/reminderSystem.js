import { randomUUID } from 'node:crypto';
import { createJsonStore, dataFile } from './jsonStore.js';

export const createReminderSystem = (store, {
  now = Date.now,
  pollIntervalMs = 15000,
  timers = globalThis,
  logger = console,
} = {}) => {
  let client;
  let interval;
  let running;
  let stopped = true;

  const add = ({ userId, channelId, message, dueAt }) => {
    if (!userId || typeof message !== 'string' || !message.length || message.length > 1024 ||
        !Number.isSafeInteger(dueAt) || dueAt <= now()) {
      throw new Error('Invalid reminder');
    }
    const reminder = { id: randomUUID(), userId, channelId, message, dueAt, attempts: 0 };
    return store.update((reminders) => {
      reminders[reminder.id] = reminder;
      return reminder;
    });
  };

  const deliver = async (reminder) => {
    const embeds = [{
      color: 0xff6b35,
      title: '⏰ Reminder!',
      description: reminder.message,
      timestamp: new Date(now()).toISOString(),
    }];
    try {
      const user = await client.users.fetch(reminder.userId);
      await user.send({ embeds });
    } catch (error) {
      if (!reminder.channelId) throw error;
      const channel = await client.channels.fetch(reminder.channelId);
      if (!channel?.isTextBased() || typeof channel.send !== 'function') throw error;
      await channel.send({
        content: `<@${reminder.userId}>`,
        embeds,
        allowedMentions: { parse: [], users: [reminder.userId] },
      });
    }
  };

  const runDue = () => {
    if (stopped) return Promise.resolve();
    if (running) return running;
    running = (async () => {
      const reminders = Object.values(await store.read())
        .filter((reminder) => Math.max(reminder.dueAt, reminder.nextAttemptAt || 0) <= now())
        .sort((a, b) => a.dueAt - b.dueAt);
      for (const reminder of reminders) {
        if (stopped) break;
        try {
          await deliver(reminder);
        } catch (error) {
          logger.error(`Could not deliver reminder ${reminder.id}; will retry:`, error);
          await store.update((pending) => {
            if (!pending[reminder.id]) return;
            const attempts = (pending[reminder.id].attempts || 0) + 1;
            pending[reminder.id].attempts = attempts;
            pending[reminder.id].nextAttemptAt = now() + Math.min(60000 * 2 ** Math.min(attempts - 1, 6), 3600000);
          });
          continue;
        }
        // A crash between sending and deleting may deliver a reminder again.
        await store.update((pending) => { delete pending[reminder.id]; });
      }
    })().finally(() => { running = undefined; });
    return running;
  };

  return {
    initialize: store.initialize,
    flush: store.flush,
    add,
    runDue,
    start: async (discordClient) => {
      if (!stopped) return;
      client = discordClient;
      stopped = false;
      interval = timers.setInterval(() => {
        runDue().catch((error) => logger.error('Reminder worker failed:', error));
      }, pollIntervalMs);
      interval.unref?.();
      await runDue();
    },
    stop: async () => {
      stopped = true;
      timers.clearInterval(interval);
      interval = undefined;
      await running;
    },
  };
};

export const reminders = createReminderSystem(createJsonStore(dataFile('reminders.json')));
