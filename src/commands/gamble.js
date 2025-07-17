import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import fs from 'fs/promises';
import path from 'path';

const ECONOMY_FILE = path.join(process.cwd(), 'data', 'economy.json');

// Helper functions
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
    .setName('gamble')
    .setDescription('Gambling games with your coins')
    .addSubcommand(subcommand =>
      subcommand
        .setName('coinflip')
        .setDescription('Flip a coin - double or nothing!')
        .addIntegerOption(option =>
          option.setName('amount')
            .setDescription('Amount to bet')
            .setRequired(true)
            .setMinValue(10)
            .setMaxValue(1000)
        )
        .addStringOption(option =>
          option.setName('choice')
            .setDescription('Heads or Tails?')
            .setRequired(true)
            .addChoices(
              { name: 'Heads', value: 'heads' },
              { name: 'Tails', value: 'tails' }
            )
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('slots')
        .setDescription('Try your luck at the slot machine!')
        .addIntegerOption(option =>
          option.setName('amount')
            .setDescription('Amount to bet')
            .setRequired(true)
            .setMinValue(5)
            .setMaxValue(500)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('dice')
        .setDescription('Roll dice - guess if sum is high (8-12) or low (2-6)')
        .addIntegerOption(option =>
          option.setName('amount')
            .setDescription('Amount to bet')
            .setRequired(true)
            .setMinValue(10)
            .setMaxValue(800)
        )
        .addStringOption(option =>
          option.setName('guess')
            .setDescription('High (8-12) or Low (2-6)?')
            .setRequired(true)
            .addChoices(
              { name: 'High (8-12)', value: 'high' },
              { name: 'Low (2-6)', value: 'low' }
            )
        )
    ),
  
  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const amount = interaction.options.getInteger('amount');
    const userId = interaction.user.id;
    
    const economy = await loadEconomy();
    
    // Initialize user if doesn't exist
    if (!economy[userId]) {
      economy[userId] = { coins: 100, bank: 0, lastDaily: 0 };
    }
    
    // Check if user has enough coins
    if (economy[userId].coins < amount) {
      return interaction.reply(`❌ You don't have enough coins! You have ${economy[userId].coins} coins but tried to bet ${amount}.`);
    }
    
    let result;
    switch (subcommand) {
      case 'coinflip':
        result = await handleCoinflip(interaction, economy, userId, amount);
        break;
      case 'slots':
        result = await handleSlots(interaction, economy, userId, amount);
        break;
      case 'dice':
        result = await handleDice(interaction, economy, userId, amount);
        break;
    }
    
    await saveEconomy(economy);
    return result;
  },
};

// Coinflip game
const handleCoinflip = async (interaction, economy, userId, amount) => {
  const choice = interaction.options.getString('choice');
  const flip = Math.random() < 0.5 ? 'heads' : 'tails';
  const won = choice === flip;
  
  const emoji = flip === 'heads' ? '🪙' : '🥇';
  
  if (won) {
    economy[userId].coins += amount; // Double money (keep original + win amount)
    const embed = new EmbedBuilder()
      .setColor('#00ff00')
      .setTitle('🎉 Coinflip Winner!')
      .addFields(
        { name: 'Your Choice', value: choice.charAt(0).toUpperCase() + choice.slice(1), inline: true },
        { name: 'Result', value: `${emoji} ${flip.charAt(0).toUpperCase() + flip.slice(1)}`, inline: true },
        { name: 'Winnings', value: `+${amount} coins`, inline: true },
        { name: 'New Balance', value: `${economy[userId].coins} coins`, inline: false }
      )
      .setTimestamp();
    
    return interaction.reply({ embeds: [embed] });
  } else {
    economy[userId].coins -= amount;
    const embed = new EmbedBuilder()
      .setColor('#ff0000')
      .setTitle('💔 Coinflip Lost')
      .addFields(
        { name: 'Your Choice', value: choice.charAt(0).toUpperCase() + choice.slice(1), inline: true },
        { name: 'Result', value: `${emoji} ${flip.charAt(0).toUpperCase() + flip.slice(1)}`, inline: true },
        { name: 'Lost', value: `-${amount} coins`, inline: true },
        { name: 'New Balance', value: `${economy[userId].coins} coins`, inline: false }
      )
      .setTimestamp();
    
    return interaction.reply({ embeds: [embed] });
  }
};

