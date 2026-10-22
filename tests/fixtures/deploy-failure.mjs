import { REST } from 'discord.js';
import { main } from '../../deploy-commands.mjs';

// No network request is made: verify the CLI's error status after a failed API call.
REST.prototype.put = async () => { throw new Error('Simulated Discord API failure'); };
process.env.TOKEN = 'offline-test-token';
process.env.CLIENT_ID = 'test-client';
process.env.GUILD_ID = 'test-guild';
await main();
