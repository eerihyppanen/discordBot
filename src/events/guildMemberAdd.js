import { userMention } from 'discord.js';

export default {
  name: 'guildMemberAdd',
  async execute(member) {
    const channelId = process.env.CHANNEL_ID;
    const channelName = process.env.CHANNEL_NAME;
    if (!channelId && !channelName) return;
    const channels = member.guild.channels.cache;
    const channel = channelId ? channels.get(channelId) : channels.find(item => item.name === channelName);
    if (!channel?.isTextBased() || typeof channel.send !== 'function') return;
    try {
      await channel.send({ content: `Welcome ${userMention(member.id)}!`, allowedMentions: { users: [member.id] } });
    } catch (error) {
      console.error('Welcome message delivery failed:', error);
    }
  },
};
