import { SlashCommandBuilder } from 'discord.js';
import { showPubgStats, showPubgLeaderboard } from '../utils/pubgCommands.js';

export default {
  data: new SlashCommandBuilder()
    .setName('pubg')
    .setDescription('PUBG Steam PC statistics and saved rankings')
    .addSubcommand(command => command.setName('stats').setDescription('Look up a Steam PC player')
      .addStringOption(option => option.setName('username').setDescription('PUBG username').setMinLength(1).setMaxLength(64).setRequired(true))
      .addStringOption(option => option.setName('view').setDescription('Statistics to display (default: recent matches)')
        .addChoices({ name: 'Recent matches (up to 20)', value: 'recent' }, { name: 'Last match', value: 'last' })))
    .addSubcommand(command => command.setName('leaderboard').setDescription('Show saved player rankings by recent wins')),
  async execute(interaction) {
    if (interaction.options.getSubcommand() === 'leaderboard') return showPubgLeaderboard(interaction);
    return showPubgStats(interaction);
  },
};
