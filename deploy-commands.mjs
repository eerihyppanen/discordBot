import { REST, Routes } from 'discord.js';
import dotenv from 'dotenv';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const defaultCommandsPath = fileURLToPath(new URL('./src/commands/', import.meta.url));

export const loadCommands = async (commandsPath) => {
  const files = (await fs.readdir(commandsPath)).filter(file => file.endsWith('.js')).sort();
  if (files.length === 0) throw new Error('No command files found; refusing to replace the command list.');

  const commands = [];
  const names = new Set();
  for (const file of files) {
    try {
      const { default: command } = await import(pathToFileURL(path.join(commandsPath, file)).href);
      if (!command?.data || typeof command.data.toJSON !== 'function' || typeof command.execute !== 'function') {
        throw new Error('Command must export data and an execute function.');
      }
      const definition = command.data.toJSON();
      if (!definition.name || names.has(definition.name)) throw new Error('Missing or duplicate command name.');
      names.add(definition.name);
      commands.push(definition);
    } catch (cause) {
      throw new Error(`Cannot load ${file}; no commands were published.`, { cause });
    }
  }
  return commands;
};

export const deployCommands = async ({ commandsPath = defaultCommandsPath, rest, clientId, guildId }) => {
  // Validate every command before performing Discord's all-or-nothing list replacement.
  const commands = await loadCommands(commandsPath);
  return rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
};

export const main = async () => {
  try {
    dotenv.config();
    const { TOKEN, CLIENT_ID, GUILD_ID } = process.env;
    if (!TOKEN || !CLIENT_ID || !GUILD_ID) throw new Error('TOKEN, CLIENT_ID and GUILD_ID are required.');
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    const data = await deployCommands({ rest, clientId: CLIENT_ID, guildId: GUILD_ID });
    console.log(`Successfully reloaded ${data.length} application commands.`);
  } catch (error) {
    console.error('Command deployment failed:', error);
    process.exitCode = 1;
  }
};

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await main();
}
