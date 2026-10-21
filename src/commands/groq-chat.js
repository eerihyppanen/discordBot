import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getGroqReply, groqErrorMessage } from '../utils/groqClient.js';

const command = {
  data: new SlashCommandBuilder()
    .setName('groq')
    .setDescription('Chat with AI (Groq - very fast)')
    .addStringOption((option) =>
      option.setName('message').setDescription('Your message to the AI').setMaxLength(4000).setRequired(true)),

  async execute(interaction) {
    const message = interaction.options.getString('message');
    await interaction.deferReply();

    if (!process.env.GROQ_API_KEY || process.env.GROQ_API_KEY === 'your_groq_api_key_here') {
      await interaction.editReply('❌ Groq API key not configured. Please contact the bot administrator.');
      return;
    }

    try {
      const aiResponse = await getGroqReply(message);
      const description = aiResponse.length > 4096 ? aiResponse.slice(0, 4093) + '...' : aiResponse;
      const embed = new EmbedBuilder()
        .setColor('#ff6b35')
        .setTitle('⚡ Groq AI Response')
        .setDescription(description)
        .setFooter({ text: 'Powered by Groq' });
      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error('Groq API Error:', error);
      await interaction.editReply(groqErrorMessage(error));
    }
  },
};

export default command;
