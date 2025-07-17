import { SlashCommandBuilder, EmbedBuilder } from "discord.js";

const command = {
  data: new SlashCommandBuilder()
    .setName('faceit')
    .setDescription('Check FACEIT stats for a player')
    .addStringOption(option =>
      option.setName('username')
        .setDescription('FACEIT username to lookup')
        .setRequired(true)
    ),
  
  async execute(interaction) {
    const username = interaction.options.getString('username');
    
    await interaction.deferReply();
    
    // Check if API key is configured
    if (!process.env.FACEIT_API_KEY || process.env.FACEIT_API_KEY === 'your_faceit_api_key_here') {
      await interaction.editReply('❌ FACEIT API key not configured. Please contact the bot administrator.');
      return;
    }
    
    try {
      // Get player data from FACEIT API
      const playerResponse = await fetch(`https://open.faceit.com/data/v4/players?nickname=${username}`, {
        headers: {
          'Authorization': `Bearer ${process.env.FACEIT_API_KEY}`,
          'Accept': 'application/json'
        }
      });
      
      if (!playerResponse.ok) {
        await interaction.editReply('Player not found on FACEIT!');
        return;
      }
      
      const playerData = await playerResponse.json();
      
      // Get CS2 stats
      const cs2Stats = playerData.games.cs2 || playerData.games.csgo;
      
      if (!cs2Stats) {
        await interaction.editReply('No CS2/CSGO data found for this player!');
        return;
      }
      
      const embed = new EmbedBuilder()
        .setColor(getFaceitLevelColor(cs2Stats.skill_level))
        .setTitle(`🎯 FACEIT Stats: ${playerData.nickname}`)
        .setURL(`https://www.faceit.com/en/players/${playerData.nickname}`)
        .setThumbnail(playerData.avatar || null)
        .addFields(
          { name: 'Level', value: `${cs2Stats.skill_level}`, inline: true },
          { name: 'ELO', value: `${cs2Stats.faceit_elo}`, inline: true },
          { name: 'Country', value: `${playerData.country || 'Unknown'}`, inline: true },
          { name: 'Matches', value: `${cs2Stats.lifetime?.Matches || 'N/A'}`, inline: true },
          { name: 'Wins', value: `${cs2Stats.lifetime?.Wins || 'N/A'}`, inline: true },
          { name: 'Win Rate', value: `${cs2Stats.lifetime?.['Win Rate %'] || 'N/A'}%`, inline: true },
          { name: 'K/D Ratio', value: `${cs2Stats.lifetime?.['Average K/D Ratio'] || 'N/A'}`, inline: true },
          { name: 'Headshots %', value: `${cs2Stats.lifetime?.['Average Headshots %'] || 'N/A'}%`, inline: true }
        )
        .setFooter({ text: 'Powered by FACEIT API' })
        .setTimestamp();
      
      await interaction.editReply({ embeds: [embed] });
      
    } catch (error) {
      console.error('FACEIT API Error:', error);
      await interaction.editReply('Error fetching FACEIT data. Please try again later.');
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