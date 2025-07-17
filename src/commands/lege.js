import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import fs from 'fs/promises';
import path from 'path';

const SKINS_FILE = path.join(process.cwd(), 'data', 'pubgSkins.json');

// Helper functions for skin data
const loadSkinData = async () => {
  try {
    const data = await fs.readFile(SKINS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return {};
  }
};

const saveSkinData = async (data) => {
  try {
    await fs.mkdir(path.dirname(SKINS_FILE), { recursive: true });
    await fs.writeFile(SKINS_FILE, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error saving skin data:', error);
  }
};

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
            .setRequired(false)
        )
    )
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
  
  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const skinData = await loadSkinData();
    const userId = interaction.user.id;
    
    // Initialize user data if doesn't exist
    if (!skinData[userId]) {
      skinData[userId] = {
        totalLegendary: 0,
        skins: [],
        lastUnbox: 0
      };
    }
    
    switch (subcommand) {
      case 'add':
        await handleAddSkin(interaction, skinData, userId);
        break;
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
    
    await saveSkinData(skinData);
  },
};

// Handle adding a skin
const handleAddSkin = async (interaction, skinData, userId) => {
  const skinName = interaction.options.getString('skin') || `Legendary Skin #${skinData[userId].totalLegendary + 1}`;
  
  // Add skin to user's collection
  skinData[userId].totalLegendary += 1;
  skinData[userId].skins.push({
    name: skinName,
    unboxedAt: Date.now()
  });
  skinData[userId].lastUnbox = Date.now();
  
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
      { name: '🏆 Total Legendary Skins', value: `${skinData[userId].totalLegendary}`, inline: true },
      { name: '📅 Unboxed', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }
    )
    .setThumbnail('https://i.imgur.com/YourLegendaryIcon.png') // You can add a PUBG legendary icon URL
    .setFooter({ text: 'PUBG Legendary Skin Tracker' })
    .setTimestamp();
  
  await interaction.reply({ embeds: [embed] });
};

// Handle showing count
const handleShowCount = async (interaction, skinData) => {
  const targetUser = interaction.options.getUser('user') || interaction.user;
  const targetId = targetUser.id;
  
  if (!skinData[targetId]) {
    skinData[targetId] = { totalLegendary: 0, skins: [], lastUnbox: 0 };
  }
  
  const userData = skinData[targetId];
  const lastUnbox = userData.lastUnbox ? `<t:${Math.floor(userData.lastUnbox / 1000)}:R>` : 'Never';
  
  const embed = new EmbedBuilder()
    .setColor('#ff6b35')
    .setTitle(`🎯 ${targetUser.username}'s Legendary Stats`)
    .setThumbnail(targetUser.displayAvatarURL())
    .addFields(
      { name: '🏆 Total Legendary Skins', value: `${userData.totalLegendary}`, inline: true },
      { name: '📦 Recent Skins', value: `${userData.skins.slice(-3).map(s => s.name).join('\n') || 'None'}`, inline: true },
      { name: '⏰ Last Unboxed', value: lastUnbox, inline: true }
    )
    .setFooter({ text: 'PUBG Legendary Skin Tracker' })
    .setTimestamp();
  
  await interaction.reply({ embeds: [embed] });
};

// Handle listing all skins
const handleListSkins = async (interaction, skinData, userId) => {
  const userData = skinData[userId];
  
  if (userData.skins.length === 0) {
    return interaction.reply('📦 You haven\'t unboxed any legendary skins yet! Use `/lege add` when you get one!');
  }
  
  const skinsPerPage = 10;
  const skins = userData.skins.slice().reverse(); // Show newest first
  const pages = Math.ceil(skins.length / skinsPerPage);
  const currentSkins = skins.slice(0, skinsPerPage);
  
  const skinList = currentSkins.map((skin, index) => {
    const unboxTime = `<t:${Math.floor(skin.unboxedAt / 1000)}:d>`;
    return `**${skins.length - index}.** ${skin.name} - ${unboxTime}`;
  }).join('\n');
  
  const embed = new EmbedBuilder()
    .setColor('#9b59b6')
    .setTitle(`📋 ${interaction.user.username}'s Legendary Collection`)
    .setDescription(skinList)
    .addFields(
      { name: '📊 Total Count', value: `${userData.totalLegendary} legendary skins`, inline: true },
      { name: '📄 Page', value: `1/${pages}`, inline: true }
    )
    .setFooter({ text: 'PUBG Legendary Skin Collection' })
    .setTimestamp();
  
  await interaction.reply({ embeds: [embed] });
};

// Handle leaderboard
const handleLeaderboard = async (interaction, skinData) => {
  const sortedUsers = Object.entries(skinData)
    .sort(([,a], [,b]) => b.totalLegendary - a.totalLegendary)
    .slice(0, 10);
  
  if (sortedUsers.length === 0) {
    return interaction.reply('📊 No legendary skins have been unboxed yet!');
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
  
  await interaction.reply({ embeds: [embed] });
};

export default command;