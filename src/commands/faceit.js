import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getFaceitStats, faceitErrorMessage } from '../utils/faceitClient.js';
import { truncateText } from '../utils/text.js';
import { profiles } from '../utils/profileSystem.js';

const command = {
  data: new SlashCommandBuilder()
    .setName('faceit')
    .setDescription('Check FACEIT stats for a player')
    .addStringOption(option =>
      option.setName('username')
        .setDescription('FACEIT username (default: your saved profile)')
        .setMinLength(1)
        .setMaxLength(50)
    ),
  
  async execute(interaction) {
    let username = interaction.options.getString('username');
    
    await interaction.deferReply();
    
    // Check if API key is configured
    if (!process.env.FACEIT_API_KEY || process.env.FACEIT_API_KEY === 'your_faceit_api_key_here') {
      await interaction.editReply('❌ FACEIT API key not configured. Please contact the bot administrator.');
      return;
    }
    
    try {
      username ??= (await profiles.get(interaction.user.id)).faceit;
      if (typeof username !== 'string' || !username.trim() || username.trim().length > 50) {
        return interaction.editReply('❌ Enter a FACEIT username of 1–50 characters or save one with `/profile set faceit:<username>`.');
      }
      const { player: playerData, profile: cs2Stats, lifetime, game } = await getFaceitStats(username.trim());
      const stat = (key, suffix = '') => lifetime[key] == null
        ? 'N/A' : truncateText(`${lifetime[key]}${suffix}`, 100);
      
      const embed = new EmbedBuilder()
        .setColor(getFaceitLevelColor(cs2Stats.skill_level))
        .setTitle(`🎯 FACEIT ${game.toUpperCase()} Stats: ${truncateText(playerData.nickname, 80)}`)
        .setURL(`https://www.faceit.com/en/players/${encodeURIComponent(playerData.nickname)}`)
        .setThumbnail(playerData.avatar || null)
        .addFields(
          { name: 'Level', value: `${cs2Stats.skill_level}`, inline: true },
          { name: 'ELO', value: `${cs2Stats.faceit_elo}`, inline: true },
          { name: 'Country', value: `${playerData.country || 'Unknown'}`, inline: true },
          { name: 'Matches', value: stat('Matches'), inline: true },
          { name: 'Wins', value: stat('Wins'), inline: true },
          { name: 'Win Rate', value: stat('Win Rate %', '%'), inline: true },
          { name: 'K/D Ratio', value: stat('Average K/D Ratio'), inline: true },
          { name: 'Headshots %', value: stat('Average Headshots %', '%'), inline: true }
        )
        .setFooter({ text: 'Powered by FACEIT API' })
        .setTimestamp();
      
      await interaction.editReply({ embeds: [embed] });
      
    } catch (error) {
      console.error('FACEIT API Error:', error);
      await interaction.editReply(faceitErrorMessage(error));
    }
  },
};

// Get color based on FACEIT level
const getFaceitLevelColor = (level) => {
  const colors = {
    1: '#9B9B9B',  // Gray
    2: '#5EB85E',  // Green
    3: '#5EB85E',
    4: '#4E94E6',  // Blue
    5: '#4E94E6',
    6: '#F4A531',  // Orange
    7: '#F4A531',
    8: '#F4A531',
    9: '#FF6B35',  // Red
    10: '#FF3030'  // Bright Red
  };
  return colors[level] || '#9B9B9B';
};

export default command;
