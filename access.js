function canUseBot(settings, userId) {
  const allowedUserIds = Array.isArray(settings.allowedUserIds) ? settings.allowedUserIds : [];
  const blockedUserIds = Array.isArray(settings.blockedUserIds) ? settings.blockedUserIds : [];

  if (blockedUserIds.includes(userId)) {
    return false;
  }

  return allowedUserIds.length === 0 || allowedUserIds.includes(userId);
}

module.exports = { canUseBot };
