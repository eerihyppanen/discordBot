import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { Client, Guild, GuildMember, Role } from 'discord.js';

const directory = await fs.mkdtemp('/tmp/discord-role-cache-');
process.env.DATA_DIR = directory;
const { addXP, flushLevelingData } = await import('../src/utils/levelingSystem.js');
const { flushColonistData } = await import('../src/utils/colonistSystem.js');
const { default: messageCreate } = await import('../src/events/messageCreate.js');
const { default: colonist } = await import('../src/commands/colonist.js');
after(async () => {
  await Promise.all([flushLevelingData(), flushColonistData()]);
  await fs.rm(directory, { recursive: true, force: true });
});

for (const source of ['chat', 'colonist']) {
  test(`${source} promotion preserves new and unrelated roles while the Gateway cache stays stale`, async t => {
    const client = new Client({ intents: [] });
    t.after(() => client.destroy());
    client.user = { id: '900000000000000000' };
    const guild = new Guild(client, { id: '100000000000000000', name: 'Test guild' });
    const ids = { old: '300000000000000000', extraOld: '400000000000000000', next: '500000000000000000', unrelated: '600000000000000000', concurrent: '700000000000000000' };
    for (const [id, name] of [
      [guild.id, '@everyone'], [ids.old, 'Jumping-Noob'], [ids.extraOld, 'Platinum Puller'],
      [ids.next, 'Silver Stroker'], [ids.unrelated, 'Member'], [ids.concurrent, 'Event participant'],
    ]) guild.roles.cache.set(id, new Role(client, { id, name, permissions: '0' }, guild));

    const initial = [ids.old, ids.extraOld, ids.unrelated];
    const member = new GuildMember(client, {
      user: { id: source === 'chat' ? '200000000000000001' : '200000000000000002', username: 'Winner', discriminator: '0', avatar: null },
      roles: initial,
    }, guild);
    let serverRoles = new Set([guild.id, ...initial]);
    const requests = [];
    // Use the actual locked discord.js role manager. REST changes server state only;
    // no Gateway event updates the original member's cache during this test.
    t.mock.method(client.rest, 'put', async route => {
      requests.push(['PUT', route.split('/').at(-1)]);
      serverRoles.add(route.split('/').at(-1));
      serverRoles.add(ids.concurrent); // An unrelated role arrives during promotion.
    });
    t.mock.method(client.rest, 'delete', async route => {
      requests.push(['DELETE', route.split('/').at(-1)]);
      serverRoles.delete(route.split('/').at(-1));
    });
    t.mock.method(client.rest, 'patch', async (_route, { body }) => {
      requests.push(['PATCH']);
      serverRoles = new Set(body.roles);
      return { user: { id: member.id, username: 'Winner' }, roles: [...serverRoles] };
    });

    await addXP(member.id, source === 'chat' ? 2485 : 2450);
    if (source === 'chat') {
      await messageCreate.execute({ author: member.user, guild, member, channel: { send: async () => {} } });
    } else {
      t.mock.method(guild.members, 'fetch', async () => member);
      await colonist.execute({
        user: { id: '800000000000000000' }, guild, guildId: guild.id,
        inGuild: () => true, memberPermissions: { has: () => true },
        options: { getSubcommand: () => 'win', getUser: () => member.user, getString: () => 'cache-delay-match' },
        deferReply: async () => {}, editReply: async () => {},
      });
    }
    assert.ok(serverRoles.has(ids.next), 'new level role must remain on the server');
    assert.ok(serverRoles.has(ids.unrelated), 'existing unrelated role must remain');
    assert.ok(serverRoles.has(ids.concurrent), 'concurrently granted unrelated role must remain');
    assert.ok(!serverRoles.has(ids.old) && !serverRoles.has(ids.extraOld));
    assert.deepEqual(requests, [['PUT', ids.next], ['DELETE', ids.old], ['DELETE', ids.extraOld]]);
    assert.deepEqual(member._roles, initial, 'test must not update the original Gateway cache');
  });
}
