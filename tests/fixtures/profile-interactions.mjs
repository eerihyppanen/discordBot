import { dispatchInteraction } from '../../src/utils/interactionHandler.js';

export const profileUser = id => ({ id, username: 'Player ' + id, displayAvatarURL: () => 'https://example.com/avatar.png' });
export const profileRequest = (command, { operation, id = '101', target, customId, type = 'command', values = [], username = '' } = {}) => {
  const output = {};
  const r = {
    id: 'interaction-' + id, user: profileUser(id), commandName: 'profile', customId, values,
    client: { commands: new Map([['profile', command]]) }, message: type === 'command' ? undefined : { id: 'panel-' + id },
    options: { getSubcommand: () => operation, getString: () => null, getUser: () => target },
    fields: { getTextInputValue: () => username },
    isButton: () => type === 'button', isStringSelectMenu: () => type === 'select', isModalSubmit: () => type === 'modal',
    isChatInputCommand: () => type === 'command', isFromMessage: () => type === 'modal',
    deferReply: async options => { output.flags = options?.flags; r.deferred = true; },
    deferUpdate: async () => { output.updated = true; r.deferred = true; },
    editReply: async payload => { output.reply = payload; },
    reply: async payload => { output.reply = payload; r.replied = true; },
    followUp: async payload => { output.followUp = payload; },
    showModal: async modal => { output.modal = modal.toJSON(); r.replied = true; },
  };
  return { r, output, run: () => dispatchInteraction(r) };
};
export const panelComponents = payload => (payload.components ?? []).flatMap(row => row.toJSON().components);
