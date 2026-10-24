import { EmbedBuilder } from "discord.js";
import { addMessageXP, getRoleForLevel } from "../utils/levelingSystem.js";
import { syncLevelRole } from '../utils/levelRoles.js';

const event = {
  name: "messageCreate",
  async execute(message) {
    // Ignore bot messages
    if (message.author.bot || !message.guild || message.webhookId) return;
    
    // Add XP for sending a message
    const userProgress = await addMessageXP(message.author.id);
    // Also repairs a missed role update after a reconnect or a transient Discord error.
    if (userProgress.awarded) await syncLevelRole(message.member);
    
    // If user leveled up
    if (userProgress.leveledUp) {
      const newRoleName = getRoleForLevel(userProgress.level);
      
      // Send level up message
      const levelUpEmbed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('🎉 Level Up!')
        .setDescription(`Congratulations ${message.author}! You've reached level **${userProgress.level}**!`)
        .addFields(
          { name: 'New Title', value: newRoleName, inline: true },
          { name: 'XP', value: `${userProgress.xp}`, inline: true },
          { name: 'Next Level', value: `${userProgress.xpForNextLevel} XP`, inline: true }
        )
        .setThumbnail(message.author.displayAvatarURL())
        .setTimestamp();
      
      await message.channel.send({ embeds: [levelUpEmbed] });
    }
  },
};

export default event;
