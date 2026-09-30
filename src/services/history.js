const fs = require('node:fs/promises');
const { historyFile } = require('../config');
const { ensureDirs } = require('../utils/fs');

async function readHistory() {
  try { return JSON.parse(await fs.readFile(historyFile, 'utf8')); }
  catch { return []; }
}
async function addHistory(entry) {
  const history = await readHistory();
  history.unshift({ ...entry, at: new Date().toISOString() });
  await ensureDirs({ history: require('node:path').dirname(historyFile) });
  await fs.writeFile(historyFile, JSON.stringify(history.slice(0, 500), null, 2));
}
module.exports = { readHistory, addHistory };
