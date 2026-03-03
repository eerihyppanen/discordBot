import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getTopPlayers, getTopStreaks } from "../utils/colonistSystem.js";

const command = {
  data: new SlashCommandBuilder()
    .setName('colonist-leaderboard')
    .setDescription('View Colonist.io leaderboards')
    .addStringOption(option =>
      option.setName('type')
        .setDescription('Which leaderboard to view')
        .setRequired(false)
        .addChoices(
          { name: 'Most Wins', value: 'wins' },
          { name: 'Current Streaks', value: 'streaks' }
        )
    ),
  
  async execute(interaction) {
    await interaction.deferReply();
    
    const type = interaction.options.getString('type') || 'wins';
    
    try {
      if (type === 'wins') {
        const topPlayers = await getTopPlayers(10);
        
        if (topPlayers.length === 0) {
          await interaction.editReply('📊 No players tracked yet! Use `/colonist win` to start playing.');
          return;
        }
        
        const embed = new EmbedBuilder()
          .setColor('#FFD700')
          .setTitle('🏆 Colonist.io Win Leaderboard')
          .setDescription('Top 10 Players by Total Wins')
          .setTimestamp();
        
        const leaderboardText = topPlayers.map((player, index) => {
          const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
          const streakIcon = player.currentStreak >= 3 ? '🔥' : '';
          
          return [
            `${medal} **${player.username}** ${streakIcon}`,
            `   🏆 ${player.wins} wins • 🎮 ${player.totalGames} games • 📈 ${player.winRate}% WR`,
            `   🔥 ${player.currentStreak} streak • ⭐ ${player.longestStreak} best`,
            ''
          ].join('\n');
        }).join('\n');
        
        embed.setDescription(leaderboardText || 'No players found');
        embed.setFooter({ text: 'Use /colonist-leaderboard type:streaks to see active streaks' });
        
        await interaction.editReply({ embeds: [embed] });
        
      } else if (type === 'streaks') {
        const topStreaks = await getTopStreaks(10);
        
        if (topStreaks.length === 0) {
          await interaction.editReply('📊 No active win streaks! Be the first to start one!');
          return;
        }
        
        const embed = new EmbedBuilder()
          .setColor('#FF4500')
          .setTitle('🔥 Colonist.io Streak Leaderboard')
          .setDescription('Top 10 Active Win Streaks')
          .setTimestamp();
        
        const leaderboardText = topStreaks.map((player, index) => {
          const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
          const fireEmojis = '🔥'.repeat(Math.min(Math.floor(player.currentStreak / 3), 5));
          
          return [
            `${medal} **${player.username}** ${fireEmojis}`,
            `   🔥 ${player.currentStreak} win streak • 🏆 ${player.wins} total wins`,
            `   ⭐ Personal best: ${player.longestStreak}`,
            ''
          ].join('\n');
        }).join('\n');
        
        embed.setDescription(leaderboardText || 'No active streaks');
        embed.setFooter({ text: 'Win 3+ games in a row for bonus rewards!' });
        
        await interaction.editReply({ embeds: [embed] });
      }
      
    } catch (error) {
      console.error('Colonist leaderboard error:', error);
      await interaction.editReply('❌ Error loading leaderboard. Please try again later.');
    }
  },
};

export default command;
