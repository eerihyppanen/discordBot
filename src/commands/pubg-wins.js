import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { updatePlayerWins, getPlayerWins } from "../utils/pubgWinsSystem.js";

const command = {
  data: new SlashCommandBuilder()
    .setName('pubg-wins')
    .setDescription('Track and display PUBG player win statistics')
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
    const region = interaction.options.getString('region') || 'pc-eu';
    
    await interaction.deferReply();
    
    // Check if API key is configured
    if (!process.env.PUBG_API_KEY || process.env.PUBG_API_KEY === 'your_pubg_api_key_here') {
      await interaction.editReply('❌ PUBG API key not configured. Please contact the bot administrator.');
      return;
    }
    
    try {
      // Get player info
      const playerResponse = await fetch(`https://api.pubg.com/shards/${region}/players?filter[playerNames]=${username}`, {
        headers: {
          'Authorization': `Bearer ${process.env.PUBG_API_KEY}`,
          'Accept': 'application/vnd.api+json'
        }
      });
      
      if (!playerResponse.ok) {
        await interaction.editReply('❌ Player not found or API error!');
        return;
      }
      
      const playerData = await playerResponse.json();
      
      if (!playerData.data || playerData.data.length === 0) {
        await interaction.editReply('❌ Player not found!');
        return;
      }
      
      const player = playerData.data[0];
      
      // Get lifetime stats from recent matches
      const matchIds = player.relationships.matches.data.slice(0, 20).map(m => m.id); // Last 20 matches
      
      let totalWins = 0;
      let totalMatches = matchIds.length;
      let kills = 0;
      let damageDealt = 0;
      
      // Fetch and analyze recent matches
      for (const matchId of matchIds) {
        try {
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
              const stats = participant.attributes.stats;
              if (stats.winPlace === 1) {
                totalWins++;
              }
              kills += stats.kills || 0;
              damageDealt += stats.damageDealt || 0;
            }
          }
        } catch (error) {
          console.error(`Error fetching match ${matchId}:`, error);
        }
      }
      
      const winRate = totalMatches > 0 ? ((totalWins / totalMatches) * 100).toFixed(1) : 0;
      const avgKills = totalMatches > 0 ? (kills / totalMatches).toFixed(1) : 0;
      const avgDamage = totalMatches > 0 ? Math.round(damageDealt / totalMatches) : 0;
      
      // Update tracked stats
      await updatePlayerWins(username, platform, region, totalWins, totalMatches, parseFloat(winRate));
      
      // Get previous stats to show change
      const previousStats = await getPlayerWins(username, platform, region);
      
      const embed = new EmbedBuilder()
        .setColor('#FFD700')
        .setTitle(`🏆 PUBG Win Statistics`)
        .setDescription(`**${player.attributes.name}**\n${platform.toUpperCase()} • ${region.toUpperCase()}`)
        .addFields(
          { name: '📊 Recent Stats (Last 20 Matches)', value: '━━━━━━━━━━━━━━━━', inline: false },
          { name: '🏅 Wins', value: `${totalWins}`, inline: true },
          { name: '🎮 Matches', value: `${totalMatches}`, inline: true },
          { name: '📈 Win Rate', value: `${winRate}%`, inline: true },
          { name: '💀 Avg Kills', value: `${avgKills}`, inline: true },
          { name: '💥 Avg Damage', value: `${avgDamage}`, inline: true },
          { name: '🎯 K/D Ratio', value: `${avgKills}`, inline: true }
        )
        .setFooter({ text: 'Stats based on last 20 matches • Use /pubg-leaderboard to see rankings' })
        .setTimestamp();
      
      await interaction.editReply({ embeds: [embed] });
      
    } catch (error) {
      console.error('PUBG Wins API Error:', error);
      await interaction.editReply('❌ Error fetching PUBG win data. Please try again later.');
    }
  },
};

export default command;
