import { Client, GatewayIntentBits, Collection } from "discord.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "url";

// Debug environment variables
console.log('🔍 Environment Check:');
console.log('TOKEN:', process.env.TOKEN ? '✅ Set' : '❌ Missing');
console.log('CLIENT_ID:', process.env.CLIENT_ID ? '✅ Set' : '❌ Missing');
console.log('GUILD_ID:', process.env.GUILD_ID ? '✅ Set' : '❌ Missing');
console.log('FACEIT_API_KEY:', process.env.FACEIT_API_KEY ? '✅ Set' : '❌ Missing');
console.log('PUBG_API_KEY:', process.env.PUBG_API_KEY ? '✅ Set' : '❌ Missing');
console.log('GROQ_API_KEY:', process.env.GROQ_API_KEY ? '✅ Set' : '❌ Missing');

// Create a new client instance
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessageReactions,
  ],
});

// --- Command Loading ---
client.commands = new Collection();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const commandsPath = path.join(__dirname, "commands");
const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith(".js"));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  // Dynamically import each command file
  const { default: command } = await import(filePath);
  if ("data" in command && "execute" in command) {
    client.commands.set(command.data.name, command);
  } else {
    console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
  }
}

// --- Event Loading ---
const eventsPath = path.join(__dirname, "events");
const eventFiles = fs.readdirSync(eventsPath).filter((file) => file.endsWith(".js"));

for (const file of eventFiles) {
  const filePath = path.join(eventsPath, file);
  const { default: event } = await import(filePath);
  if (event.once) {
    client.once(event.name, (...args) => event.execute(...args));
  } else {
    client.on(event.name, (...args) => event.execute(...args));
  }
}

// Ready event
client.once('ready', () => {
  console.log(`✅ ${client.user.tag} is online!`);
  console.log(`📝 Loaded ${client.commands.size} commands:`);
  client.commands.forEach(command => {
    console.log(`   - /${command.data.name}`);
  });
});

// Handle slash command interactions
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const command = interaction.client.commands.get(interaction.commandName);

  if (!command) {
    console.error(`No command matching ${interaction.commandName} was found.`);
    return;
  }

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(`Error executing ${interaction.commandName}:`, error);
    
    const errorMessage = {
      content: 'There was an error while executing this command!',
      ephemeral: true
    };
    
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(errorMessage);
    } else {
      await interaction.reply(errorMessage);
    }
  }
});

// Global error handlers
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit - keep the bot running
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // Don't exit - keep the bot running
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('🛑 Received SIGINT, shutting down gracefully...');
  client.destroy();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('🛑 Received SIGTERM, shutting down gracefully...');
  client.destroy();
  process.exit(0);
});

// Log in to Discord with your client's token
console.log('🚀 Attempting to login to Discord...');
if (!process.env.TOKEN) {
  console.error('❌ No Discord TOKEN found in environment variables!');
  process.exit(1);
}

client.login(process.env.TOKEN).catch(error => {
  console.error('❌ Failed to login to Discord:', error);
  console.log('🔄 Retrying login in 5 seconds...');
  setTimeout(() => {
    client.login(process.env.TOKEN).catch(retryError => {
      console.error('❌ Retry failed:', retryError);
      process.exit(1);
    });
  }, 5000);
});

// Keep the process alive
setInterval(() => {
  console.log(`💓 Bot heartbeat - ${new Date().toISOString()}`);
}, 300000); // Every 5 minutes
