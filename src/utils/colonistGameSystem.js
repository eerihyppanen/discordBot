import { randomUUID } from 'node:crypto';
import { createJsonStore, dataFile } from './jsonStore.js';
import { ColonistError, recordGameResult } from './colonistSystem.js';

const unfinished = game => ['lobby', 'playing', 'recording'].includes(game.status);
const validPlayer = player => {
  if (!player || player.bot || !/^\d{1,20}$/.test(player.id) || typeof player.username !== 'string' || !player.username.trim()) {
    throw new ColonistError('Only human server members can join a game.');
  }
};
const checked = (games, id, context) => {
  const game = games[id];
  if (!game) throw new ColonistError('Game not found. Open it with /colonist game.');
  if (context && (game.guildId !== context.guildId || game.channelId !== context.channelId)) {
    throw new ColonistError('Use the game in its original server and channel.');
  }
  return game;
};
const mayClaim = (game, userId) => {
  if (!game.players.some(player => player.id === userId)) throw new ColonistError('Only a participant can claim this game.');
  if (!['playing', 'recording', 'completed'].includes(game.status)) throw new ColonistError('The game must be started before claiming a win.');
  if (game.winnerId && game.winnerId !== userId) throw new ColonistError('This game already has a winner.');
};

export const createColonistGameSystem = (store, { recordResult = recordGameResult, now = Date.now } = {}) => {
  const activeIn = (games, userId) => Object.values(games).find(game => unfinished(game) && game.players.some(player => player.id === userId));
  const get = async (id, context) => checked(await store.read(), id, context);
  const finish = async id => {
    const game = await get(id);
    if (game.status === 'completed') return game;
    const result = await recordResult({ id: game.id, guildId: game.guildId, players: game.players, winnerId: game.winnerId, finishedAt: game.finishedAt });
    return store.update(games => {
      const current = checked(games, id);
      if (current.status !== 'completed') {
        current.result = result;
        current.status = 'completed';
      }
      return current;
    });
  };
  return {
    initialize: async () => {
      await store.initialize();
      for (const game of Object.values(await store.read())) if (game.status === 'recording') await finish(game.id);
    },
    flush: store.flush,
    get,
    activeFor: async userId => activeIn(await store.read(), userId) || null,
    create: ({ guildId, channelId, creator, id = randomUUID() }) => store.update(games => {
      validPlayer(creator);
      if (!guildId || !channelId || !/^[a-z0-9_-]{6,100}$/i.test(id)) throw new ColonistError('Create a game in a server channel.');
      if (games[id]) {
        const game = checked(games, id, { guildId, channelId });
        if (game.creatorId !== creator.id) throw new ColonistError('This game belongs to another creator.');
        return game;
      }
      const active = activeIn(games, creator.id);
      if (active) {
        checked(games, active.id, { guildId, channelId });
        return active;
      }
      return games[id] = {
        id, guildId, channelId, creatorId: creator.id,
        players: [{ id: creator.id, username: creator.username }],
        status: 'lobby', createdAt: now(), messageId: null,
      };
    }),
    attachMessage: (id, messageId, context) => store.update(games => {
      const game = checked(games, id, context);
      game.messageId = messageId;
      return game;
    }),
    join: (id, player, context) => store.update(games => {
      validPlayer(player);
      const game = checked(games, id, context);
      if (game.status !== 'lobby') throw new ColonistError('Players can join only while the game is in the lobby.');
      if (game.players.some(member => member.id === player.id)) return game;
      if (activeIn(games, player.id)) throw new ColonistError('You are already in another unfinished game.');
      if (game.players.length >= 8) throw new ColonistError('This game already has eight players.');
      game.players.push({ id: player.id, username: player.username });
      return game;
    }),
    leave: (id, userId, context) => store.update(games => {
      const game = checked(games, id, context);
      if (game.status !== 'lobby') throw new ColonistError('Players can leave only while the game is in the lobby.');
      if (game.creatorId === userId) throw new ColonistError('The creator must cancel the game instead of leaving.');
      game.players = game.players.filter(player => player.id !== userId);
      return game;
    }),
    start: (id, userId, context) => store.update(games => {
      const game = checked(games, id, context);
      if (game.creatorId !== userId) throw new ColonistError('Only the creator can start the game.');
      if (game.status === 'playing') return game;
      if (game.status !== 'lobby') throw new ColonistError('This game is no longer in the lobby.');
      if (game.players.length < 2) throw new ColonistError('At least two players must join before starting.');
      game.status = 'playing';
      game.startedAt = now();
      return game;
    }),
    cancel: (id, userId, context) => store.update(games => {
      const game = checked(games, id, context);
      if (game.creatorId !== userId) throw new ColonistError('Only the creator can cancel the game.');
      if (game.status === 'recording' || game.status === 'completed') throw new ColonistError('A recording or completed game cannot be cancelled.');
      game.status = 'cancelled';
      return game;
    }),
    claim: async (id, userId, context) => {
      const game = await get(id, context);
      mayClaim(game, userId);
      return game;
    },
    confirm: async (id, userId, context) => {
      const reserved = await store.update(games => {
        const game = checked(games, id, context);
        mayClaim(game, userId);
        if (game.status === 'playing') {
          game.status = 'recording';
          game.winnerId = userId;
          game.finishedAt = now();
        }
        return game;
      });
      return reserved.status === 'completed' ? reserved : finish(id);
    },
  };
};

export const colonistGames = createColonistGameSystem(createJsonStore(dataFile('colonistGames.json')));
