import { SlashCommandBuilder, EmbedBuilder } from "discord.js";

const command = {
  data: new SlashCommandBuilder()
    .setName('pubg')
    .setDescription('Check PUBG player stats')
    .addStringOption(option =>
      option.setName('username')
        .setDescription('PUBG username to lookup')
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
    const region = interaction.options.getString('region') || 'pc-eu'; // Default to EU
    
    await interaction.deferReply();
    
    // Check if API key is configured
    if (!process.env.PUBG_API_KEY || process.env.PUBG_API_KEY === 'your_pubg_api_key_here') {
      await interaction.editReply('❌ PUBG API key not configured. Please contact the bot administrator.');
      return;
    }
    
    try {
      // Use correct regional endpoint
      const playerResponse = await fetch(`https://api.pubg.com/shards/${region}/players?filter[playerNames]=${username}`, {
        headers: {
          'Authorization': `Bearer ${process.env.PUBG_API_KEY}`,
          'Accept': 'application/vnd.api+json'
        }
      });
      
      if (!playerResponse.ok) {
        await interaction.editReply('Player not found or API error!');
        return;
      }
      
      const playerData = await playerResponse.json();
      
      if (!playerData.data || playerData.data.length === 0) {
        await interaction.editReply('Player not found!');
        return;
      }
      
      const player = playerData.data[0];
      
      // Get recent match for additional stats
      const matchId = player.relationships.matches.data[0]?.id;
      let matchStats = null;
      
      if (matchId) {
        const matchResponse = await fetch(`https://api.pubg.com/shards/${region}/matches/${matchId}`, {
          headers: {
            'Authorization': `Bearer ${process.env.PUBG_API_KEY}`,
            'Accept': 'application/vnd.api+json'
          }
        });
        
        if (matchResponse.ok) {
          const matchData = await matchResponse.json();
          const participant = matchData.included.find(item => 
            item.type === 'participant' && 
            item.attributes.stats.playerId === player.id
          );
          if (participant) {
            matchStats = participant.attributes.stats;
          }
        }
      }
      
      const embed = new EmbedBuilder()
        .setColor('#FF6B35')
        .setTitle(`🔫 PUBG Stats: ${player.attributes.name}`)
        .addFields(
          { name: 'Player ID', value: `${player.attributes.name}`, inline: true },
          { name: 'Platform', value: `${platform.toUpperCase()}`, inline: true },
          { name: 'Status', value: '✅ Active', inline: true }
        );
      
      if (matchStats) {
        embed.addFields(
          { name: 'Last Match Stats', value: '━━━━━━━━━━━━━━━━', inline: false },
          { name: 'Kills', value: `${matchStats.kills}`, inline: true },
          { name: 'Damage Dealt', value: `${Math.round(matchStats.damageDealt)}`, inline: true },
          { name: 'Survival Time', value: `${Math.round(matchStats.timeSurvived / 60)} min`, inline: true },
          { name: 'Longest Kill', value: `${Math.round(matchStats.longestKill)}m`, inline: true },
          { name: 'Walk Distance', value: `${Math.round(matchStats.walkDistance)}m`, inline: true },
          { name: 'Rank', value: `#${matchStats.winPlace}`, inline: true }
        );
      }
      
      embed.setFooter({ text: 'Powered by PUBG API' })
           .setTimestamp();
      
      await interaction.editReply({ embeds: [embed] });
      
    } catch (error) {
      console.error('PUBG API Error:', error);
      await interaction.editReply('Error fetching PUBG data. Please try again later.');
    }
  },
};

export default command;