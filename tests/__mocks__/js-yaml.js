module.exports = {
  dump: (obj) => JSON.stringify(obj, null, 2),
  load: (str) => JSON.parse(str)
};