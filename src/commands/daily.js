import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { economy } from '../utils/economySystem.js';

const command = {
  data: new SlashCommandBuilder()
    .setName('daily')
    .setDescription('Claim your daily reward'),
  
  async execute(interaction) {
    await interaction.deferReply();
    const result = await economy.claimDaily(interaction.user.id);
    if (!result.claimed) {
      const hours = Math.floor(result.timeLeft / (60 * 60 * 1000));
      const minutes = Math.floor((result.timeLeft % (60 * 60 * 1000)) / (60 * 1000));
      return interaction.editReply(`⏰ You already claimed your daily reward! Come back in ${hours}h ${minutes}m`);
    }
    const { reward, balance } = result;

    const embed = new EmbedBuilder()
      .setColor('#00ff00')
      .setTitle('🎁 Daily Reward Claimed!')
      .setDescription(`You received **${reward} coins**!`)
      .addFields(
        { name: 'New Balance', value: `${balance} coins`, inline: true }
      )
      .setTimestamp();
    
    await interaction.editReply({ embeds: [embed] });
  },
};

export default command;