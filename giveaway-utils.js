const { randomInt } = require("node:crypto");

function drawWinners(participantIds, winnerCount) {
  if (!Number.isInteger(winnerCount) || winnerCount < 0) {
    throw new RangeError("Số người thắng phải là số nguyên không âm.");
  }

  const entrants = [...new Set(participantIds)];
  const winnerLimit = Math.min(winnerCount, entrants.length);

  for (let index = 0; index < winnerLimit; index += 1) {
    const selectedIndex = index + randomInt(entrants.length - index);
    [entrants[index], entrants[selectedIndex]] = [entrants[selectedIndex], entrants[index]];
  }

  return entrants.slice(0, winnerLimit);
}

module.exports = { drawWinners };
