import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ModalBuilder, StringSelectMenuBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { profiles } from './profileSystem.js';
import { economy } from './economySystem.js';
import { COSMETICS } from './cosmeticCatalog.js';

export const profileControlId = (owner, view, action, target) => `profile:${owner}:${view}:${action}:${target}`;
const row = (...components) => new ActionRowBuilder().addComponents(...components);
const button = (owner, view, action, target, label, disabled = false, style = ButtonStyle.Secondary) => new ButtonBuilder()
  .setCustomId(profileControlId(owner, view, action, target)).setLabel(label).setDisabled(disabled).setStyle(style);
const nameFor = id => COSMETICS.find(item => item.id === id)?.name ?? 'None equipped';
const equippedFields = inventory => [
  { name: 'Cosmetic title', value: nameFor(inventory.equipped.title), inline: true },
  { name: 'Badge', value: nameFor(inventory.equipped.badge), inline: true },
];
const payload = (embed, components = [], content = '') => ({ content, embeds: [embed], components, allowedMentions: { parse: [] } });

export const renderProfileCard = async user => payload(new EmbedBuilder().setColor('#5865f2').setTitle(`${user.username}'s profile`)
  .setThumbnail(user.displayAvatarURL?.() ?? null).addFields(...equippedFields(await economy.getCosmetics(user.id)))
  .setFooter({ text: 'Manage your look with /profile inventory. Game usernames stay private.' }));

export const renderProfilePanel = async (view, owner, content = '') => {
  if (view === 'settings') {
    const settings = await profiles.get(owner);
    const embed = new EmbedBuilder().setColor('#5865f2').setTitle('Your game usernames')
      .addFields({ name: 'PUBG Steam', value: settings.pubg ?? 'Not saved', inline: true }, { name: 'FACEIT', value: settings.faceit ?? 'Not saved', inline: true })
      .setFooter({ text: 'Edit a saved name, then omit username in /pubg stats or /faceit.' });
    return payload(embed, [row(
      button(owner, view, 'edit', 'pubg', 'Edit PUBG', false, ButtonStyle.Primary),
      button(owner, view, 'edit', 'faceit', 'Edit FACEIT', false, ButtonStyle.Primary),
      button(owner, view, 'clear', 'pubg', 'Clear PUBG', !settings.pubg),
      button(owner, view, 'clear', 'faceit', 'Clear FACEIT', !settings.faceit),
      button(owner, view, 'clear', 'all', 'Clear all', !settings.pubg && !settings.faceit, ButtonStyle.Danger),
    )], content);
  }
  const inventory = await economy.getCosmetics(owner);
  if (view === 'shop') {
    const wallet = await economy.getBalance(owner);
    const embed = new EmbedBuilder().setColor('#ffd700').setTitle('Cosmetic shop')
      .setDescription(`Wallet: **${wallet.coins} coins**. Choose a purchase button, then open your inventory to equip it.`)
      .addFields(...COSMETICS.map(item => ({ name: `${item.name} • ${item.price} coins`, value: inventory.owned.includes(item.id) ? 'Owned' : item.type === 'title' ? 'Profile title' : 'Profile badge', inline: true })))
      .setFooter({ text: 'One-time purchases. Cosmetics do not change XP, rewards or permissions.' });
    const purchases = COSMETICS.map(item => button(owner, view, 'buy', item.id,
      `${inventory.owned.includes(item.id) ? 'Owned:' : 'Buy'} ${item.name}`, inventory.owned.includes(item.id), ButtonStyle.Primary));
    return payload(embed, [row(...purchases.slice(0, 3)), row(...purchases.slice(3)), row(button(owner, view, 'open', 'inventory', 'Open inventory'))], content);
  }
  const embed = new EmbedBuilder().setColor('#5865f2').setTitle('Your cosmetic inventory')
    .setDescription(inventory.owned.length ? inventory.owned.map(id => COSMETICS.find(item => item.id === id)?.name ?? 'Retired cosmetic').join('\n') : 'No cosmetics yet. Open the shop to find your first item.')
    .addFields(...equippedFields(inventory)).setFooter({ text: 'Choose an owned title or badge. Removing a selection keeps the item in your inventory.' });
  const components = [];
  for (const type of ['title', 'badge']) {
    const owned = COSMETICS.filter(item => item.type === type && inventory.owned.includes(item.id));
    if (owned.length) components.push(row(new StringSelectMenuBuilder().setCustomId(profileControlId(owner, 'inventory', 'equip', type))
      .setPlaceholder(`Choose your ${type}`).setMinValues(1).setMaxValues(1)
      .addOptions(owned.map(item => ({ label: item.name, value: item.id, default: inventory.equipped[type] === item.id })))));
  }
  components.push(row(
    button(owner, 'inventory', 'remove', 'title', 'Remove title', !inventory.equipped.title),
    button(owner, 'inventory', 'remove', 'badge', 'Remove badge', !inventory.equipped.badge),
    button(owner, 'inventory', 'remove', 'all', 'Remove all', !inventory.equipped.title && !inventory.equipped.badge),
    button(owner, 'inventory', 'open', 'shop', 'Open shop'),
  ));
  return payload(embed, components, content);
};

export const profileNameModal = async (owner, game) => {
  const settings = await profiles.get(owner);
  const input = new TextInputBuilder().setCustomId('username').setLabel(game === 'pubg' ? 'PUBG Steam username' : 'FACEIT username')
    .setStyle(TextInputStyle.Short).setRequired(true).setMinLength(1).setMaxLength(game === 'pubg' ? 64 : 50);
  if (settings[game]) input.setValue(settings[game]);
  return new ModalBuilder().setCustomId(profileControlId(owner, 'settings', 'save', game))
    .setTitle(game === 'pubg' ? 'Edit PUBG username' : 'Edit FACEIT username').addComponents(row(input));
};
