import { SlashCommandBuilder, EmbedBuilder } from "discord.js";

const command = {
  data: new SlashCommandBuilder()
    .setName('groq')
    .setDescription('Chat with AI (Groq - very fast)')
    .addStringOption(option =>
      option.setName('message')
        .setDescription('Your message to the AI')
        .setRequired(true)
    ),
  
  async execute(interaction) {
    const message = interaction.options.getString('message');
    
    await interaction.deferReply();
    
    // Check if API key is configured
    if (!process.env.GROQ_API_KEY || process.env.GROQ_API_KEY === 'your_groq_api_key_here') {
      await interaction.editReply('❌ Groq API key not configured. Please contact the bot administrator.');
      return;
    }
    
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messages: [
            {
              role: "system",
              content: "You are a helpful Discord bot assistant. Keep responses under 2000 characters."
            },
            {
              role: "user", 
              content: message
            }
          ],
          model: "llama-3.1-70b-versatile", // Free model
          max_tokens: 1000
        })
      });
      
      const data = await response.json();
      const aiResponse = data.choices[0].message.content;
      
      const embed = new EmbedBuilder()
        .setColor('#ff6b35')
        .setTitle('⚡ Groq AI Response')
        .setDescription(aiResponse)
        .setFooter({ text: 'Powered by Groq' });
      
      await interaction.editReply({ embeds: [embed] });
      
    } catch (error) {
      console.error('Groq API Error:', error);
      await interaction.editReply('❌ AI service error. Check your API key!');
    }
  },
};

export default command;