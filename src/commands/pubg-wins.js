import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { updatePlayerWins } from "../utils/pubgWinsSystem.js";

import { fetchPCPlayer, pubgHeaders, PUBG_SHARD } from "../utils/pubgClient.js";

const command = {
  data: new SlashCommandBuilder()
    .setName('pubg-wins')
    .setDescription('Track and display PUBG Steam PC player win statistics')
    .addStringOption(option =>
      option.setName('username')
        .setDescription('PUBG username to lookup')
        .setRequired(true)
    ),
  
  async execute(interaction) {
    const username = interaction.options.getString('username');
    const platform = 'steam';
    
    await interaction.deferReply();
    
    // Check if API key is configured
    if (!process.env.PUBG_API_KEY || process.env.PUBG_API_KEY === 'your_pubg_api_key_here') {
      await interaction.editReply('❌ PUBG API key not configured. Please contact the bot administrator.');
      return;
    }
    
    try {
      const player = await fetchPCPlayer(username);
      const shard = PUBG_SHARD;

      if (!player) {
        await interaction.editReply('❌ Player not found!');
        return;
      }

      // Get lifetime stats from recent matches
      const matchIds = (player.relationships?.matches?.data || []).slice(0, 20).map((m) => m.id); // Last 20 matches

      if (matchIds.length === 0) {
        await interaction.editReply(`❌ Found player **${player.attributes.name}** but no recent matches were returned by PUBG API on shard **${shard}**. Try again after playing a match.`);
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
            headers: pubgHeaders(),
            signal: AbortSignal.timeout(20000)
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
      await updatePlayerWins(player.attributes.name, platform, shard, totalWins, totalMatches, parseFloat(winRate));
      
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
