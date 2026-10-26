import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags } from "discord.js";
import { recordWinWithRewards, addLoss, getPlayerStats, ColonistError } from "../utils/colonistSystem.js";
import { syncLevelRole } from '../utils/levelRoles.js';
import { colonistGames } from '../utils/colonistGameSystem.js';
import { openColonistGame, requestColonistWin, handleColonistGameButton } from '../utils/colonistGameUI.js';

const command = {
  data: new SlashCommandBuilder()
    .setName('colonist')
    .setDescription('Create a Colonist game, record results and view stats')
    .addSubcommand(subcommand => subcommand.setName('game').setDescription('Open or resume a game with your friends'))
    .addSubcommand(subcommand => subcommand.setName('win').setDescription('Confirm your own win in your active game'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('confirm')
        .setDescription('Moderator: confirm another player’s win and rewards')
        .addUserOption(option => option.setName('winner').setDescription('The winning server member (not yourself)').setRequired(true))
        .addStringOption(option => option.setName('match').setDescription('Unique Colonist match ID').setMinLength(6).setMaxLength(100).setRequired(true))
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('loss')
        .setDescription('Record a Colonist.io loss (resets streak)')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('stats')
        .setDescription('View your Colonist.io statistics')
        .addUserOption(option =>
          option.setName('user')
            .setDescription('View another user\'s stats')
            .setRequired(false)
        )
    ),
  
  handleButton: handleColonistGameButton,

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    
    if (subcommand === 'game' || subcommand === 'win') {
      try {
        return await (subcommand === 'game' ? openColonistGame(interaction) : requestColonistWin(interaction));
      } catch (error) {
        if (!(error instanceof ColonistError)) throw error;
        const content = `❌ ${error.message}`;
        return interaction.deferred ? interaction.editReply({ content, embeds: [], components: [] }) : interaction.reply({ content, flags: MessageFlags.Ephemeral });
      }
    }
    if (subcommand === 'confirm') {
      if (!interaction.inGuild() || !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({ content: '❌ A moderator with Manage Server must confirm the win.', flags: MessageFlags.Ephemeral });
      }
      const winner = interaction.options.getUser('winner');
      if (!winner || winner.bot || winner.id === interaction.user.id) {
        return interaction.reply({ content: '❌ Select another human server member as the winner.', flags: MessageFlags.Ephemeral });
      }
      await interaction.deferReply();
      let recorded = false;
      
      try {
        const member = await interaction.guild.members.fetch(winner.id);
        const userId = winner.id;
        const username = winner.username;
        
        const { result, xpResult, newBalance, alreadyRecorded } = await recordWinWithRewards(userId, username, {
          matchId: interaction.options.getString('match'), confirmedBy: interaction.user.id, guildId: interaction.guildId,
        });
        recorded = true;
        await syncLevelRole(member);
        if (alreadyRecorded) return await interaction.editReply('✅ This match is already recorded. No additional rewards were granted.');

        // Build response
        const winRate = result.totalGames > 0 
          ? ((result.wins / result.totalGames) * 100).toFixed(1) 
          : '0.0';
        
        const embed = new EmbedBuilder()
          .setColor('#FFD700')
          .setTitle('🎉 Colonist.io Victory!')
          .setDescription(`Congratulations ${winner}! Your win was confirmed by ${interaction.user}.`)
          .addFields(
            { name: '📊 Game Stats', value: '━━━━━━━━━━━━━━━━', inline: false },
            { name: '🏆 Total Wins', value: `${result.wins}`, inline: true },
            { name: '🎮 Total Games', value: `${result.totalGames}`, inline: true },
            { name: '📈 Win Rate', value: `${winRate}%`, inline: true },
            { name: '🔥 Current Streak', value: `${result.currentStreak} ${result.currentStreak >= 3 ? '🔥' : ''}`, inline: true },
            { name: '⭐ Longest Streak', value: `${result.longestStreak}`, inline: true },
            { name: '\u200B', value: '\u200B', inline: true },
            { name: '🎁 Rewards Earned', value: '━━━━━━━━━━━━━━━━', inline: false },
            { name: '✨ XP Gained', value: `+${result.xpReward} XP${xpResult.leveledUp ? ' 🎊 LEVEL UP!' : ''}`, inline: true },
            { name: '💰 Coins Earned', value: `+${result.coinReward} coins`, inline: true },
            { name: '💵 New Balance', value: `${newBalance} coins`, inline: true }
          )
          .setThumbnail(winner.displayAvatarURL())
          .setTimestamp();
        
        if (result.streakMultiplier > 0) {
          embed.setFooter({ text: `🔥 Streak Bonus Active! (${result.streakMultiplier}x multiplier)` });
        } else {
          embed.setFooter({ text: 'Win 3 games in a row for bonus rewards!' });
        }
        
        await interaction.editReply({ embeds: [embed] });
        
      } catch (error) {
        if (error instanceof ColonistError) return interaction.editReply(`❌ ${error.message}`);
        console.error('Colonist win error:', error);
        const message = recorded
          ? '✅ The win and rewards are already recorded. Check /colonist stats.'
          : '❌ Could not finish confirming the win. Retry with the same match ID; rewards will not be duplicated.';
        await interaction.editReply(message);
      }
      
    } else if (subcommand === 'loss') {
      if (await colonistGames.activeFor(interaction.user.id)) {
        return interaction.reply({ content: '❌ Käynnissä olevan pelin häviöt kirjataan automaattisesti. Voittaja vahvistaa pelin tuloksen.', flags: MessageFlags.Ephemeral });
      }
      await interaction.deferReply();
      
      try {
        const userId = interaction.user.id;
        const username = interaction.user.username;
        
        // Add loss
        const result = await addLoss(userId, username);
        
        if (!result || typeof result !== 'object') {
          throw new Error('Failed to record loss: Invalid result from addLoss');
        }
        
        const winRate = result.totalGames > 0 
          ? ((result.wins / result.totalGames) * 100).toFixed(1) 
          : '0.0';
        
        const embed = new EmbedBuilder()
          .setColor('#FF6B6B')
          .setTitle('💔 Colonist.io Defeat')
          .setDescription(`Better luck next time, ${interaction.user}!`)
          .addFields(
            { name: '📊 Game Stats', value: '━━━━━━━━━━━━━━━━', inline: false },
            { name: '🏆 Total Wins', value: `${result.wins}`, inline: true },
            { name: '🎮 Total Games', value: `${result.totalGames}`, inline: true },
            { name: '📈 Win Rate', value: `${winRate}%`, inline: true },
            { name: '🔥 Streak Reset', value: result.longestStreak > 0 ? `Best: ${result.longestStreak}` : 'No previous streak', inline: false }
          )
          .setFooter({ text: 'Your win streak has been reset. Start a new one!' })
          .setTimestamp();
        
        await interaction.editReply({ embeds: [embed] });
        
      } catch (error) {
        if (error instanceof ColonistError) return interaction.editReply(`❌ ${error.message}`);
        console.error('Colonist loss error:', error);
        await interaction.editReply('❌ Error recording loss. Please try again.');
      }
      
    } else if (subcommand === 'stats') {
      await interaction.deferReply();
      
      try {
        const targetUser = interaction.options.getUser('user') || interaction.user;
        const stats = await getPlayerStats(targetUser.id);
        
        if (!stats) {
          await interaction.editReply(`${targetUser.username} hasn't played Colonist.io yet!`);
          return;
        }
        
        const embed = new EmbedBuilder()
          .setColor('#5865F2')
          .setTitle(`🎲 Colonist.io Statistics`)
          .setDescription(`**${stats.username}**`)
          .addFields(
            { name: '🏆 Total Wins', value: `${stats.wins}`, inline: true },
            { name: '🎮 Total Games', value: `${stats.totalGames}`, inline: true },
            { name: '📈 Win Rate', value: `${stats.winRate}%`, inline: true },
            { name: '🔥 Current Streak', value: `${stats.currentStreak}`, inline: true },
            { name: '⭐ Longest Streak', value: `${stats.longestStreak}`, inline: true },
            { name: '📅 Last Win', value: stats.lastWinDate ? `<t:${Math.floor(new Date(stats.lastWinDate).getTime() / 1000)}:R>` : 'Never', inline: true }
          )
          .setThumbnail(targetUser.displayAvatarURL())
          .setFooter({ text: 'Use /colonist game to play and record results with friends' })
          .setTimestamp();
        
        await interaction.editReply({ embeds: [embed] });
        
      } catch (error) {
        console.error('Colonist stats error:', error);
        await interaction.editReply('❌ Error fetching stats. Please try again.');
      }
    }
  },
};

export default command;
