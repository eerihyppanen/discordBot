import { MessageFlags } from 'discord.js';

export const dispatchInteraction = async (interaction) => {
  const skinButton = interaction.isButton() && interaction.customId.startsWith('lege:list:');
  const colonistButton = interaction.isButton() && interaction.customId.startsWith('colonist:game:');
  if (!skinButton && !colonistButton && !interaction.isChatInputCommand()) return;
  const name = skinButton ? 'lege' : colonistButton ? 'colonist' : interaction.commandName;
  const command = interaction.client.commands.get(name);
  try {
    if (!command) throw new Error(`No command matching ${name} was found.`);
    if (skinButton || colonistButton) await command.handleButton(interaction);
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
