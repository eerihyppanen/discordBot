import { SlashCommandBuilder, EmbedBuilder } from "discord.js";

const command = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Show all available commands or get help for a specific command')
    .addStringOption(option =>
      option.setName('command')
        .setDescription('Get detailed help for a specific command')
        .setRequired(false)
    ),
  
  async execute(interaction) {
    const commandName = interaction.options.getString('command');
    
    if (commandName) {
      await showSpecificHelp(interaction, commandName);
    } else {
      await showGeneralHelp(interaction);
    }
  },
};

const showGeneralHelp = async (interaction) => {
  const embed = new EmbedBuilder()
    .setColor('#5865f2')
    .setTitle('🤖 Bot Commands Help')
    .setDescription('Here are all available commands organized by category:')
    .addFields(
      {
        name: '🎮 Gaming Commands',
        value: [
          '`/faceit <username>` - Check FACEIT CS2/CSGO stats',
          '`/pubg <username> <platform>` - Check PUBG player stats',
          '`/8ball <question>` - Ask the magic 8-ball a question'
        ].join('\n'),
        inline: false
      },
      {
        name: '🎯 PUBG Legendary Skins',
        value: [
          '`/lege add [skin]` - Add a legendary skin to your collection',
          '`/lege count [user]` - Check legendary skin count',
          '`/lege list` - List all your legendary skins',
          '`/lege leaderboard` - Show legendary skin leaderboard'
        ].join('\n'),
        inline: false
      },
      {
        name: '🎵 Music Commands',
        value: [
          '`/play-simple <url>` - Play audio from YouTube URL'
        ].join('\n'),
        inline: false
      },
      {
        name: '🤖 AI & Chat',
        value: [
          '`/groq <message>` - Chat with AI (Groq - very fast)'
        ].join('\n'),
        inline: false
      },
      {
        name: '📊 Leveling System',
        value: [
          '`/level [user]` - Check your level and XP',
          '`/leaderboard` - Show top 10 users by level',
          '*Gain XP by sending messages!*'
        ].join('\n'),
        inline: false
      },
      {
        name: '💰 Economy System',
        value: [
          '`/balance [user]` - Check your balance',
          '`/daily` - Claim your daily reward'
        ].join('\n'),
        inline: false
      },
      {
        name: '⏰ Utility & Fun',
        value: [
          '`/remind <time> <message>` - Set a reminder',
          '`/8ball <question>` - Ask the magic 8-ball',
          '`/help [command]` - Show this help or command details'
        ].join('\n'),
        inline: false
      },
      {
        name: '🎉 Auto Features',
        value: [
          '*Auto welcome messages for new members*',
          '*Level up celebrations with role rewards*',
          '*XP gained from chatting*'
        ].join('\n'),
        inline: false
      }
    )
    .setFooter({ 
      text: `Total Commands: ${getTotalCommandCount()} | Use /help <command> for detailed info`,
      iconURL: interaction.client.user.displayAvatarURL()
    })
    .setTimestamp();
  
  await interaction.reply({ embeds: [embed] });
};

const showSpecificHelp = async (interaction, commandName) => {
  const commandHelp = getCommandDetails(commandName);
  
  if (!commandHelp) {
    return interaction.reply(`❌ Command \`${commandName}\` not found. Use \`/help\` to see all available commands.`);
  }
  
  const embed = new EmbedBuilder()
    .setColor('#00ff00')
    .setTitle(`📖 Help: /${commandName}`)
    .setDescription(commandHelp.description)
    .addFields(
      { name: '📝 Usage', value: commandHelp.usage, inline: false },
      { name: '📋 Parameters', value: commandHelp.parameters, inline: false },
      { name: '💡 Examples', value: commandHelp.examples, inline: false }
    )
    .setFooter({ text: 'Parameters in [brackets] are optional, <brackets> are required' })
    .setTimestamp();
  
  if (commandHelp.notes) {
    embed.addFields({ name: '📌 Notes', value: commandHelp.notes, inline: false });
  }
  
  await interaction.reply({ embeds: [embed] });
};

