import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { economy } from '../utils/economySystem.js';

const command = {
  data: new SlashCommandBuilder()
    .setName('balance')
    .setDescription('Check your balance')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('Check another user\'s balance')
        .setRequired(false)
    ),
  
  async execute(interaction) {
    const targetUser = interaction.options.getUser('user') || interaction.user;
    await interaction.deferReply();
    const userEconomy = await economy.getBalance(targetUser.id);

    const embed = new EmbedBuilder()
      .setColor('#ffd700')
      .setTitle(`💰 ${targetUser.username}'s Balance`)
      .addFields(
        { name: '💵 Wallet', value: `${userEconomy.coins} coins`, inline: true }
      )
      .setThumbnail(targetUser.displayAvatarURL())
      .setTimestamp();
    
    await interaction.editReply({ embeds: [embed] });
  },
};

export default command;
