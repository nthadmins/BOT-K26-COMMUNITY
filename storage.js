const fs = require("node:fs");
const path = require("node:path");

const dataDirectory = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, "..", "data");
const settingsPath = path.join(dataDirectory, "guild-settings.json");

function readSettings() {
  try {
    return JSON.parse(fs.readFileSync(settingsPath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") {
      return {};
    }

    throw new Error(`Không đọc được ${settingsPath}: ${error.message}`);
  }
}

function getGuildSettings(guildId) {
  return readSettings()[guildId] ?? {};
}

function updateGuildSettings(guildId, updates) {
  const settings = readSettings();
  settings[guildId] = { ...settings[guildId], ...updates };

  fs.mkdirSync(dataDirectory, { recursive: true });
  const temporaryPath = `${settingsPath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
  fs.renameSync(temporaryPath, settingsPath);
  return settings[guildId];
}

module.exports = { getGuildSettings, updateGuildSettings };
