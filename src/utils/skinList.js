import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags, escapeMarkdown } from 'discord.js';
import { skins, emptyCollection } from './skinSystem.js';

export const displaySkinName = (name) => {
  const escaped = escapeMarkdown(String(name));
  return escaped.length > 200 ? escaped.slice(0, 199) + '…' : escaped;
};

export const renderSkinList = (user, collection = emptyCollection(), requestedPage = 0) => {
  if (collection.skins.length === 0) {
    return { content: "📦 You haven't unboxed any legendary skins yet! Use `/lege add` when you get one!", embeds: [], components: [] };
  }
  const perPage = 10;
  const pages = Math.ceil(collection.skins.length / perPage);
  const page = Math.max(0, Math.min(requestedPage, pages - 1));
  const offset = page * perPage;
  const entries = collection.skins.slice().reverse().slice(offset, offset + perPage);
  const description = entries.map((skin, index) =>
    `**${collection.skins.length - offset - index}.** ${displaySkinName(skin.name)} - <t:${Math.floor(skin.unboxedAt / 1000)}:d>`
  ).join('\n');
  const embed = new EmbedBuilder()
    .setColor('#9b59b6')
    .setTitle(`📋 ${user.username}'s Legendary Collection`)
    .setDescription(description)
    .addFields(
      { name: '📊 Total Count', value: `${collection.totalLegendary} legendary skins`, inline: true },
      { name: '📄 Page', value: `${page + 1}/${pages}`, inline: true },
    );
  const components = pages <= 1 ? [] : [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`lege:list:${user.id}:${Math.max(0, page - 1)}`).setLabel('Previous').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
    new ButtonBuilder().setCustomId(`lege:list:${user.id}:${page + 1}`).setLabel('Next').setStyle(ButtonStyle.Secondary).setDisabled(page === pages - 1),
  )];
  return { content: '', embeds: [embed], components };
};

export const handleSkinButton = async (interaction) => {
  const match = /^lege:list:(\d{1,20}):(\d{1,8})$/.exec(interaction.customId);
  if (!match || interaction.user.id !== match[1]) {
    return interaction.reply({ content: 'Only the person who opened this collection can use its navigation buttons.', flags: MessageFlags.Ephemeral });
  }
  await interaction.deferUpdate();
  const collection = (await skins.read())[match[1]] || emptyCollection();
  return interaction.editReply(renderSkinList(interaction.user, collection, Number(match[2])));
};
