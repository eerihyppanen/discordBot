import { MessageFlags } from 'discord.js';

export const dispatchInteraction = async (interaction) => {
  const skinButton = interaction.isButton() && interaction.customId.startsWith('lege:list:');
  const colonistButton = interaction.isButton() && interaction.customId.startsWith('colonist:game:');
  const profileComponent = (interaction.isButton() || interaction.isStringSelectMenu?.() || interaction.isModalSubmit?.()) && interaction.customId.startsWith('profile:');
  if (!skinButton && !colonistButton && !profileComponent && !interaction.isChatInputCommand()) return;
  const name = profileComponent ? 'profile' : skinButton ? 'lege' : colonistButton ? 'colonist' : interaction.commandName;
  const command = interaction.client.commands.get(name);
  try {
    if (!command) throw new Error(`No command matching ${name} was found.`);
    if (profileComponent) await command.handleComponent(interaction);
    else if (skinButton || colonistButton) await command.handleButton(interaction);
    else await command.execute(interaction);
  } catch (error) {
    console.error(`Error executing ${name}:`, error);
    const content = 'There was an error while executing this command!';
    if (interaction.deferred && !interaction.replied) {
      await interaction.editReply({ content, embeds: [], components: [] });
    } else if (interaction.replied) {
      await interaction.followUp({ content, flags: MessageFlags.Ephemeral });
    } else {
      await interaction.reply({ content, flags: MessageFlags.Ephemeral });
    }
  }
};
