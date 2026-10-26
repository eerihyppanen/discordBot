import { EmbedBuilder, MessageFlags } from 'discord.js';

const configured = (value, placeholder) => typeof value === 'string' && Boolean(value.trim()) &&
  value.trim().toLowerCase() !== placeholder;
const flag = (value, placeholder) => configured(value, placeholder) ? 'Configured' : 'Not configured';
const duration = seconds => {
  if (!Number.isFinite(seconds) || seconds < 0) return 'Unknown';
  let remaining = Math.floor(seconds);
  const parts = [];
  for (const [unit, size] of [['d', 86400], ['h', 3600], ['m', 60], ['s', 1]]) {
    const count = Math.floor(remaining / size);
    remaining %= size;
    if (count) parts.push(`${count}${unit}`);
  }
  return parts.join(' ') || '0s';
};

export const createStatusEmbed = (client, {
  env = process.env, uptimeSeconds = process.uptime(), memory = process.memoryUsage(),
} = {}) => {
  const ready = client.isReady();
  const ping = client.ws?.ping;
  return new EmbedBuilder().setColor(ready ? '#00b894' : '#e0a800').setTitle('Bot status')
    .addFields(
      { name: 'Discord connection', value: ready ? '✅ Ready' : '⚠️ Not ready', inline: true },
      { name: 'Gateway latency', value: Number.isFinite(ping) && ping >= 0 ? `${Math.round(ping)} ms` : 'Awaiting heartbeat', inline: true },
      { name: 'Process uptime', value: duration(uptimeSeconds), inline: true },
      { name: 'Memory (RSS)', value: Number.isFinite(memory?.rss) ? `${Math.round(memory.rss / 1024 / 1024)} MiB` : 'Unknown', inline: true },
      { name: 'Runtime', value: `Node ${process.version} (${process.platform}/${process.arch})`, inline: true },
      { name: 'Loaded commands', value: `${client.commands?.size ?? 'Unknown'}`, inline: true },
      { name: 'API configuration', value: [
        `PUBG: ${flag(env.PUBG_API_KEY, 'your_pubg_api_key_here')}`,
        `FACEIT: ${flag(env.FACEIT_API_KEY, 'your_faceit_api_key_here')}`,
      ].join('\n') },
      { name: 'Command registration', value: [
        `TOKEN: ${flag(env.TOKEN)}`, `CLIENT_ID: ${flag(env.CLIENT_ID)}`, `GUILD_ID: ${flag(env.GUILD_ID)}`,
      ].join('\n') },
    ).setFooter({ text: 'API keys: presence only; use a stats lookup to verify access.' }).setTimestamp();
};

export const showBotStatus = async interaction => {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  return interaction.editReply({ embeds: [createStatusEmbed(interaction.client)], allowedMentions: { parse: [] } });
};
