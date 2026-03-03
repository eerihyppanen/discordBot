import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { updatePlayerWins } from "../utils/pubgWinsSystem.js";

const command = {
  data: new SlashCommandBuilder()
    .setName('pubg-wins-add')
    .setDescription('Manually add or update PUBG player win statistics')
    .addStringOption(option =>
      option.setName('username')
        .setDescription('PUBG username')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('platform')
        .setDescription('Gaming platform')
        .setRequired(true)
        .addChoices(
          { name: 'Steam (PC)', value: 'steam' },
          { name: 'Xbox', value: 'xbox' },
          { name: 'PlayStation', value: 'psn' }
        )
    )
    .addIntegerOption(option =>
      option.setName('wins')
        .setDescription('Number of wins')
        .setRequired(true)
        .setMinValue(0)
    )
    .addIntegerOption(option =>
      option.setName('matches')
        .setDescription('Total matches played')
        .setRequired(true)
        .setMinValue(1)
    )
    .addStringOption(option =>
      option.setName('region')
        .setDescription('Server region')
        .setRequired(false)
        .addChoices(
          { name: 'Europe', value: 'pc-eu' },
          { name: 'North America', value: 'pc-na' },
          { name: 'Asia', value: 'pc-as' },
          { name: 'Oceania', value: 'pc-oc' },
          { name: 'South America', value: 'pc-sa' },
          { name: 'Console (Global)', value: 'console' }
        )
    ),
  
  async execute(interaction) {
    const username = interaction.options.getString('username');
    const platform = interaction.options.getString('platform');
    const wins = interaction.options.getInteger('wins');
    const matches = interaction.options.getInteger('matches');
    const region = interaction.options.getString('region') || 'pc-eu';
    
    await interaction.deferReply();
    
    // Validate input
    if (wins > matches) {
      await interaction.editReply('❌ Wins cannot be greater than total matches!');
      return;
    }
    
    try {
      const winRate = ((wins / matches) * 100).toFixed(1);
      
      // Update player stats
      await updatePlayerWins(username, platform, region, wins, matches, parseFloat(winRate));
      
      const embed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle('✅ PUBG Stats Updated')
        .setDescription(`**${username}** stats have been manually updated!`)
        .addFields(
          { name: '🎮 Platform', value: platform.toUpperCase(), inline: true },
          { name: '🌍 Region', value: region, inline: true },
          { name: '\u200B', value: '\u200B', inline: true },
          { name: '🏅 Wins', value: `${wins}`, inline: true },
          { name: '🎮 Matches', value: `${matches}`, inline: true },
          { name: '📈 Win Rate', value: `${winRate}%`, inline: true }
        )
        .setFooter({ text: 'Use /pubg-leaderboard to see updated rankings' })
        .setTimestamp();
      
      await interaction.editReply({ embeds: [embed] });
      
    } catch (error) {
      console.error('Manual PUBG update error:', error);
      await interaction.editReply('❌ Error updating player stats. Please try again.');
    }
  },
};

export default command;
