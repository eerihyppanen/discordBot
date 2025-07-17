import { Client, GatewayIntentBits, Collection } from "discord.js";

// Simple test version to isolate the issue
console.log('🔍 Starting minimal bot test...');

// Check environment variables
const requiredVars = ['TOKEN', 'CLIENT_ID', 'GUILD_ID'];
const missingVars = requiredVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.error('❌ Missing required environment variables:', missingVars);
  process.exit(1);
}

console.log('✅ All required environment variables are set');

// Create client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// Basic ready event
client.once('ready', () => {
  console.log(`✅ Bot is online as ${client.user.tag}!`);
  console.log(`📊 Serving ${client.guilds.cache.size} guilds`);
  console.log(`👥 Serving ${client.users.cache.size} users`);
});

// Basic error handling
client.on('error', error => {
  console.error('❌ Discord client error:', error);
});

// Login
console.log('🚀 Attempting to login...');
client.login(process.env.TOKEN).catch(error => {
  console.error('❌ Login failed:', error);
  process.exit(1);
});
