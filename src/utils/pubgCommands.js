import { EmbedBuilder } from 'discord.js';
import { fetchPCPlayer, pubgHeaders, PUBG_SHARD } from './pubgClient.js';
import { getTopPlayers, updatePlayerWins } from './pubgWinsSystem.js';
import { truncateText } from './text.js';

const matchStats = async (id, player) => {
  const response = await fetch(`https://api.pubg.com/shards/${PUBG_SHARD}/matches/${encodeURIComponent(id)}`, {
    headers: pubgHeaders(), signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) return null;
  const data = await response.json();
  return data.included?.find(item => item.type === 'participant' && (
    item.attributes?.stats?.playerId === player.id ||
    item.attributes?.stats?.name?.toLowerCase() === player.attributes.name.toLowerCase()
  ))?.attributes.stats ?? null;
};

export const showPubgStats = async interaction => {
  await interaction.deferReply();
  if (!process.env.PUBG_API_KEY || process.env.PUBG_API_KEY === 'your_pubg_api_key_here') {
    return interaction.editReply('❌ PUBG API key not configured. Please contact the bot administrator.');
  }
  try {
    const player = await fetchPCPlayer(interaction.options.getString('username'));
    if (!player) return interaction.editReply('❌ Player not found!');
    const ids = (player.relationships?.matches?.data ?? []).slice(0, 20).map(match => match.id);
    if (interaction.options.getString('view') === 'last') {
      const stats = ids.length ? await matchStats(ids[0], player) : null;
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
    for (const id of ids) {
      try {
        const stats = await matchStats(id, player);
        if (!stats) continue;
        analyzed++;
        if (stats.winPlace === 1) wins++;
        kills += stats.kills || 0;
        damage += stats.damageDealt || 0;
      } catch (error) { console.error(`Error fetching PUBG match ${id}:`, error); }
    }
    if (!analyzed) return interaction.editReply(`❌ Could not load participant stats for **${player.attributes.name}**. Try again in a moment.`);
    const rate = ((wins / analyzed) * 100).toFixed(1);
    await updatePlayerWins(player.attributes.name, 'steam', PUBG_SHARD, wins, analyzed, Number(rate));
    const embed = new EmbedBuilder().setColor('#ffd700').setTitle('🏆 PUBG Win Statistics')
      .setDescription(`**${player.attributes.name}**\nSTEAM • ${PUBG_SHARD.toUpperCase()}`)
      .addFields(
        { name: '🏅 Wins', value: `${wins}`, inline: true },
        { name: '🎮 Matches', value: `${analyzed}`, inline: true },
        { name: '📈 Win Rate', value: `${rate}%`, inline: true },
        { name: '💀 Avg Kills', value: (kills / analyzed).toFixed(1), inline: true },
        { name: '💥 Avg Damage', value: `${Math.round(damage / analyzed)}`, inline: true },
      )
      .setFooter({ text: `Analyzed ${analyzed}/${ids.length} recent matches (up to 20) • /pubg leaderboard` }).setTimestamp();
    return interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('PUBG API Error:', error);
    return interaction.editReply('❌ Error fetching PUBG data. Please try again later.');
  }
};

export const showPubgLeaderboard = async interaction => {
  await interaction.deferReply();
  try {
    const players = await getTopPlayers(10);
    if (!players.length) return interaction.editReply('📊 No players tracked yet! Use `/pubg stats` to start tracking players.');
    const text = players.map((player, index) => [
      `${['🥇', '🥈', '🥉'][index] ?? `${index + 1}.`} **${truncateText(player.username, 64)}**`,
      `   ${player.platform.toUpperCase()} • ${player.region}`,
      `   🏅 ${player.wins} wins • 📊 ${player.winRate}% WR • 🎮 ${player.totalMatches} matches`,
    ].join('\n')).join('\n\n');
    const embed = new EmbedBuilder().setColor('#ffd700').setTitle('🏆 PUBG Win Leaderboard')
      .setDescription(text).setFooter({ text: 'Saved recent-match snapshots; may include manual updates' }).setTimestamp();
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
    await updatePlayerWins(username, 'steam', PUBG_SHARD, wins, matches, Number(rate));
    console.info('Manual PUBG stats update:', {
      actorId: interaction.user.id, guildId: interaction.guildId,
      username, platform: 'steam', region: PUBG_SHARD, wins, matches,
    });
    const embed = new EmbedBuilder().setColor('#00ff00').setTitle('✅ PUBG Stats Updated')
      .setDescription(`**${username}** stats have been manually updated!`)
      .addFields(
        { name: '🎮 Platform', value: 'STEAM', inline: true },
        { name: '🏅 Wins', value: `${wins}`, inline: true },
        { name: '🎮 Matches', value: `${matches}`, inline: true },
        { name: '📈 Win Rate', value: `${rate}%`, inline: true },
      ).setFooter({ text: 'Use /pubg leaderboard to see updated rankings' }).setTimestamp();
    return interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('Manual PUBG update error:', error);
    return interaction.editReply('❌ Error updating player stats. Please try again.');
  }
};
