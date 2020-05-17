export const splitIntoArray = (value) => {
  if (value.startsWith('"') && value.endsWith('"')) {
    return [value.substring(1, value.length - 1)];
  }

  return value.length ? value.split(',') : [];
};

export const flatten = arrs => arrs.reduce((flatArr, arr) => [...flatArr, ...arr], []);

export const getAllRegexResults = (string, regex, resultToObj) => {
  let regexResult = regex.exec(string);

  if (regexResult == null || regexResult.index !== 0) {
    return null;
  }

  const results = [];
  while (regexResult != null) {
    results.push(resultToObj(regexResult));
    regexResult = regex.exec(string);
  }

  return results;
};

export default {
  splitIntoArray,
  flatten,
  getAllRegexResults,
};
