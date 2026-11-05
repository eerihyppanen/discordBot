import { SlashCommandBuilder } from 'discord.js';
import { openProfile, handleProfileComponent } from '../utils/profileInteractions.js';

export default {
  data: new SlashCommandBuilder().setName('profile').setDescription('Profile cards, private settings, cosmetic shop and inventory')
    .addSubcommand(command => command.setName('card').setDescription('Show a public cosmetic profile card')
      .addUserOption(option => option.setName('user').setDescription('Whose card to show (default: you)')))
    .addSubcommand(command => command.setName('settings').setDescription('Privately view, edit or clear your saved game usernames'))
    .addSubcommand(command => command.setName('shop').setDescription('Browse prices and purchase cosmetics using buttons'))
    .addSubcommand(command => command.setName('inventory').setDescription('Equip and remove owned titles and badges using selectors')),
  execute: openProfile,
  handleComponent: handleProfileComponent,
};
