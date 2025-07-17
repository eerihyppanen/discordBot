import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getUserLevel, getRoleForLevel } from "../utils/levelingSystem.js";

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
        { name: 'Progress to Next Level', value: progressBar, inline: false }
      )
      .setTimestamp();
    
    await interaction.reply({ embeds: [embed] });
  },
};

// Helper function to create XP for level calculation
const getXPForLevel = (level) => (level - 1) * (level - 1) * 100;

// Helper function to create progress bar
const createProgressBar = (current, total) => {
  const percentage = Math.min(current / total, 1);
  const filledBars = Math.round(percentage * 10);
  const emptyBars = 10 - filledBars;
  
  return `${'█'.repeat(filledBars)}${'░'.repeat(emptyBars)} ${current}/${total} XP`;
};

export default command;