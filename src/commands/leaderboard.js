import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import fs from 'fs/promises';
import path from 'path';
import { getRoleForLevel } from "../utils/levelingSystem.js";

const DATA_FILE = path.join(process.cwd(), 'data', 'userLevels.json');

const command = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Show the top 10 users by level'),
  
  async execute(interaction) {
    try {
      const data = await fs.readFile(DATA_FILE, 'utf8');
      const userData = JSON.parse(data);
      
      // Sort users by level, then by XP
      const sortedUsers = Object.entries(userData)
        .sort(([,a], [,b]) => {
          if (b.level !== a.level) return b.level - a.level;
          return b.xp - a.xp;
        })
        .slice(0, 10);
      
      const embed = new EmbedBuilder()
        .setColor('#ffd700')
        .setTitle('🏆 Server Leaderboard')
        .setDescription('Top 10 users by level and XP')
        .setTimestamp();
      
      let description = '';
      for (let i = 0; i < sortedUsers.length; i++) {
        const [userId, stats] = sortedUsers[i];
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
        const roleName = getRoleForLevel(stats.level);
        
        try {
          const user = await interaction.client.users.fetch(userId);
          description += `${medal} **${user.username}** - Level ${stats.level} (${stats.xp} XP) - *${roleName}*\n`;
        } catch (error) {
          description += `${medal} **Unknown User** - Level ${stats.level} (${stats.xp} XP) - *${roleName}*\n`;
        }
      }
      
      embed.setDescription(description || 'No users found.');
      
      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      console.error('Error reading leaderboard:', error);
      await interaction.reply('Error loading leaderboard data.');
    }
  },
};

export default command;