import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { profiles, ProfileError } from '../utils/profileSystem.js';

export default {
  data: new SlashCommandBuilder().setName('profile').setDescription('Save your game usernames for easier stats lookups')
    .addSubcommand(command => command.setName('set').setDescription('Save one or both of your usernames')
      .addStringOption(option => option.setName('pubg').setDescription('Your PUBG Steam username').setMinLength(1).setMaxLength(64))
      .addStringOption(option => option.setName('faceit').setDescription('Your FACEIT username').setMinLength(1).setMaxLength(50)))
    .addSubcommand(command => command.setName('show').setDescription('Show your saved game usernames'))
    .addSubcommand(command => command.setName('clear').setDescription('Forget a saved game username')
      .addStringOption(option => option.setName('game').setDescription('Which saved names to remove').setRequired(true)
        .addChoices({ name: 'PUBG', value: 'pubg' }, { name: 'FACEIT', value: 'faceit' }, { name: 'All games', value: 'all' }))),
  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const operation = interaction.options.getSubcommand();
      let profile;
      if (operation === 'set') {
        const changes = {};
        for (const game of ['pubg', 'faceit']) {
          const name = interaction.options.getString(game);
          if (name !== null && name !== undefined) changes[game] = name;
        }
        profile = await profiles.set(interaction.user.id, changes);
      } else if (operation === 'clear') profile = await profiles.clear(interaction.user.id, interaction.options.getString('game'));
      else profile = await profiles.get(interaction.user.id);
      const embed = new EmbedBuilder().setColor('#5865f2').setTitle('Your game usernames')
        .addFields(
          { name: 'PUBG Steam', value: profile.pubg ?? 'Not saved', inline: true },
          { name: 'FACEIT', value: profile.faceit ?? 'Not saved', inline: true },
        ).setFooter({ text: 'Omit username in /pubg stats or /faceit to use these names' });
      return interaction.editReply({
        content: operation === 'set' ? '✅ Profile saved.' : operation === 'clear' ? '✅ Saved username removed.' : '',
        embeds: [embed], allowedMentions: { parse: [] },
      });
    } catch (error) {
      if (!(error instanceof ProfileError)) throw error;
      return interaction.editReply({ content: `❌ ${error.message}`, allowedMentions: { parse: [] } });
    }
  },
};
