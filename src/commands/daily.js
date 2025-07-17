import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import fs from 'fs/promises';
import path from 'path';

const ECONOMY_FILE = path.join(process.cwd(), 'data', 'economy.json');

// Add the missing helper functions
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
    .setName('daily')
    .setDescription('Claim your daily reward'),
  
  async execute(interaction) {
    const economy = await loadEconomy();
    const userId = interaction.user.id;
    
    if (!economy[userId]) {
      economy[userId] = { coins: 100, bank: 0, lastDaily: 0 };
    }
    
    const now = Date.now();
    const lastDaily = economy[userId].lastDaily || 0;
    const timeLeft = 24 * 60 * 60 * 1000 - (now - lastDaily);
    
    if (timeLeft > 0) {
      const hours = Math.floor(timeLeft / (60 * 60 * 1000));
      const minutes = Math.floor((timeLeft % (60 * 60 * 1000)) / (60 * 1000));
      
      return interaction.reply(`⏰ You already claimed your daily reward! Come back in ${hours}h ${minutes}m`);
    }
    
    const reward = Math.floor(Math.random() * 500) + 100; // 100-599 coins
    economy[userId].coins += reward;
    economy[userId].lastDaily = now;
    
    await saveEconomy(economy);
    
    const embed = new EmbedBuilder()
      .setColor('#00ff00')
      .setTitle('🎁 Daily Reward Claimed!')
      .setDescription(`You received **${reward} coins**!`)
      .addFields(
        { name: 'New Balance', value: `${economy[userId].coins} coins`, inline: true }
      )
      .setTimestamp();
    
    await interaction.reply({ embeds: [embed] });
  },
};

export default command;