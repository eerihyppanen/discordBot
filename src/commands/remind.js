import { SlashCommandBuilder, EmbedBuilder } from "discord.js";

const command = {
  data: new SlashCommandBuilder()
    .setName('remind')
    .setDescription('Set a reminder')
    .addStringOption(option =>
      option.setName('time')
        .setDescription('Time (e.g., 10m, 1h, 2d)')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('message')
        .setDescription('Reminder message')
        .setRequired(true)
    ),
  
  async execute(interaction) {
    const timeStr = interaction.options.getString('time');
    const message = interaction.options.getString('message');
    
    const timeMs = parseTime(timeStr);
    
    if (!timeMs || timeMs > 7 * 24 * 60 * 60 * 1000) { // Max 7 days
      return interaction.reply('❌ Invalid time format! Use: 10m, 1h, 2d (max 7 days)');
    }
    
    const reminderTime = new Date(Date.now() + timeMs);
    
    const embed = new EmbedBuilder()
      .setColor('#00ff00')
      .setTitle('⏰ Reminder Set!')
      .setDescription(`I'll remind you in **${timeStr}**`)
      .addFields(
        { name: 'Message', value: message, inline: false },
        { name: 'Reminder Time', value: `<t:${Math.floor(reminderTime.getTime() / 1000)}:R>`, inline: false }
      )
      .setTimestamp();
    
    await interaction.reply({ embeds: [embed] });
    
    // Set the reminder
    setTimeout(async () => {
      const reminderEmbed = new EmbedBuilder()
        .setColor('#ff6b35')
        .setTitle('⏰ Reminder!')
        .setDescription(message)
        .setFooter({ text: `Reminder from ${timeStr} ago` })
        .setTimestamp();
      
      try {
        await interaction.user.send({ embeds: [reminderEmbed] });
      } catch (error) {
        // If DM fails, send in channel
        await interaction.followUp({ content: `${interaction.user}`, embeds: [reminderEmbed] });
      }
    }, timeMs);
  },
};

function parseTime(timeStr) {
  const regex = /^(\d+)([smhd])$/;
  const match = timeStr.match(regex);
  
  if (!match) return null;
  
  const value = parseInt(match[1]);
  const unit = match[2];
  
  const multipliers = {
    's': 1000,
    'm': 60 * 1000,
    'h': 60 * 60 * 1000,
    'd': 24 * 60 * 60 * 1000
  };
  
  return value * multipliers[unit];
}

export default command;