import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { reminders } from '../utils/reminderSystem.js';

export const parseTime = (timeStr) => {
  const match = /^(\d+)([smhd])$/.exec(timeStr);
  if (!match) return null;
  const multipliers = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
  const duration = Number(match[1]) * multipliers[match[2]];
  return Number.isSafeInteger(duration) && duration > 0 && duration <= 7 * 86400000 ? duration : null;
};

const command = {
  data: new SlashCommandBuilder()
    .setName('remind')
    .setDescription('Set a reminder')
    .addStringOption((option) => option.setName('time').setDescription('Time (e.g., 10m, 1h, 2d; max 7 days)').setRequired(true))
    .addStringOption((option) => option.setName('message').setDescription('Reminder message').setMaxLength(1024).setRequired(true)),

  async execute(interaction) {
    const timeStr = interaction.options.getString('time');
    const message = interaction.options.getString('message');
    const timeMs = parseTime(timeStr);
    if (!timeMs) {
      return interaction.reply('❌ Invalid time format! Use: 10m, 1h, 2d (max 7 days)');
    }

    await interaction.deferReply();
    const dueAt = Date.now() + timeMs;
    await reminders.add({
      userId: interaction.user.id,
      channelId: interaction.channelId,
      message,
      dueAt,
    });

    const embed = new EmbedBuilder()
      .setColor('#00ff00')
      .setTitle('⏰ Reminder Set!')
      .setDescription(`I'll remind you in **${timeStr}**`)
      .addFields(
        { name: 'Message', value: message, inline: false },
        { name: 'Reminder Time', value: `<t:${Math.floor(dueAt / 1000)}:R>`, inline: false },
      )
      .setTimestamp();
    await interaction.editReply({ embeds: [embed] });
  },
};

export default command;
