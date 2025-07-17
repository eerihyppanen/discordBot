import { SlashCommandBuilder } from "discord.js";
import { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } from "@discordjs/voice";
import ytdl from "ytdl-core";

const command = {
  data: new SlashCommandBuilder()
    .setName('play-simple')
    .setDescription('Play a YouTube video (simple version)')
    .addStringOption(option =>
      option.setName('url')
        .setDescription('YouTube URL')
        .setRequired(true)
    ),
  
  async execute(interaction) {
    const url = interaction.options.getString('url');
    const member = interaction.member;
    const channel = member.voice.channel;
    
    if (!channel) {
      return interaction.reply('❌ You need to join a voice channel first!');
    }
    
    if (!ytdl.validateURL(url)) {
      return interaction.reply('❌ Invalid YouTube URL!');
    }
    
    await interaction.deferReply();
    
    try {
      const connection = joinVoiceChannel({
        channelId: channel.id,
        guildId: interaction.guild.id,
        adapterCreator: interaction.guild.voiceAdapterCreator,
      });
      
      const stream = ytdl(url, { filter: 'audioonly', highWaterMark: 1 << 25 });
      const resource = createAudioResource(stream);
      const player = createAudioPlayer();
      
      player.play(resource);
      connection.subscribe(player);
      
      player.on(AudioPlayerStatus.Playing, () => {
        interaction.editReply('🎵 Started playing!');
      });
      
      player.on(AudioPlayerStatus.Idle, () => {
        connection.destroy();
      });
      
    } catch (error) {
      console.error(error);
      await interaction.editReply('❌ Error playing audio.');
    }
  },
};

export default command;