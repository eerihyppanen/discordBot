import { EmbedBuilder, MessageFlags } from 'discord.js';
import { economy } from './economySystem.js';
import { COSMETICS, CosmeticError } from './cosmeticCatalog.js';

const nameFor = id => COSMETICS.find(item => item.id === id)?.name ?? 'None equipped';
const equippedFields = inventory => [
  { name: 'Cosmetic title', value: nameFor(inventory.equipped.title), inline: true },
  { name: 'Badge', value: nameFor(inventory.equipped.badge), inline: true },
];
const inventoryEmbed = inventory => new EmbedBuilder().setColor('#5865f2').setTitle('Your cosmetic inventory')
  .setDescription(inventory.owned.length ? inventory.owned.map(id => COSMETICS.find(item => item.id === id)?.name ?? 'Retired cosmetic').join('\n') : 'No cosmetics yet. Browse /profile shop.')
  .addFields(...equippedFields(inventory)).setFooter({ text: 'Equip with /profile equip. Cosmetics do not change XP, rewards or Discord roles.' });

export const handleCosmeticProfile = async (interaction, operation) => {
  await interaction.deferReply(operation === 'card' ? {} : { flags: MessageFlags.Ephemeral });
  try {
    if (operation === 'card') {
      const target = interaction.options.getUser('user') ?? interaction.user;
      const inventory = await economy.getCosmetics(target.id);
      const embed = new EmbedBuilder().setColor('#5865f2').setTitle(`${target.username}'s profile`)
        .setThumbnail(target.displayAvatarURL?.() ?? null).addFields(...equippedFields(inventory))
        .setFooter({ text: 'Make it yours with /profile shop. Game usernames stay private.' });
      return interaction.editReply({ embeds: [embed], allowedMentions: { parse: [] } });
    }
    if (operation === 'shop') {
      const embed = new EmbedBuilder().setColor('#ffd700').setTitle('Cosmetic shop')
        .setDescription('Spend wallet coins on permanent titles and badges. Buy with /profile buy, then choose /profile equip.')
        .addFields(...COSMETICS.map(item => ({ name: `${item.name} • ${item.price} coins`, value: item.type === 'title' ? 'Profile title' : 'Profile badge', inline: true })))
        .setFooter({ text: 'One-time purchases. Visual only: no XP, reward or permission bonuses.' });
      return interaction.editReply({ embeds: [embed] });
    }
    if (operation === 'buy') {
      const result = await economy.buyCosmetic(interaction.user.id, interaction.options.getString('item'));
      const content = result.alreadyOwned
        ? `You already own ${result.item.name}. No coins were charged. Wallet: ${result.balance} coins.`
        : `✅ Purchased ${result.item.name} for ${result.item.price} coins. Wallet: ${result.balance} coins. Choose /profile equip to wear it.`;
      return interaction.editReply({ content, allowedMentions: { parse: [] } });
    }
    let inventory, content = '';
    if (operation === 'equip') {
      inventory = await economy.equipCosmetic(interaction.user.id, interaction.options.getString('item'));
      content = '✅ Cosmetic equipped. Show it with /profile card.';
    } else if (operation === 'unequip') {
      inventory = await economy.unequipCosmetic(interaction.user.id, interaction.options.getString('type'));
      content = '✅ Cosmetic unequipped. Your purchased items remain in your inventory.';
    } else inventory = await economy.getCosmetics(interaction.user.id);
    return interaction.editReply({ content, embeds: [inventoryEmbed(inventory)], allowedMentions: { parse: [] } });
  } catch (error) {
    if (!(error instanceof CosmeticError)) throw error;
    return interaction.editReply({ content: `❌ ${error.message}`, allowedMentions: { parse: [] } });
  }
};
