import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getUserLevel, getRoleForLevel, getXPForLevel } from "../utils/levelingSystem.js";
import { rewardSettings, formatRewardCooldown } from '../utils/rewardSettings.js';

const command = {
  data: new SlashCommandBuilder()
    .setName('level')
    .setDescription('Check your current level and XP')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('Check another user\'s level')
        .setRequired(false)
    ),
  
  async execute(interaction) {
    const targetUser = interaction.options.getUser('user') || interaction.user;
    const userProgress = await getUserLevel(targetUser.id);
    const roleName = getRoleForLevel(userProgress.level);
    
    const progressBar = createProgressBar(
      userProgress.xp - getXPForLevel(userProgress.level),
      userProgress.xpForNextLevel - getXPForLevel(userProgress.level)
    );
    
    const embed = new EmbedBuilder()
      .setColor('#3498db')
      .setTitle(`${targetUser.username}'s Level`)
      .setThumbnail(targetUser.displayAvatarURL())
      .addFields(
        { name: 'Level', value: `${userProgress.level}`, inline: true },
        { name: 'Title', value: roleName, inline: true },
        { name: 'Total XP', value: `${userProgress.xp}`, inline: true },
        { name: 'Progress to Next Level', value: progressBar, inline: false },
        { name: 'Message XP', value: `${rewardSettings.messageXP} XP per eligible server message, at most once every ${formatRewardCooldown(rewardSettings.messageCooldownMs)}.` },
        { name: 'Colonist XP', value: `${rewardSettings.colonistWinXP} XP per win, plus ${rewardSettings.colonistStreakBonusXP} XP for each three-win streak step. Rewards at most once every ${formatRewardCooldown(rewardSettings.colonistRewardCooldownMs)}. Losses reset the streak; every game still counts.` }
      )
      .setTimestamp();
    
    await interaction.reply({ embeds: [embed] });
  },
};

// Helper function to create progress bar
const createProgressBar = (current, total) => {
  const percentage = Math.max(0, Math.min(current / total, 1));
  const filledBars = Math.round(percentage * 10);
  const emptyBars = 10 - filledBars;
  
  return `${'█'.repeat(filledBars)}${'░'.repeat(emptyBars)} ${current}/${total} XP`;
};

export default command;
