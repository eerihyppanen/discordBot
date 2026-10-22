import { SlashCommandBuilder, EmbedBuilder } from "discord.js";

import { fetchPCPlayer, pubgHeaders, PUBG_SHARD } from "../utils/pubgClient.js";

const command = {
  data: new SlashCommandBuilder()
    .setName('pubg')
    .setDescription('Check PUBG Steam PC player stats')
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
        await interaction.editReply('Player not found!');
        return;
      }

      // Get recent match for additional stats
      const matchId = player.relationships?.matches?.data?.[0]?.id;
      let matchStats = null;
      
      if (matchId) {
        const matchResponse = await fetch(`https://api.pubg.com/shards/${shard}/matches/${matchId}`, {
          headers: pubgHeaders(),
          signal: AbortSignal.timeout(20000)
        });
        
        if (matchResponse.ok) {
          const matchData = await matchResponse.json();
          const playerNameLower = player.attributes.name.toLowerCase();
          const participant = matchData.included.find(item => 
            item.type === 'participant' &&
            (
              item.attributes?.stats?.playerId === player.id ||
              item.attributes?.stats?.name?.toLowerCase() === playerNameLower
            )
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
          { name: 'Shard', value: `${shard.toUpperCase()}`, inline: true }
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