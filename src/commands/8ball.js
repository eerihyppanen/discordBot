import { SlashCommandBuilder, EmbedBuilder } from "discord.js";

const responses = [
  "It is certain", "It is decidedly so", "Without a doubt", "Yes definitely",
  "You may rely on it", "As I see it, yes", "Most likely", "Outlook good",
  "Yes", "Signs point to yes", "Reply hazy, try again", "Ask again later",
  "Better not tell you now", "Cannot predict now", "Concentrate and ask again",
  "Don't count on it", "My reply is no", "My sources say no",
  "Outlook not so good", "Very doubtful"
];

const command = {
  data: new SlashCommandBuilder()
    .setName('8ball')
    .setDescription('Ask the magic 8-ball a question')
    .addStringOption(option =>
      option.setName('question')
        .setDescription('Your question for the 8-ball')
        .setRequired(true)
    ),
  
  async execute(interaction) {
    const question = interaction.options.getString('question');
    const response = responses[Math.floor(Math.random() * responses.length)];
    
    const embed = new EmbedBuilder()
      .setColor('#000000')
      .setTitle('🎱 Magic 8-Ball')
      .addFields(
        { name: 'Question', value: question, inline: false },
        { name: 'Answer', value: `*${response}*`, inline: false }
      )
      .setThumbnail('https://upload.wikimedia.org/wikipedia/commons/thumb/f/fd/8-Ball_Pool.svg/256px-8-Ball_Pool.svg.png')
      .setTimestamp();
    
    await interaction.reply({ embeds: [embed] });
  },
};

export default command;