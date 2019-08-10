export const splitIntoArray = (value) => {
  if (value.startsWith('"') && value.endsWith('"')) {
    return [value.substring(1, value.length - 1)];
  }

  return value.length ? value.split(',') : [];
};

export default { splitIntoArray };
