import { EmbedBuilder } from "discord.js";
import { addXP, getRoleForLevel, LEVEL_ROLES } from "../utils/levelingSystem.js";

const event = {
  name: "messageCreate",
  async execute(message) {
    // Ignore bot messages
    if (message.author.bot) return;
    
    // Add XP for sending a message
    const userProgress = await addXP(message.author.id);
    
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
      
      message.channel.send({ embeds: [levelUpEmbed] });
      
      // Assign role if it exists
      await assignLevelRole(message.member, userProgress.level);
    }
  },
};

// Function to assign roles based on level
const assignLevelRole = async (member, level) => {
  try {
    const guild = member.guild;
    const roleName = getRoleForLevel(level);
    
    // Find the role in the guild
    let role = guild.roles.cache.find(r => r.name === roleName);
    
    // Create role if it doesn't exist
    if (!role) {
      role = await guild.roles.create({
        name: roleName,
        color: getColorForLevel(level),
        reason: 'Automatic role creation for leveling system'
      });
    }
    
    // Remove old level roles
    const levelRoleNames = Object.values(LEVEL_ROLES);
    const oldRoles = member.roles.cache.filter(r => 
      levelRoleNames.includes(r.name) && r.name !== roleName
    );
    
    if (oldRoles.size > 0) {
      await member.roles.remove(oldRoles);
    }
    
    // Add new role
    if (!member.roles.cache.has(role.id)) {
      await member.roles.add(role);
    }
    
  } catch (error) {
    console.error('Error assigning level role:', error);
  }
};

// Get color based on level
const getColorForLevel = (level) => {
  if (level >= 25) return '#ff6b35'; // Legend - Orange
  if (level >= 20) return '#9b59b6'; // Elite - Purple  
  if (level >= 15) return '#e74c3c'; // Veteran - Red
  if (level >= 10) return '#f39c12'; // Active Member - Yellow
  if (level >= 5) return '#3498db';  // Member - Blue
  return '#95a5a6'; // Newcomer - Gray
};

export default event;