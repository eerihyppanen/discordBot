import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import fs from 'fs/promises';
import path from 'path';

const ECONOMY_FILE = path.join(process.cwd(), 'data', 'economy.json');

const loadEconomy = async () => {
  try {
    const data = await fs.readFile(ECONOMY_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return {};
  }
};

const saveEconomy = async (data) => {
  try {
    await fs.mkdir(path.dirname(ECONOMY_FILE), { recursive: true });
    await fs.writeFile(ECONOMY_FILE, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error saving economy data:', error);
  }
};

const command = {
  data: new SlashCommandBuilder()
    .setName('balance')
    .setDescription('Check your balance')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('Check another user\'s balance')
        .setRequired(false)
    ),
  
  async execute(interaction) {
    const targetUser = interaction.options.getUser('user') || interaction.user;
    const economy = await loadEconomy();
    
    if (!economy[targetUser.id]) {
      economy[targetUser.id] = { coins: 100, bank: 0 };
      await saveEconomy(economy);
    }
    
    const userEconomy = economy[targetUser.id];
    
    const embed = new EmbedBuilder()
      .setColor('#ffd700')
      .setTitle(`💰 ${targetUser.username}'s Balance`)
      .addFields(
        { name: '💵 Wallet', value: `${userEconomy.coins} coins`, inline: true },
        { name: '🏦 Bank', value: `${userEconomy.bank} coins`, inline: true },
        { name: '💎 Total', value: `${userEconomy.coins + userEconomy.bank} coins`, inline: true }
      )
      .setThumbnail(targetUser.displayAvatarURL())
      .setTimestamp();
    
    await interaction.reply({ embeds: [embed] });
  },
};

export default command;