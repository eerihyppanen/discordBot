import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { skins, emptyCollection } from '../utils/skinSystem.js';
import { renderSkinList, handleSkinButton, displaySkinName } from '../utils/skinList.js';

const command = {
  data: new SlashCommandBuilder()
    .setName('lege')
    .setDescription('PUBG Legendary Skin Counter')
    .addSubcommand(subcommand =>
      subcommand
        .setName('add')
        .setDescription('Add a legendary skin to your collection')
        .addStringOption(option =>
          option.setName('skin')
            .setDescription('Name of the legendary skin (optional)')
            .setMaxLength(200)
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand => subcommand.setName('undo').setDescription('Remove your most recently added legendary skin'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('count')
        .setDescription('Check your legendary skin count')
        .addUserOption(option =>
          option.setName('user')
            .setDescription('Check another user\'s count')
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('List all your legendary skins')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('leaderboard')
        .setDescription('Show legendary skin leaderboard')
    ),
  
  handleButton: handleSkinButton,

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const userId = interaction.user.id;
    await interaction.deferReply();

    if (subcommand === 'add') {
      return handleAddSkin(interaction, userId);
    }

    if (subcommand === 'undo') {
      const result = await skins.undo(userId);
      return interaction.editReply(result
        ? { content: `↩️ Removed **${displaySkinName(result.skin.name)}**. You now have ${result.userData.totalLegendary} legendary skins.`, allowedMentions: { parse: [] } }
        : 'There are no legendary skins to undo.');
    }

    const skinData = await skins.read();
    switch (subcommand) {
      case 'count':
        await handleShowCount(interaction, skinData);
        break;
      case 'list':
        await handleListSkins(interaction, skinData, userId);
        break;
      case 'leaderboard':
        await handleLeaderboard(interaction, skinData);
        break;
    }
  },
};

// Handle adding a skin
const handleAddSkin = async (interaction, userId) => {
  // The queued update is on disk before we confirm it to Discord.
  const { skinName, userData } = await skins.add(userId, interaction.options.getString('skin'));
  
  // Random congratulatory messages
  const messages = [
    "🎉 LEGENDARY DROP! 🎉",
    "💎 HOLY SHIT! LEGENDARY! 💎",
    "🔥 INSANE LUCK! 🔥",
    "⚡ LEGENDARY UNBOXED! ⚡",
    "🎯 JACKPOT! LEGENDARY! 🎯"
  ];
  
  const randomMessage = messages[Math.floor(Math.random() * messages.length)];
  
  const embed = new EmbedBuilder()
    .setColor('#ffd700')
    .setTitle(randomMessage)
    .setDescription(`**${skinName}** has been added to your collection!`)
    .addFields(
      { name: '🏆 Total Legendary Skins', value: `${userData.totalLegendary}`, inline: true },
      { name: '📅 Unboxed', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }
    )
    .setFooter({ text: 'PUBG Legendary Skin Tracker' })
    .setTimestamp();
  
  await interaction.editReply({ embeds: [embed] });
};

// Handle showing count
const handleShowCount = async (interaction, skinData) => {
  const targetUser = interaction.options.getUser('user') || interaction.user;
  const targetId = targetUser.id;
  
  const userData = skinData[targetId] || emptyCollection();
  const lastUnbox = userData.lastUnbox ? `<t:${Math.floor(userData.lastUnbox / 1000)}:R>` : 'Never';
  
  const embed = new EmbedBuilder()
    .setColor('#ff6b35')
    .setTitle(`🎯 ${targetUser.username}'s Legendary Stats`)
    .setThumbnail(targetUser.displayAvatarURL())
    .addFields(
      { name: '🏆 Total Legendary Skins', value: `${userData.totalLegendary}`, inline: true },
      { name: '📦 Recent Skins', value: `${userData.skins.slice(-3).map(s => displaySkinName(s.name)).join('\n') || 'None'}`, inline: true },
      { name: '⏰ Last Unboxed', value: lastUnbox, inline: true }
    )
    .setFooter({ text: 'PUBG Legendary Skin Tracker' })
    .setTimestamp();
  
  await interaction.editReply({ embeds: [embed] });
};

// Handle listing all skins
const handleListSkins = (interaction, skinData, userId) =>
  interaction.editReply(renderSkinList(interaction.user, skinData[userId]));

// Handle leaderboard
const handleLeaderboard = async (interaction, skinData) => {
  const sortedUsers = Object.entries(skinData)
    .sort(([,a], [,b]) => b.totalLegendary - a.totalLegendary)
    .slice(0, 10);
  
  if (sortedUsers.length === 0) {
    return interaction.editReply('📊 No legendary skins have been unboxed yet!');
  }
  
  let leaderboard = '';
  for (let i = 0; i < sortedUsers.length; i++) {
    const [userId, data] = sortedUsers[i];
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
    
    try {
      const user = await interaction.client.users.fetch(userId);
      leaderboard += `${medal} **${user.username}** - ${data.totalLegendary} legendary skins\n`;
    } catch (error) {
      leaderboard += `${medal} **Unknown User** - ${data.totalLegendary} legendary skins\n`;
    }
  }
  
  const embed = new EmbedBuilder()
    .setColor('#ffd700')
    .setTitle('🏆 PUBG Legendary Skin Leaderboard')
    .setDescription(leaderboard)
    .setFooter({ text: 'Who\'s the luckiest unboxer?' })
    .setTimestamp();
  
  await interaction.editReply({ embeds: [embed] });
};

export default command;
