import { SlashCommandBuilder, EmbedBuilder } from "discord.js";

const command = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Show all available commands')
    .addStringOption(option =>
      option.setName('command')
        .setDescription('Get detailed help for a specific command')
        .setRequired(false)
    ),
  
  async execute(interaction) {
    const specificCommand = interaction.options.getString('command');
    
    if (specificCommand) {
      // Show detailed help for a specific command
      const command = interaction.client.commands.get(specificCommand);
      
      if (!command) {
        return interaction.reply(`❌ No command named \`${specificCommand}\` found!`);
      }
      
      const embed = new EmbedBuilder()
        .setColor('#3498db')
        .setTitle(`📋 Command: /${command.data.name}`)
        .setDescription(command.data.description)
        .setTimestamp();
      
      // Add options if they exist
      if (command.data.options && command.data.options.length > 0) {
        const options = command.data.options.map(option => {
          const required = option.required ? '**[Required]**' : '*[Optional]*';
          return `${required} \`${option.name}\` - ${option.description}`;
        }).join('\n');
        
        embed.addFields({ name: 'Options', value: options });
      }
      
      return interaction.reply({ embeds: [embed] });
    }
    
    // Show all commands
    const commands = interaction.client.commands;
    
    // Group commands by category
    const categories = {
      '🎮 Gaming': ['faceit', 'pubg', '8ball'],
      '🎵 Music': ['play-simple'],
      '🤖 AI & Chat': ['groq-chat'],
      '📊 Leveling': ['level', 'leaderboard'],
      '🎯 Utility': ['help'],
      '🎉 Fun': ['8ball']
    };
    
    const embed = new EmbedBuilder()
      .setColor('#3498db')
      .setTitle('🤖 Bot Commands Help')
      .setDescription('Here are all the available commands. Use `/help <command>` for detailed information about a specific command.')
      .setThumbnail(interaction.client.user.displayAvatarURL())
      .setTimestamp();
    
    // Add each category
    for (const [categoryName, commandNames] of Object.entries(categories)) {
      const categoryCommands = commandNames
        .filter(name => commands.has(name))
        .map(name => {
          const cmd = commands.get(name);
          return `\`/${cmd.data.name}\` - ${cmd.data.description}`;
        })
        .join('\n');
      
      if (categoryCommands) {
        embed.addFields({
          name: categoryName,
          value: categoryCommands || 'No commands available',
          inline: false
        });
      }
    }
    
    // Add any uncategorized commands
    const categorizedCommands = Object.values(categories).flat();
    const uncategorizedCommands = [...commands.values()]
      .filter(cmd => !categorizedCommands.includes(cmd.data.name))
      .map(cmd => `\`/${cmd.data.name}\` - ${cmd.data.description}`)
      .join('\n');
    
    if (uncategorizedCommands) {
      embed.addFields({
        name: '🔧 Other Commands',
        value: uncategorizedCommands,
        inline: false
      });
    }
    
    embed.addFields({
      name: '💡 Tips',
      value: '• Level up by chatting to earn XP and roles!\n• Use `/level` to check your progress\n• Try `/8ball <question>` for fun predictions',
      inline: false
    });
    
    embed.setFooter({ 
      text: `Total Commands: ${commands.size} | Use /help <command> for details`,
      iconURL: interaction.user.displayAvatarURL()
    });
    
    await interaction.reply({ embeds: [embed] });
  },
};

export default command;
