const linkPattern = /(?:https?:\/\/|www\.)[^\s<>]+|(?:^|[\s(<])(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}(?::\d+)?(?:\/[^\s<>]*)?/i;

function containsLink(content) {
  return linkPattern.test(content);
}

function getRecentJoinTimes(joinTimes, now, windowMs) {
  return joinTimes.filter((joinTime) => joinTime > now - windowMs);
}

module.exports = { containsLink, getRecentJoinTimes };
