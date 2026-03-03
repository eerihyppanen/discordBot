import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getTopPlayers } from "../utils/pubgWinsSystem.js";

const command = {
  data: new SlashCommandBuilder()
    .setName('pubg-leaderboard')
    .setDescription('Display top PUBG players by wins'),
  
  async execute(interaction) {
    await interaction.deferReply();
    
    try {
      const topPlayers = await getTopPlayers(10);
      
      if (topPlayers.length === 0) {
        await interaction.editReply('📊 No players tracked yet! Use `/pubg-wins` to start tracking players.');
        return;
      }
      
      const embed = new EmbedBuilder()
        .setColor('#FFD700')
        .setTitle('🏆 PUBG Win Leaderboard')
        .setDescription('Top 10 Players by Recent Win Count')
        .setTimestamp();
      
      // Create leaderboard text
      const leaderboardText = topPlayers.map((player, index) => {
        const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
        const platformIcon = player.platform === 'steam' ? '🖥️' : player.platform === 'xbox' ? '🎮' : '🎮';
        
        return [
          `${medal} **${player.username}**`,
          `   ${platformIcon} ${player.platform.toUpperCase()} • ${player.region}`,
          `   🏅 ${player.wins} wins • 📊 ${player.winRate}% WR • 🎮 ${player.totalMatches} matches`,
          ''
        ].join('\n');
      }).join('\n');
      
      embed.setDescription(leaderboardText || 'No players found');
      embed.setFooter({ text: 'Stats based on last 20 matches per player' });
      
      await interaction.editReply({ embeds: [embed] });
      
    } catch (error) {
      console.error('PUBG Leaderboard Error:', error);
      await interaction.editReply('❌ Error loading leaderboard. Please try again later.');
    }
  },
};

export default command;