const getCommandDetails = (commandName) => {
  const commands = {
    'faceit': {
      description: 'Check FACEIT stats for CS2/CSGO players',
      usage: '/faceit <username>',
      parameters: '`username` - FACEIT username to lookup',
      examples: '/faceit s1mple\n/faceit ZywOo',
      notes: 'Requires FACEIT API key to be configured'
    },
    'pubg': {
      description: 'Check PUBG player statistics',
      usage: '/pubg <username> <platform> [region]',
      parameters: '`username` - PUBG username\n`platform` - steam/xbox/psn\n`region` - Server region (default: EU)',
      examples: '/pubg PlayerName steam\n/pubg PlayerName xbox pc-na',
      notes: 'Shows recent match stats and player info'
    },
    '8ball': {
      description: 'Ask the magic 8-ball a question',
      usage: '/8ball <question>',
      parameters: '`question` - Your question for the 8-ball',
      examples: '/8ball Will I get a chicken dinner today?\n/8ball Should I push this squad?'
    },
    'lege': {
      description: 'PUBG Legendary Skin Counter - Track your legendary unboxings',
      usage: '/lege <add|count|list|leaderboard> [options]',
      parameters: '`add [skin]` - Add legendary skin\n`count [user]` - Check skin count\n`list` - List your skins\n`leaderboard` - Top collectors',
      examples: '/lege add\n/lege add skin:AKM Gold Plate\n/lege count\n/lege leaderboard',
      notes: 'Perfect for tracking your RNG luck! 🎯'
    },
    'play-simple': {
      description: 'Play audio from YouTube URL (simple version)',
      usage: '/play-simple <url>',
      parameters: '`url` - Valid YouTube URL',
      examples: '/play-simple https://youtube.com/watch?v=dQw4w9WgXcQ',
      notes: 'You must be in a voice channel to use this command'
    },
    'groq': {
      description: 'Chat with AI using Groq (very fast responses)',
      usage: '/groq <message>',
      parameters: '`message` - Your message to the AI',
      examples: '/groq What\'s the best PUBG strategy?\n/groq Write me a joke',
      notes: 'Powered by Groq API - super fast AI responses'
    },
    'level': {
      description: 'Check your level and XP progress',
      usage: '/level [user]',
      parameters: '`user` - User to check (optional)',
      examples: '/level\n/level @username',
      notes: 'Gain XP by sending messages in the server!'
    },
    'leaderboard': {
      description: 'Show the top 10 users by level',
      usage: '/leaderboard',
      parameters: 'No parameters required',
      examples: '/leaderboard',
      notes: 'See who\'s the most active in the server'
    },
    'balance': {
      description: 'Check your virtual currency balance',
      usage: '/balance [user]',
      parameters: '`user` - User to check (optional)',
      examples: '/balance\n/balance @username',
      notes: 'Part of the economy system'
    },
    'daily': {
      description: 'Claim your daily coin reward',
      usage: '/daily',
      parameters: 'No parameters required',
      examples: '/daily',
      notes: 'Can only be claimed once every 24 hours'
    },
    'remind': {
      description: 'Set a reminder for yourself',
      usage: '/remind <time> <message>',
      parameters: '`time` - Time format (10m, 1h, 2d)\n`message` - Reminder text',
      examples: '/remind 30m Check PUBG updates\n/remind 2h Stream time',
      notes: 'Maximum 7 days. Bot will DM you when time is up'
    },
    'help': {
      description: 'Show all commands or get help for a specific command',
      usage: '/help [command]',
      parameters: '`command` - Specific command name (optional)',
      examples: '/help\n/help faceit\n/help lege'
    }
  };
  
  return commands[commandName.toLowerCase()];
};

const getTotalCommandCount = () => {
  return Object.keys(getCommandDetails('help')).length - 1 + 15; // Approximate count
};

export default command;
