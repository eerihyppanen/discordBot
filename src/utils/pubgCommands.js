import { EmbedBuilder } from 'discord.js';
import { pubgClient, PUBG_SHARD } from './pubgClient.js';
import { getTopPlayers, updatePlayerWins, manualPubgStats } from './pubgWinsSystem.js';
import { truncateText } from './text.js';
import { profiles } from './profileSystem.js';

export const showPubgStats = async interaction => {
  await interaction.deferReply();
  if (!process.env.PUBG_API_KEY || process.env.PUBG_API_KEY === 'your_pubg_api_key_here') {
    return interaction.editReply('❌ PUBG API key not configured. Please contact the bot administrator.');
  }
  try {
    const username = interaction.options.getString('username') ?? (await profiles.get(interaction.user.id)).pubg;
    if (typeof username !== 'string' || !username.trim() || username.trim().length > 64) {
      return interaction.editReply('❌ Enter a PUBG username or save one with `/profile set pubg:<username>`.');
    }
    const player = await pubgClient.getPlayer(username);
    if (!player) return interaction.editReply('❌ Player not found!');
    const ids = [...new Set((player.relationships?.matches?.data ?? []).slice(0, 20).map(match => match.id))];
    if (interaction.options.getString('view') === 'last') {
      const stats = ids.length ? await pubgClient.getMatchStats(ids[0], player) : null;
      const embed = new EmbedBuilder().setColor('#ff6b35').setTitle(`🔫 PUBG Stats: ${player.attributes.name}`)
        .addFields({ name: 'Player', value: player.attributes.name, inline: true },
          { name: 'Platform', value: 'STEAM', inline: true }, { name: 'Shard', value: PUBG_SHARD.toUpperCase(), inline: true });
      if (stats) embed.addFields(
        { name: 'Kills', value: `${stats.kills}`, inline: true },
        { name: 'Damage Dealt', value: `${Math.round(stats.damageDealt)}`, inline: true },
        { name: 'Survival Time', value: `${Math.round(stats.timeSurvived / 60)} min`, inline: true },
        { name: 'Longest Kill', value: `${Math.round(stats.longestKill)}m`, inline: true },
        { name: 'Walk Distance', value: `${Math.round(stats.walkDistance)}m`, inline: true },
        { name: 'Rank', value: `#${stats.winPlace}`, inline: true },
      );
      else embed.setDescription('No last-match statistics are available.');
      embed.setFooter({ text: 'Powered by PUBG API' }).setTimestamp();
      return interaction.editReply({ embeds: [embed] });
    }
    if (!ids.length) return interaction.editReply(`❌ Found player **${player.attributes.name}** but no recent matches were returned by PUBG API. Try again after playing a match.`);
    let wins = 0, analyzed = 0, kills = 0, damage = 0;
    const results = await Promise.allSettled(ids.map(id => pubgClient.getMatchStats(id, player)));
    for (const result of results) {
      if (result.status === 'rejected' || !result.value) continue;
      const stats = result.value;
      analyzed++;
      if (stats.winPlace === 1) wins++;
      kills += stats.kills;
      damage += stats.damageDealt;
    }
    if (!analyzed) return interaction.editReply(`❌ Could not load participant stats for **${player.attributes.name}**. Saved ranking unchanged. Try again in a moment.`);
    const rate = ((wins / analyzed) * 100).toFixed(1);
    const complete = analyzed === ids.length;
    if (complete) await updatePlayerWins(player.attributes.name, 'steam', PUBG_SHARD, wins, analyzed, Number(rate));
    const embed = new EmbedBuilder().setColor('#ffd700').setTitle('🏆 PUBG Win Statistics')
      .setDescription(`**${player.attributes.name}**\nSTEAM • ${PUBG_SHARD.toUpperCase()}`)
      .addFields(
        { name: '🏅 Wins', value: `${wins}`, inline: true },
        { name: '🎮 Matches', value: `${analyzed}`, inline: true },
        { name: '📈 Win Rate', value: `${rate}%`, inline: true },
        { name: '💀 Avg Kills', value: (kills / analyzed).toFixed(1), inline: true },
        { name: '💥 Avg Damage', value: `${Math.round(damage / analyzed)}`, inline: true },
      )
      .setFooter({ text: `Analyzed ${analyzed}/${ids.length} recent matches (up to 20)${complete ? ' • /pubg leaderboard' : ' • Partial results; saved ranking unchanged'}` }).setTimestamp();
    return interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('PUBG API Error:', error);
    return interaction.editReply('❌ Error fetching PUBG data. Please try again later.');
  }
};

export const showPubgLeaderboard = async interaction => {
  await interaction.deferReply();
  try {
    const manual = interaction.options.getString('source') === 'manual';
    const players = await (manual ? manualPubgStats.getTopPlayers(10) : getTopPlayers(10));
    if (!players.length) return interaction.editReply(manual
      ? '📊 No manual totals yet. A moderator can add them with `/admin pubg-stats`.'
      : '📊 No recent snapshots yet! Use `/pubg stats` to start tracking players.');
    const text = players.map((player, index) => [
      `${['🥇', '🥈', '🥉'][index] ?? `${index + 1}.`} **${truncateText(player.username, 64)}**`,
      `   ${player.platform.toUpperCase()} • ${player.region}`,
      `   🏅 ${player.wins} wins • 📊 ${player.winRate}% WR • 🎮 ${player.totalMatches} matches`,
    ].join('\n')).join('\n\n');
    const embed = new EmbedBuilder().setColor('#ffd700').setTitle(manual ? '🏆 PUBG Manual Totals Leaderboard' : '🏆 PUBG Recent Wins Leaderboard')
      .setDescription(text).setFooter({ text: manual ? 'Moderator-entered totals; separate from recent matches' : 'Saved recent-match snapshots; legacy rows may have an unknown source' }).setTimestamp();
    return interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('PUBG Leaderboard Error:', error);
    return interaction.editReply('❌ Error loading leaderboard. Please try again later.');
  }
};

export const setPubgStats = async interaction => {
  const username = interaction.options.getString('username');
  const wins = interaction.options.getInteger('wins');
  const matches = interaction.options.getInteger('matches');
  await interaction.deferReply();
  if (wins > matches) return interaction.editReply('❌ Wins cannot be greater than total matches!');
  try {
    const rate = ((wins / matches) * 100).toFixed(1);
    await manualPubgStats.updatePlayerWins(username, 'steam', PUBG_SHARD, wins, matches, Number(rate));
    console.info('Manual PUBG stats update:', {
      actorId: interaction.user.id, guildId: interaction.guildId,
      username, platform: 'steam', region: PUBG_SHARD, wins, matches,
    });
    const embed = new EmbedBuilder().setColor('#00ff00').setTitle('✅ PUBG Manual Totals Updated')
      .setDescription(`**${username}** manual totals have been saved separately from recent API matches.`)
      .addFields(
        { name: '🎮 Platform', value: 'STEAM', inline: true },
        { name: '🏅 Wins', value: `${wins}`, inline: true },
        { name: '🎮 Matches', value: `${matches}`, inline: true },
        { name: '📈 Win Rate', value: `${rate}%`, inline: true },
      ).setFooter({ text: 'Use /pubg leaderboard source:manual to see updated totals' }).setTimestamp();
    return interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('Manual PUBG update error:', error);
    return interaction.editReply('❌ Error updating player stats. Please try again.');
  }
};
