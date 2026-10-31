export class CosmeticError extends Error {}

export const COSMETICS = Object.freeze([
  { id: 'title-regular', type: 'title', name: 'The Regular', price: 500 },
  { id: 'title-tactician', type: 'title', name: 'Master Tactician', price: 1000 },
  { id: 'title-legend', type: 'title', name: 'Community Legend', price: 2500 },
  { id: 'badge-dice', type: 'badge', name: '🎲 Dice Enthusiast', price: 300 },
  { id: 'badge-chicken', type: 'badge', name: '🍗 Chicken Dinner', price: 750 },
  { id: 'badge-crown', type: 'badge', name: '👑 Golden Crown', price: 1500 },
].map(Object.freeze));

export const cosmeticById = id => {
  const item = COSMETICS.find(item => item.id === id);
  if (!item) throw new CosmeticError('Unknown cosmetic. Check /profile shop for available items.');
  return item;
};
