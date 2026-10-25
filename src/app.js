import { Client, GatewayIntentBits, Collection } from "discord.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "url";
import { initializeData, flushLevelingData } from "./utils/levelingSystem.js";
import { initializePubgWinsData, flushPubgWinsData } from "./utils/pubgWinsSystem.js";
import { initializeColonistData, flushColonistData } from "./utils/colonistSystem.js";

import { economy } from './utils/economySystem.js';
import { reminders } from './utils/reminderSystem.js';
import { skins } from './utils/skinSystem.js';
import { createLifecycle } from './utils/lifecycle.js';
import { dispatchInteraction } from './utils/interactionHandler.js';

// Load data before accepting events. Existing JSON files keep their format.
await initializeData();
await initializePubgWinsData();
await initializeColonistData();
await economy.initialize();
await reminders.initialize();
await skins.initialize();

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
    GatewayIntentBits.GuildMessageReactions,
  ],
});

let heartbeat;
let loginRetry;
const lifecycle = createLifecycle({
  client,
  flushers: [flushLevelingData, flushPubgWinsData, flushColonistData, economy.flush, reminders.flush, skins.flush],
  stop: async () => {
    clearInterval(heartbeat);
    clearTimeout(loginRetry);
    await reminders.stop();
  },
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
  const execute = (...args) => {
    lifecycle.run(() => event.execute(...args)).catch((error) => console.error(`Error in ${event.name}:`, error));
  };
  if (event.once) client.once(event.name, execute);
  else client.on(event.name, execute);
}

// Ready event
client.once('clientReady', () => {
  lifecycle.run(() => reminders.start(client)).catch((error) => console.error('Failed to start reminders:', error));
  console.log(`✅ ${client.user.tag} is online!`);
  console.log(`📝 Loaded ${client.commands.size} commands:`);
  client.commands.forEach(command => {
    console.log(`   - /${command.data.name}`);
  });
});

// Track both slash commands and collection navigation during shutdown.
client.on('interactionCreate', interaction => {
  lifecycle.run(() => dispatchInteraction(interaction))
    .catch(error => console.error('Failed to respond to interaction:', error));
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

// Save current state, drain commands and events, then flush again before disconnecting.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => { void lifecycle.shutdown(signal); });
}

// Log in to Discord with your client's token
console.log('🚀 Attempting to login to Discord...');
if (!process.env.TOKEN) {
  console.error('❌ No Discord TOKEN found in environment variables!');
  process.exit(1);
}

client.login(process.env.TOKEN).catch(error => {
  console.error('❌ Failed to login to Discord:', error);
  console.log('🔄 Retrying login in 5 seconds...');
  if (lifecycle.stopping) return;
  loginRetry = setTimeout(() => {
    client.login(process.env.TOKEN).catch(retryError => {
      console.error('❌ Retry failed:', retryError);
      process.exit(1);
    });
  }, 5000);
});

// Keep the process alive
heartbeat = setInterval(() => {
  console.log(`💓 Bot heartbeat - ${new Date().toISOString()}`);
}, 300000); // Every 5 minutes
