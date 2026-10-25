// Discord counts UTF-16 code units; avoid splitting a surrogate pair when shortening.
export const truncateText = (value, maxLength) => {
  const text = String(value ?? '');
  if (text.length <= maxLength) return text;
  let end = maxLength - 1;
  if (/[\uD800-\uDBFF]/.test(text[end - 1])) end--;
  return text.slice(0, end) + '…';
};
