import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { updatePlayerWins } from "../utils/pubgWinsSystem.js";

const PUBG_HEADERS = () => ({
  'Authorization': `Bearer ${process.env.PUBG_API_KEY}`,
  'Accept': 'application/vnd.api+json'
});

const getShardCandidates = (region, platform) => {
  const pcShards = ['pc-eu', 'pc-na', 'pc-as', 'pc-oc', 'pc-sa', 'steam'];
  const consoleShards = ['console', 'xbox', 'psn'];
  const candidates = [region, platform];

  if (platform === 'steam') {
    candidates.push(...pcShards);
  } else {
    candidates.push(...consoleShards);
  }

  return [...new Set(candidates)];
};

const fetchPlayerFromShard = async (username, shard) => {
  const response = await fetch(
    `https://api.pubg.com/shards/${shard}/players?filter[playerNames]=${encodeURIComponent(username)}`,
    { headers: PUBG_HEADERS() }
  );

  if (!response.ok) return null;

  const json = await response.json();
  if (!json.data || json.data.length === 0) return null;

  return json.data[0];
};

const resolvePlayerWithMatches = async (username, region, platform) => {
  const shardCandidates = getShardCandidates(region, platform);
  let fallbackPlayer = null;
  let fallbackShard = null;

  for (const shard of shardCandidates) {
    try {
      const player = await fetchPlayerFromShard(username, shard);
      if (!player) continue;

      const matchCount = player.relationships?.matches?.data?.length || 0;
      if (matchCount > 0) {
        return { player, shard };
      }

      if (!fallbackPlayer) {
        fallbackPlayer = player;
        fallbackShard = shard;
      }
    } catch (error) {
      console.error(`Error fetching player on shard ${shard}:`, error);
    }
  }

  if (fallbackPlayer) {
    return { player: fallbackPlayer, shard: fallbackShard };
  }

  return null;
};

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
      const resolved = await resolvePlayerWithMatches(username, region, platform);

      if (!resolved) {
        await interaction.editReply('❌ Player not found!');
        return;
      }

      const { player, shard } = resolved;

      // Get lifetime stats from recent matches
      const matchIds = (player.relationships?.matches?.data || []).slice(0, 20).map((m) => m.id); // Last 20 matches

      if (matchIds.length === 0) {
        await interaction.editReply(`❌ Found player **${player.attributes.name}** but no recent matches were returned by PUBG API on shard **${shard}**. Try another region.`);
        return;
      }
      
      let totalWins = 0;
      let analyzedMatches = 0;
      let kills = 0;
      let damageDealt = 0;
      const playerNameLower = player.attributes.name.toLowerCase();
      
      // Fetch and analyze recent matches
      for (const matchId of matchIds) {
        try {
          const matchResponse = await fetch(`https://api.pubg.com/shards/${shard}/matches/${matchId}`, {
            headers: PUBG_HEADERS()
          });
          
          if (matchResponse.ok) {
            const matchData = await matchResponse.json();
            const participant = matchData.included.find((item) => 
              item.type === 'participant' &&
              (
                item.attributes?.stats?.playerId === player.id ||
                item.attributes?.stats?.name?.toLowerCase() === playerNameLower
              )
            );
            
            if (participant) {
              const stats = participant.attributes.stats;
              analyzedMatches += 1;
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

      if (analyzedMatches === 0) {
        await interaction.editReply(`❌ Found matches on shard **${shard}**, but could not map participant stats for **${player.attributes.name}**. Try again in a moment.`);
        return;
      }
      
      const totalMatches = analyzedMatches;
      const winRate = totalMatches > 0 ? ((totalWins / totalMatches) * 100).toFixed(1) : 0;
      const avgKills = totalMatches > 0 ? (kills / totalMatches).toFixed(1) : 0;
      const avgDamage = totalMatches > 0 ? Math.round(damageDealt / totalMatches) : 0;
      
      // Update tracked stats
      await updatePlayerWins(username, platform, shard, totalWins, totalMatches, parseFloat(winRate));
      
      const embed = new EmbedBuilder()
        .setColor('#FFD700')
        .setTitle(`🏆 PUBG Win Statistics`)
        .setDescription(`**${player.attributes.name}**\n${platform.toUpperCase()} • ${shard.toUpperCase()}`)
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
