import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags, PermissionFlagsBits } from 'discord.js';
import { colonistGames } from './colonistGameSystem.js';
import { ColonistError } from './colonistSystem.js';
import { syncLevelRole } from './levelRoles.js';

// Discord HTTP edits may complete out of order even when state updates are queued.
// Read the latest state within the publication queue, including reopened cards.
const publications = new Map();
const publishGame = (id, update) => {
  const result = (publications.get(id) || Promise.resolve()).catch(() => {})
    .then(async () => update(await colonistGames.get(id)));
  publications.set(id, result);
  const cleanup = () => { if (publications.get(id) === result) publications.delete(id); };
  void result.then(cleanup, cleanup);
  return result;
};

const contextFor = interaction => ({ guildId: interaction.guildId, channelId: interaction.channelId });
const control = (game, action, label, style = ButtonStyle.Secondary, actorId) =>
  new ButtonBuilder().setCustomId(`colonist:game:${game.id}:${action}${actorId ? ':' + actorId : ''}`).setLabel(label).setStyle(style);
const row = (...buttons) => new ActionRowBuilder().addComponents(...buttons);
const humanInGuild = interaction => {
  if (!interaction.inGuild() || interaction.user.bot) throw new ColonistError('A human server member must use this command in a server channel.');
};

export const renderColonistGame = game => {
  const descriptions = {
    lobby: 'Liity peliin. Pelin luoja aloittaa, kun kaikki ovat mukana.',
    playing: 'Peli on käynnissä. Voittaja painaa lopuksi **Voitin** ja vahvistaa ilmoituksensa.',
    recording: 'Tuloksen tallennus on kesken. Valittu voittaja voi jatkaa tallennusta painikkeesta.',
    completed: 'Pelin tulos on tallennettu. Jokaiselle osallistujalle on kirjattu yksi peli.',
    cancelled: 'Peli on peruutettu. Tilastoihin ei kirjattu tulosta.',
  };
  const embed = new EmbedBuilder().setColor(game.status === 'completed' ? '#ffd700' : '#5865f2')
    .setTitle('🎲 Colonist-peli').setDescription(descriptions[game.status])
    .addFields(
      { name: 'Pelaajat', value: game.players.map(player => `<@${player.id}>`).join('\n') },
      { name: 'Pelin luoja', value: `<@${game.creatorId}>` },
    );
  let components = [];
  if (game.status === 'lobby') components = [row(
    control(game, 'join', 'Liity', ButtonStyle.Success), control(game, 'leave', 'Poistu'),
    control(game, 'start', 'Aloita', ButtonStyle.Primary), control(game, 'cancel', 'Peruuta', ButtonStyle.Danger),
  )];
  if (game.status === 'playing') components = [row(control(game, 'claim', 'Voitin', ButtonStyle.Success), control(game, 'cancel', 'Peruuta', ButtonStyle.Danger))];
  if (game.status === 'recording') components = [row(control(game, 'claim', 'Jatka tallennusta', ButtonStyle.Primary))];
  if (game.status === 'completed') {
    embed.addFields(
      { name: '🏆 Voittaja', value: `<@${game.winnerId}>` },
      { name: 'Muut pelaajat — häviö', value: game.players.filter(player => player.id !== game.winnerId).map(player => `<@${player.id}>`).join('\n') },
      { name: 'Palkinnot', value: game.result.rewarded
        ? `${game.result.xpReward} XP ja ${game.result.coinReward} kolikkoa voittajalle.`
        : 'Palkintojen aikaraja on vielä voimassa. Pelin tilastot kirjattiin normaalisti.' },
    );
  }
  return { content: '', embeds: [embed], components, allowedMentions: { parse: [] } };
};
const confirmation = (game, actorId) => ({
  content: 'Vahvistatko voittaneesi tämän pelin? Muille osallistujille kirjataan häviö.',
  embeds: [], components: [row(control(game, 'confirm', 'Vahvista', ButtonStyle.Success, actorId), control(game, 'dismiss', 'Takaisin', ButtonStyle.Secondary, actorId))],
  allowedMentions: { parse: [] },
});

export const openColonistGame = async interaction => {
  humanInGuild(interaction);
  await interaction.deferReply();
  const game = await colonistGames.create({ ...contextFor(interaction), creator: interaction.user, id: interaction.id });
  await publishGame(game.id, async current => {
    const message = await interaction.editReply(renderColonistGame(current));
    await colonistGames.attachMessage(current.id, message.id, contextFor(interaction));
  });
};
export const requestColonistWin = async interaction => {
  humanInGuild(interaction);
  const active = await colonistGames.activeFor(interaction.user.id);
  if (!active) throw new ColonistError('Avaa ensin peli komennolla /colonist game.');
  const game = await colonistGames.claim(active.id, interaction.user.id, contextFor(interaction));
  return interaction.reply({ ...confirmation(game, interaction.user.id), flags: MessageFlags.Ephemeral });
};

