const fs = require("node:fs");
const path = require("node:path");

const dataDirectory = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, "..", "data");
const giveawaysPath = path.join(dataDirectory, "giveaways.json");

function readGiveaways() {
  try {
    return JSON.parse(fs.readFileSync(giveawaysPath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") {
      return {};
    }

    throw new Error(`Không đọc được ${giveawaysPath}: ${error.message}`);
  }
}

function writeGiveaways(giveaways) {
  fs.mkdirSync(dataDirectory, { recursive: true });
  const temporaryPath = `${giveawaysPath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(giveaways, null, 2)}\n`, "utf8");
  fs.renameSync(temporaryPath, giveawaysPath);
}

function getGiveaways() {
  return Object.values(readGiveaways());
}

function getGiveaway(giveawayId) {
  return readGiveaways()[giveawayId] ?? null;
}

function createGiveaway(giveaway) {
  const giveaways = readGiveaways();
  if (giveaways[giveaway.id]) {
    throw new Error(`Giveaway ${giveaway.id} đã tồn tại.`);
  }

  giveaways[giveaway.id] = giveaway;
  writeGiveaways(giveaways);
  return giveaway;
}

function updateGiveaway(giveawayId, updates) {
  const giveaways = readGiveaways();
  if (!giveaways[giveawayId]) {
    throw new Error(`Không tìm thấy giveaway ${giveawayId}.`);
  }

  giveaways[giveawayId] = { ...giveaways[giveawayId], ...updates };
  writeGiveaways(giveaways);
  return giveaways[giveawayId];
}

module.exports = {
  createGiveaway,
  getGiveaway,
  getGiveaways,
  updateGiveaway
};