// Slot machine game
const handleSlots = async (interaction, economy, userId, amount) => {
  const symbols = ['🍒', '🍋', '🍊', '🍇', '⭐', '💎', '7️⃣'];
  const reel1 = symbols[Math.floor(Math.random() * symbols.length)];
  const reel2 = symbols[Math.floor(Math.random() * symbols.length)];
  const reel3 = symbols[Math.floor(Math.random() * symbols.length)];
  
  let multiplier = 0;
  let result = '';
  
  if (reel1 === reel2 && reel2 === reel3) {
    // Triple match
    if (reel1 === '💎') multiplier = 10; // Jackpot!
    else if (reel1 === '7️⃣') multiplier = 8;
    else if (reel1 === '⭐') multiplier = 6;
    else multiplier = 4;
    result = 'TRIPLE MATCH! 🎰';
  } else if (reel1 === reel2 || reel2 === reel3 || reel1 === reel3) {
    // Double match
    multiplier = 2;
    result = 'Double match! 🎯';
  } else {
    // No match
    multiplier = 0;
    result = 'No match 😔';
  }
  
  const winnings = amount * multiplier;
  
  if (multiplier > 0) {
    economy[userId].coins += winnings - amount; // Net winnings
    const embed = new EmbedBuilder()
      .setColor('#ffd700')
      .setTitle('🎰 SLOT MACHINE 🎰')
      .setDescription(`${reel1} | ${reel2} | ${reel3}`)
      .addFields(
        { name: 'Result', value: result, inline: false },
        { name: 'Multiplier', value: `x${multiplier}`, inline: true },
        { name: 'Winnings', value: `${winnings} coins`, inline: true },
        { name: 'New Balance', value: `${economy[userId].coins} coins`, inline: false }
      )
      .setTimestamp();
    
    return interaction.reply({ embeds: [embed] });
  } else {
    economy[userId].coins -= amount;
    const embed = new EmbedBuilder()
      .setColor('#ff0000')
      .setTitle('🎰 SLOT MACHINE 🎰')
      .setDescription(`${reel1} | ${reel2} | ${reel3}`)
      .addFields(
        { name: 'Result', value: result, inline: false },
        { name: 'Lost', value: `${amount} coins`, inline: true },
        { name: 'New Balance', value: `${economy[userId].coins} coins`, inline: false }
      )
      .setTimestamp();
    
    return interaction.reply({ embeds: [embed] });
  }
};

// Dice game
const handleDice = async (interaction, economy, userId, amount) => {
  const guess = interaction.options.getString('guess');
  const dice1 = Math.floor(Math.random() * 6) + 1;
  const dice2 = Math.floor(Math.random() * 6) + 1;
  const sum = dice1 + dice2;
  
  let won = false;
  if (guess === 'high' && sum >= 8) won = true;
  if (guess === 'low' && sum <= 6) won = true;
  
  const diceEmoji = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
  
  if (won) {
    economy[userId].coins += Math.floor(amount * 1.8); // 1.8x multiplier
    const embed = new EmbedBuilder()
      .setColor('#00ff00')
      .setTitle('🎲 Dice Winner! 🎲')
      .addFields(
        { name: 'Your Guess', value: guess.charAt(0).toUpperCase() + guess.slice(1), inline: true },
        { name: 'Dice Roll', value: `${diceEmoji[dice1-1]} ${diceEmoji[dice2-1]}`, inline: true },
        { name: 'Sum', value: `${sum}`, inline: true },
        { name: 'Winnings', value: `+${Math.floor(amount * 1.8)} coins`, inline: true },
        { name: 'New Balance', value: `${economy[userId].coins} coins`, inline: false }
      )
      .setTimestamp();
    
    return interaction.reply({ embeds: [embed] });
  } else {
    economy[userId].coins -= amount;
    const embed = new EmbedBuilder()
      .setColor('#ff0000')
      .setTitle('🎲 Dice Lost 🎲')
      .addFields(
        { name: 'Your Guess', value: guess.charAt(0).toUpperCase() + guess.slice(1), inline: true },
        { name: 'Dice Roll', value: `${diceEmoji[dice1-1]} ${diceEmoji[dice2-1]}`, inline: true },
        { name: 'Sum', value: `${sum}`, inline: true },
        { name: 'Lost', value: `-${amount} coins`, inline: true },
        { name: 'New Balance', value: `${economy[userId].coins} coins`, inline: false }
      )
      .setTimestamp();
    
    return interaction.reply({ embeds: [embed] });
  }
};

export default command;