// Cancellation is durable before attempting to refresh a possibly deleted card.
export const cancelColonistGame = async (interaction, player = interaction.user) => {
  humanInGuild(interaction);
  if (!player || player.bot) throw new ColonistError('Select a human participant.');
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const active = await colonistGames.activeFor(player.id);
  if (!active) throw new ColonistError('Tällä pelaajalla ei ole keskeneräistä peliä.');
  const game = await colonistGames.cancel(active.id, interaction.user.id, contextFor(interaction), {
    isModerator: interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ?? false,
  });
  console.info('Colonist game cancelled:', { gameId: game.id, actorId: interaction.user.id, guildId: interaction.guildId });
  const updates = [
    Promise.resolve().then(() => interaction.editReply({ content: '✅ Peli peruutettu. Pelaajat voivat aloittaa uuden pelin.', embeds: [], components: [] })),
    publishGame(game.id, async current => {
      if (!current.messageId) return;
      const channel = current.channelId === interaction.channelId ? interaction.channel : await interaction.client.channels.fetch(current.channelId);
      if (channel?.messages) await channel.messages.edit(current.messageId, renderColonistGame(current));
    }),
  ];
  for (const result of await Promise.allSettled(updates)) if (result.status === 'rejected') console.error('Game cancelled, but Discord update failed:', result.reason);
};

export const handleColonistGameButton = async interaction => {
  let action, game;
  try {
    humanInGuild(interaction);
    const match = /^colonist:game:([a-z0-9_-]{6,40}):(join|leave|start|cancel|claim|confirm|dismiss)(?::(\d{1,20}))?$/.exec(interaction.customId);
    if (!match) throw new ColonistError('Virheellinen pelipainike. Avaa peli uudelleen komennolla /colonist game.');
    const [, id, operation, actorId] = match;
    action = operation;
    const privateAction = ['confirm', 'dismiss'].includes(action);
    if ((privateAction && actorId !== interaction.user.id) || (!privateAction && actorId)) throw new ColonistError('Tämä vahvistus kuuluu toiselle pelaajalle.');
    const context = contextFor(interaction);
    game = await colonistGames.get(id, context);
    if (action === 'claim') {
      await colonistGames.claim(id, interaction.user.id, context);
      return interaction.reply({ ...confirmation(game, interaction.user.id), flags: MessageFlags.Ephemeral });
    }
    await interaction.deferUpdate();
    if (action === 'dismiss') return interaction.editReply({ content: 'Voittoa ei vahvistettu.', embeds: [], components: [] });
    if (action === 'confirm') {
      game = await colonistGames.confirm(id, interaction.user.id, context);
      const updates = [
        Promise.resolve().then(() => interaction.editReply({ content: '✅ Tulos on tallennettu: voitto sinulle ja häviö muille osallistujille.', embeds: [], components: [] })),
        publishGame(game.id, current => current.messageId ? interaction.channel.messages.edit(current.messageId, renderColonistGame(current)) : undefined),
        Promise.resolve().then(() => interaction.guild.members.fetch(game.winnerId)).then(syncLevelRole),
      ];
      for (const result of await Promise.allSettled(updates)) if (result.status === 'rejected') console.error('Game saved, but Discord update failed:', result.reason);
      return;
    }
    const actor = action === 'join' ? interaction.user : interaction.user.id;
    game = await colonistGames[action](id, actor, context, { isModerator: interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ?? false });
    if (action === 'cancel') {
      try { await publishGame(game.id, current => interaction.editReply(renderColonistGame(current))); }
      catch (error) {
        console.error('Game cancelled, but Discord update failed:', error);
        await interaction.followUp({ content: '✅ Peli peruutettu. Pelaajat voivat aloittaa uuden pelin.', flags: MessageFlags.Ephemeral });
      }
      return;
    }
    return await publishGame(game.id, current => interaction.editReply(renderColonistGame(current)));
  } catch (error) {
    if (!(error instanceof ColonistError)) console.error('Colonist game interaction failed:', error);
    const content = error instanceof ColonistError ? `❌ ${error.message}` : '❌ Tallennus ei valmistunut. Voit yrittää samaa toimintoa uudelleen.';
    if (interaction.deferred) {
      if (action === 'confirm') return interaction.editReply({ content, embeds: [], components: error instanceof ColonistError || !game ? [] : confirmation(game, interaction.user.id).components });
      return interaction.followUp({ content, flags: MessageFlags.Ephemeral });
    }
    return interaction.reply({ content, flags: MessageFlags.Ephemeral });
  }
};
