import { REST, Routes } from 'discord.js';
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'url';

// Load environment variables and handle missing values
dotenv.config();

// Check for required environment variables
if (!process.env.TOKEN || !process.env.CLIENT_ID || !process.env.GUILD_ID) {
  console.error('❌ ERROR: Missing required environment variables!');
  console.error('Please ensure your .env file contains:');
  console.error('TOKEN=your_bot_token');
  console.error('CLIENT_ID=your_application_id');
  console.error('GUILD_ID=your_server_id');
  process.exit(1);
}

// Set up file path handling
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Command loading
const commands = [];
const commandsPath = path.join(__dirname, 'src', 'commands');

// Check if commands directory exists
if (!fs.existsSync(commandsPath)) {
  console.error(`❌ ERROR: Commands directory not found at: ${commandsPath}`);
  process.exit(1);
}

try {
  const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
  
  if (commandFiles.length === 0) {
    console.warn('⚠️ WARNING: No command files (.js) found in the commands directory.');
    console.warn(`Directory checked: ${commandsPath}`);
    process.exit(1);
  }

  console.log(`🔍 Found ${commandFiles.length} potential command files.`);
  console.log('Loading command files to deploy...');

  // Process each command file
  for (const file of commandFiles) {
    try {
      const filePath = path.join(commandsPath, file);
      console.log(`Processing: ${file}...`);
      
      const commandModule = await import(filePath);
      const command = commandModule.default;
      
      if (!command) {
        console.error(`❌ ERROR: Missing default export in ${file}`);
        continue;
      }
      
      if ('data' in command) {
        commands.push(command.data.toJSON());
        console.log(`✅ [SUCCESS] Loaded /${command.data.name} for deployment.`);
      } else {
        console.error(`❌ [WARNING] The command at ${filePath} is missing a "data" property.`);
      }
    } catch (fileError) {
      console.error(`❌ Error processing command file ${file}:`);
      console.error(fileError);
    }
  }

  if (commands.length === 0) {
    console.error('❌ No valid commands found to deploy.');
    process.exit(1);
  }

  // Deploy commands
  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

  console.log(`📤 Started refreshing ${commands.length} application (/) commands.`);
  console.log(`Guild ID: ${process.env.GUILD_ID.substring(0, 4)}...`);
  console.log(`Client ID: ${process.env.CLIENT_ID.substring(0, 4)}...`);

  try {
    const data = await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands },
    );

    console.log(`✅ [SUCCESS] Successfully reloaded ${data.length} application (/) commands.`);
  } catch (apiError) {
    console.error('❌ Error deploying commands to Discord API:');
    console.error(apiError);
  }
} catch (mainError) {
  console.error('❌ An unexpected error occurred:');
  console.error(mainError);
}