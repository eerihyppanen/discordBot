import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { setPubgStats } from '../utils/pubgCommands.js';
import { cancelColonistGame } from '../utils/colonistGameUI.js';
import { ColonistError } from '../utils/colonistSystem.js';

export default {
  data: new SlashCommandBuilder().setName('admin').setDescription('Moderator tools')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(command => command.setName('pubg-stats').setDescription('Set saved PUBG Steam PC statistics')
      .addStringOption(option => option.setName('username').setDescription('PUBG username').setMinLength(1).setMaxLength(64).setRequired(true))
      .addIntegerOption(option => option.setName('wins').setDescription('Number of wins').setMinValue(0).setRequired(true))
      .addIntegerOption(option => option.setName('matches').setDescription('Number of matches').setMinValue(1).setRequired(true)))
    .addSubcommand(command => command.setName('colonist-cancel').setDescription('Cancel an unfinished game by selecting any participant')
      .addUserOption(option => option.setName('player').setDescription('Any participant in the unfinished game').setRequired(true))),
  async execute(interaction) {
    if (!interaction.inGuild() || !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ content: '❌ You need the Manage Server permission to use admin commands.', flags: MessageFlags.Ephemeral });
    }
    if (interaction.options.getSubcommand() === 'pubg-stats') return setPubgStats(interaction);
    try {
      return await cancelColonistGame(interaction, interaction.options.getUser('player'));
    } catch (error) {
      if (!(error instanceof ColonistError)) throw error;
      const payload = { content: `❌ ${error.message}`, embeds: [], components: [] };
      return interaction.deferred ? interaction.editReply(payload) : interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
    }
  },
};
