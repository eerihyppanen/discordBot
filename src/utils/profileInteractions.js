import { MessageFlags } from 'discord.js';
import { profiles, ProfileError } from './profileSystem.js';
import { economy } from './economySystem.js';
import { COSMETICS, CosmeticError, cosmeticById } from './cosmeticCatalog.js';
import { renderProfileCard, renderProfilePanel, profileNameModal } from './profilePanels.js';

const queues = new Map();
const enqueue = (key, task) => {
  const result = (queues.get(key) ?? Promise.resolve()).catch(() => {}).then(task);
  queues.set(key, result);
  const done = () => { if (queues.get(key) === result) queues.delete(key); };
  void result.then(done, done);
  return result;
};
const knownError = error => error instanceof ProfileError || error instanceof CosmeticError;
const staleCommands = { set: 'settings', show: 'settings', clear: 'settings', buy: 'shop', equip: 'inventory', unequip: 'inventory' };

export const openProfile = async interaction => {
  const requested = interaction.options.getSubcommand();
  const view = Object.hasOwn(staleCommands, requested) ? staleCommands[requested] : requested;
  await interaction.deferReply(view === 'card' ? {} : { flags: MessageFlags.Ephemeral });
  if (view === 'card') return interaction.editReply(await renderProfileCard(interaction.options.getUser('user') ?? interaction.user));
  if (!['settings', 'shop', 'inventory'].includes(view)) throw new ProfileError('Profile commands changed. Open /profile settings, shop or inventory.');
  const content = view !== requested ? 'Profile commands were updated. Use the buttons and selectors below; your old inputs were not applied.' : '';
  return interaction.editReply(await renderProfilePanel(view, interaction.user.id, content));
};

const parseControl = interaction => {
  const match = /^profile:(\d{1,20}):(settings|shop|inventory):(edit|save|clear|buy|equip|remove|open):([a-z0-9-]+)$/.exec(interaction.customId);
  if (!match) throw new ProfileError('This profile control is invalid or out of date. Open the profile panel again.');
  const [, owner, view, action, target] = match;
  if (owner !== interaction.user.id) throw new ProfileError('This menu belongs to another user. Open your own /profile panel.');
  const button = interaction.isButton?.();
  const valid = view === 'settings' && ['pubg', 'faceit'].includes(target) &&
      (action === 'edit' && button || action === 'save' && interaction.isModalSubmit?.()) ||
    view === 'settings' && action === 'clear' && ['pubg', 'faceit', 'all'].includes(target) && button ||
    view === 'shop' && action === 'buy' && COSMETICS.some(item => item.id === target) && button ||
    view === 'inventory' && action === 'equip' && ['title', 'badge'].includes(target) && interaction.isStringSelectMenu?.() ||
    view === 'inventory' && action === 'remove' && ['title', 'badge', 'all'].includes(target) && button ||
    action === 'open' && button && (view === 'shop' && target === 'inventory' || view === 'inventory' && target === 'shop');
  if (!valid) throw new ProfileError('This profile control is invalid or out of date. Open the profile panel again.');
  return { owner, view, action, target };
};

export const handleProfileComponent = async interaction => {
  let committed = false;
  try {
    const { owner, view, action, target } = parseControl(interaction);
    if (action === 'edit') return await interaction.showModal(await profileNameModal(owner, target));
    // Acknowledge immediately; enqueue before awaiting HTTP so actions keep arrival order.
    const acknowledgement = action === 'save' && !interaction.isFromMessage?.()
      ? interaction.deferReply({ flags: MessageFlags.Ephemeral }) : interaction.deferUpdate();
    // Observe failure now while still awaiting it in-order before any mutation.
    void acknowledgement.catch(() => {});
    return await enqueue(interaction.message?.id ?? `${owner}:${view}`, async () => {
      await acknowledgement;
      let nextView = view, content = '';
      try {
        if (action === 'save') {
          await profiles.set(owner, { [target]: interaction.fields.getTextInputValue('username') });
          committed = true; content = '✅ Username saved.';
        } else if (action === 'clear') {
          await profiles.clear(owner, target);
          committed = true; content = '✅ Saved username settings cleared.';
        } else if (action === 'buy') {
          const result = await economy.buyCosmetic(owner, target);
          committed = true;
          content = result.alreadyOwned ? `You already own ${result.item.name}. No coins were charged.` : `✅ Purchased ${result.item.name} for ${result.item.price} coins.`;
        } else if (action === 'equip') {
          if (interaction.values?.length !== 1 || cosmeticById(interaction.values[0]).type !== target) throw new ProfileError(`Invalid ${target} selection.`);
          await economy.equipCosmetic(owner, interaction.values[0]);
          committed = true; content = '✅ Cosmetic equipped. Show it with /profile card.';
        } else if (action === 'remove') {
          await economy.unequipCosmetic(owner, target);
          committed = true; content = '✅ Selection removed. You still own your cosmetics.';
        } else nextView = target;
      } catch (error) {
        if (!knownError(error)) throw error;
        content = `❌ ${error.message}`;
      }
      return interaction.editReply(await renderProfilePanel(nextView, owner, content));
    });
  } catch (error) {
    if (!knownError(error)) console.error('Profile panel action failed:', error);
    const content = committed ? '✅ Your change was saved. Reopen the profile panel to refresh it.'
      : knownError(error) ? `❌ ${error.message}` : '❌ Your change could not be saved. Please try again.';
    try {
      if (interaction.deferred || interaction.replied) return await interaction.followUp({ content, flags: MessageFlags.Ephemeral });
      return await interaction.reply({ content, flags: MessageFlags.Ephemeral });
    } catch (notifyError) { console.error('Could not notify the profile panel user:', notifyError); }
  }
};
