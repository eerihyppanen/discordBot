import { SlashCommandBuilder, EmbedBuilder, ApplicationCommandOptionType as OptionType } from 'discord.js';

const clip = (text, limit) => text.length > limit ? text.slice(0, limit - 1) + '…' : text;
const argumentsFor = (options = []) => options.map(option => option.required ? `<${option.name}>` : `[${option.name}]`).join(' ');
const variantsFor = (definition, prefix = '/' + definition.name) => {
  const options = definition.options || [];
  if (options.some(option => option.type === OptionType.Subcommand || option.type === OptionType.SubcommandGroup)) {
    return options.flatMap(option => variantsFor(option, `${prefix} ${option.name}`));
  }
  return [{ usage: `${prefix} ${argumentsFor(options)}`.trim(), options }];
};

const command = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Show available commands or help for a specific command')
    .addStringOption(option => option.setName('command').setDescription('Command name').setRequired(false)),

  async execute(interaction) {
    const registry = interaction.client.commands;
    const requested = interaction.options.getString('command')?.trim().replace(/^\/+/, '').toLowerCase();
    if (requested) {
      const selected = registry.get(requested);
      if (!selected) return interaction.reply({ content: '❌ Command not found. Use `/help` to see available commands.', allowedMentions: { parse: [] } });
      const definition = selected.data.toJSON();
      const variants = variantsFor(definition);
      const parameters = variants.flatMap(variant => variant.options.map(option => {
        const choices = option.choices?.map(choice => `${choice.name}: ${choice.value}`).join(', ');
        return `**${option.name}** (${option.required ? 'required' : 'optional'}): ${option.description}${choices ? ` — ${choices}` : ''}`;
      }));
      const embed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle(`📖 Help: /${definition.name}`)
        .setDescription(definition.description)
        .addFields(
          { name: 'Usage', value: clip(variants.map(variant => '`' + variant.usage + '`').join('\n'), 1024) },
          { name: 'Parameters', value: clip(parameters.join('\n') || 'No parameters required.', 1024) },
        )
        .setFooter({ text: '<required> and [optional] parameters' });
      return interaction.reply({ embeds: [embed] });
    }

    const definitions = [...registry.values()].map(entry => entry.data.toJSON()).sort((a, b) => a.name.localeCompare(b.name));
    const visible = definitions.slice(0, 25);
    const fieldBudget = Math.min(1024, Math.floor(4800 / Math.max(visible.length, 1)) - 40);
    const embed = new EmbedBuilder()
      .setColor('#5865f2')
      .setTitle('🤖 Bot Commands')
      .setDescription('Use `/help command:<name>` for parameters and choices.')
      .setFooter({ text: `Total Commands: ${definitions.length}` });
    for (const definition of visible) {
      embed.addFields({
        name: '/' + definition.name,
        value: clip(definition.description + '\n' + variantsFor(definition).map(variant => '`' + variant.usage + '`').join('\n'), fieldBudget),
      });
    }
    return interaction.reply({ embeds: [embed] });
  },
};

export default command;
