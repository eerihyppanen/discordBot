import { SlashCommandBuilder } from 'discord.js';
import { showPubgStats, showPubgLeaderboard } from '../utils/pubgCommands.js';

export default {
  data: new SlashCommandBuilder()
    .setName('pubg')
    .setDescription('PUBG Steam PC statistics and saved rankings')
    .addSubcommand(command => command.setName('stats').setDescription('Look up a Steam PC player')
      .addStringOption(option => option.setName('username').setDescription('PUBG username (default: your saved profile)').setMinLength(1).setMaxLength(64))
      .addStringOption(option => option.setName('view').setDescription('Statistics to display (default: recent matches)')
        .addChoices({ name: 'Recent matches (up to 20)', value: 'recent' }, { name: 'Last match', value: 'last' })))
    .addSubcommand(command => command.setName('leaderboard').setDescription('Show saved player rankings')
      .addStringOption(option => option.setName('source').setDescription('Rank recent API snapshots or manual totals (default: recent)')
        .addChoices({ name: 'Recent API matches', value: 'recent' }, { name: 'Manual totals', value: 'manual' }))),
  async execute(interaction) {
    if (interaction.options.getSubcommand() === 'leaderboard') return showPubgLeaderboard(interaction);
    return showPubgStats(interaction);
  },
};
