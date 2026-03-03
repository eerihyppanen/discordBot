import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { addWin, addLoss, getPlayerStats } from "../utils/colonistSystem.js";
import { addXP } from "../utils/levelingSystem.js";
import fs from 'fs/promises';
import path from 'path';

const ECONOMY_FILE = path.join(process.cwd(), 'data', 'economy.json');

// Helper to load economy data
const loadEconomy = async () => {
  try {
    const data = await fs.readFile(ECONOMY_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return {};
  }
};

// Helper to save economy data
const saveEconomy = async (data) => {
  try {
    await fs.mkdir(path.dirname(ECONOMY_FILE), { recursive: true });
    await fs.writeFile(ECONOMY_FILE, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error saving economy data:', error);
  }
};

// Helper to add coins to user
const addCoins = async (userId, amount) => {
  const economy = await loadEconomy();
  
  if (!economy[userId]) {
    economy[userId] = { coins: 100, bank: 0 };
  }
  
  economy[userId].coins += amount;
  await saveEconomy(economy);
  return economy[userId].coins;
};

const command = {
  data: new SlashCommandBuilder()
    .setName('colonist')
    .setDescription('Track Colonist.io game results and view stats')
    .addSubcommand(subcommand =>
      subcommand
        .setName('win')
        .setDescription('Record a Colonist.io win (earn XP and coins!)')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('loss')
        .setDescription('Record a Colonist.io loss (resets streak)')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('stats')
        .setDescription('View your Colonist.io statistics')
        .addUserOption(option =>
          option.setName('user')
            .setDescription('View another user\'s stats')
            .setRequired(false)
        )
    ),
  
  async execute(interaction) {
    const subcommand = interaction.subcommand();
    
    if (subcommand === 'win') {
      await interaction.deferReply();
      
      try {
        const userId = interaction.user.id;
        const username = interaction.user.username;
        
        // Add win and get rewards
        const result = await addWin(userId, username);
        
        // Give XP reward
        const xpResult = await addXP(userId, result.xpReward);
        
        // Give coin reward
        const newBalance = await addCoins(userId, result.coinReward);
        
        // Build response
        const embed = new EmbedBuilder()
          .setColor('#FFD700')
          .setTitle('🎉 Colonist.io Victory!')
          .setDescription(`Congratulations ${interaction.user}! You won a game!`)
          .addFields(
            { name: '📊 Game Stats', value: '━━━━━━━━━━━━━━━━', inline: false },
            { name: '🏆 Total Wins', value: `${result.wins}`, inline: true },
            { name: '🎮 Total Games', value: `${result.totalGames}`, inline: true },
            { name: '📈 Win Rate', value: `${((result.wins / result.totalGames) * 100).toFixed(1)}%`, inline: true },
            { name: '🔥 Current Streak', value: `${result.currentStreak} ${result.currentStreak >= 3 ? '🔥' : ''}`, inline: true },
            { name: '⭐ Longest Streak', value: `${result.longestStreak}`, inline: true },
            { name: '\u200B', value: '\u200B', inline: true },
            { name: '🎁 Rewards Earned', value: '━━━━━━━━━━━━━━━━', inline: false },
            { name: '✨ XP Gained', value: `+${result.xpReward} XP${xpResult.leveledUp ? ' 🎊 LEVEL UP!' : ''}`, inline: true },
            { name: '💰 Coins Earned', value: `+${result.coinReward} coins`, inline: true },
            { name: '💵 New Balance', value: `${newBalance} coins`, inline: true }
          )
          .setThumbnail(interaction.user.displayAvatarURL())
          .setTimestamp();
        
        if (result.streakMultiplier > 0) {
          embed.setFooter({ text: `🔥 Streak Bonus Active! (${result.streakMultiplier}x multiplier)` });
        } else {
          embed.setFooter({ text: 'Win 3 games in a row for bonus rewards!' });
        }
        
        await interaction.editReply({ embeds: [embed] });
        
      } catch (error) {
        console.error('Colonist win error:', error);
        await interaction.editReply('❌ Error recording win. Please try again.');
      }
      
    } else if (subcommand === 'loss') {
      await interaction.deferReply();
      
      try {
        const userId = interaction.user.id;
        const username = interaction.user.username;
        
        // Add loss
        const result = await addLoss(userId, username);
        
        const embed = new EmbedBuilder()
          .setColor('#FF6B6B')
          .setTitle('💔 Colonist.io Defeat')
          .setDescription(`Better luck next time, ${interaction.user}!`)
          .addFields(
            { name: '📊 Game Stats', value: '━━━━━━━━━━━━━━━━', inline: false },
            { name: '🏆 Total Wins', value: `${result.wins}`, inline: true },
            { name: '🎮 Total Games', value: `${result.totalGames}`, inline: true },
            { name: '📈 Win Rate', value: `${((result.wins / result.totalGames) * 100).toFixed(1)}%`, inline: true },
            { name: '🔥 Streak Reset', value: result.longestStreak > 0 ? `Best: ${result.longestStreak}` : 'No previous streak', inline: false }
          )
          .setFooter({ text: 'Your win streak has been reset. Start a new one!' })
          .setTimestamp();
        
        await interaction.editReply({ embeds: [embed] });
        
      } catch (error) {
        console.error('Colonist loss error:', error);
        await interaction.editReply('❌ Error recording loss. Please try again.');
      }
      
    } else if (subcommand === 'stats') {
      await interaction.deferReply();
      
      try {
        const targetUser = interaction.options.getUser('user') || interaction.user;
        const stats = await getPlayerStats(targetUser.id);
        
        if (!stats) {
          await interaction.editReply(`${targetUser.username} hasn't played Colonist.io yet!`);
          return;
        }
        
        const embed = new EmbedBuilder()
          .setColor('#5865F2')
          .setTitle(`🎲 Colonist.io Statistics`)
          .setDescription(`**${stats.username}**`)
          .addFields(
            { name: '🏆 Total Wins', value: `${stats.wins}`, inline: true },
            { name: '🎮 Total Games', value: `${stats.totalGames}`, inline: true },
            { name: '📈 Win Rate', value: `${stats.winRate}%`, inline: true },
            { name: '🔥 Current Streak', value: `${stats.currentStreak}`, inline: true },
            { name: '⭐ Longest Streak', value: `${stats.longestStreak}`, inline: true },
            { name: '📅 Last Win', value: stats.lastWinDate ? `<t:${Math.floor(new Date(stats.lastWinDate).getTime() / 1000)}:R>` : 'Never', inline: true }
          )
          .setThumbnail(targetUser.displayAvatarURL())
          .setFooter({ text: 'Use /colonist win or /colonist loss to track games' })
          .setTimestamp();
        
        await interaction.editReply({ embeds: [embed] });
        
      } catch (error) {
        console.error('Colonist stats error:', error);
        await interaction.editReply('❌ Error fetching stats. Please try again.');
      }
    }
  },
};

export default command;
