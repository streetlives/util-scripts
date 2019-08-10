export const splitIntoArray = (value) => {
  // TODO: Handle quoted strings.
  return value.length ? value.split(',') : [];
};

export default { splitIntoArray };
