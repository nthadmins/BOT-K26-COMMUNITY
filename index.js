require("dotenv").config();

const { randomUUID } = require("node:crypto");
const path = require("node:path");
const {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  GuildScheduledEventEntityType,
  GuildScheduledEventPrivacyLevel,
  PermissionFlagsBits
} = require("discord.js");
const { canUseBot } = require("./access");
const { drawWinners } = require("./giveaway-utils");
const {
  createGiveaway,
  getGiveaway,
  getGiveaways,
  updateGiveaway
} = require("./giveaway-storage");
const { containsLink, getRecentJoinTimes } = require("./moderation-utils");
const { getGuildSettings, updateGuildSettings } = require("./storage");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent
  ]
});

const ticketOwnerPrefix = "ticket-owner=";
const giveawayTimers = new Map();
const finishingGiveaways = new Set();
const raidJoinTimesByGuild = new Map();
const lastRaidAlertAtByGuild = new Map();
const maxTimerDelay = 2147000000;
const defaultWelcomeMessage = "Chào mừng {mention} đến với **{server}**!";
const defaultLeaveMessage = "Tạm biệt {user}, mong sớm gặp lại bạn ở **{server}**!";
const defaultDirectMessage = "Chào mừng {mention} đến với **{server}**! Rất vui vì bạn đã tham gia.";

function getTicketOwner(channel) {
  if (!channel.topic || !channel.topic.startsWith(ticketOwnerPrefix)) {
    return null;
  }

  return channel.topic.slice(ticketOwnerPrefix.length).split(";")[0];
}

function isTicketClosed(channel) {
  return channel.topic?.split(";").includes("closed") ?? false;
}

function ticketControls() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("ticket:open")
      .setLabel("Mở ticket")
      .setStyle(ButtonStyle.Primary)
      .setEmoji("🎫")
  );
}

function closeControl() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("ticket:close")
      .setLabel("Đóng ticket")
      .setStyle(ButtonStyle.Danger)
  );
}

function verifyControl() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("verify:claim")
      .setLabel("Xác minh")
      .setStyle(ButtonStyle.Success)
      .setEmoji("✅")
  );
}

function giveawayControls(giveaway, disabled) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`giveaway:join:${giveaway.id}`)
      .setLabel("Tham gia giveaway")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(Boolean(disabled))
  );
}

function giveawayEmbed(giveaway) {
  const endTimestamp = Math.floor(giveaway.endsAt / 1000);
  const description = [
    `🎁 **Phần thưởng:** ${giveaway.prize}`,
    `🏆 **Số người thắng:** ${giveaway.winnerCount}`,
    `👥 **Đã tham gia:** ${giveaway.entrants.length}`,
    `⏰ **Kết thúc:** <t:${endTimestamp}:F> (<t:${endTimestamp}:R>)`
  ].join("\n");

  return new EmbedBuilder()
    .setColor(giveaway.status === "completed" ? 0x95a5a6 : 0xf1c40f)
    .setTitle(giveaway.name)
    .setDescription(description)
    .setFooter({ text: giveaway.status === "completed" ? "Giveaway đã kết thúc" : "Nhấn nút bên dưới để tham gia" });
}

function scheduleGiveaway(giveaway, requestedDelay) {
  const previousTimer = giveawayTimers.get(giveaway.id);
  if (previousTimer) {
    clearTimeout(previousTimer);
  }

  if (!["active", "processing"].includes(giveaway.status)) {
    giveawayTimers.delete(giveaway.id);
    return;
  }

  const remaining = Math.max(0, giveaway.endsAt - Date.now());
  const delay = requestedDelay === undefined ? Math.min(remaining, maxTimerDelay) : requestedDelay;
  const timer = setTimeout(() => {
    giveawayTimers.delete(giveaway.id);
    const current = getGiveaway(giveaway.id);
    if (!current || !["active", "processing"].includes(current.status)) {
      return;
    }

    if (current.endsAt > Date.now()) {
      scheduleGiveaway(current);
    } else {
      void finishGiveaway(current.id);
    }
  }, delay);
  giveawayTimers.set(giveaway.id, timer);
}

async function finishGiveaway(giveawayId) {
  if (finishingGiveaways.has(giveawayId)) {
    return;
  }
  finishingGiveaways.add(giveawayId);

  try {
    let giveaway = getGiveaway(giveawayId);
    if (!giveaway || !["active", "processing"].includes(giveaway.status)) {
      return;
    }
    if (giveaway.endsAt > Date.now()) {
      scheduleGiveaway(giveaway);
      return;
    }

    if (giveaway.status === "active") {
      giveaway = updateGiveaway(giveawayId, {
        status: "processing",
        winners: drawWinners(giveaway.entrants, giveaway.winnerCount),
        dmSentUserIds: []
      });
    }

    const guild = await client.guilds.fetch(giveaway.guildId);
    const channel = await guild.channels.fetch(giveaway.channelId);
    if (!channel?.isTextBased() || !channel.send) {
      throw new Error(`Không tìm thấy kênh kết quả giveaway ${giveaway.channelId}.`);
    }

    if (!giveaway.resultMessageId) {
      const winnerMentions = giveaway.winners.map((userId) => `<@${userId}>`).join(", ");
      const result = await channel.send({
        content: winnerMentions || "Giveaway kết thúc nhưng không có người tham gia.",
        embeds: [
          new EmbedBuilder()
            .setColor(0x2ecc71)
            .setTitle(`Kết quả: ${giveaway.name}`)
            .setDescription(
              giveaway.winners.length
                ? `Chúc mừng ${winnerMentions} đã thắng **${giveaway.prize}**!`
                : "Không có người tham gia nên không có người thắng."
            )
        ],
        allowedMentions: { users: giveaway.winners, parse: [] }
      });
      giveaway = updateGiveaway(giveawayId, { resultMessageId: result.id });
    }

    if (!giveaway.originalMessageUpdated) {
      try {
        const originalMessage = await channel.messages.fetch(giveaway.messageId);
        const completedGiveaway = { ...giveaway, status: "completed" };
        await originalMessage.edit({
          embeds: [giveawayEmbed(completedGiveaway)],
          components: [giveawayControls(giveaway, true)]
        });
        giveaway = updateGiveaway(giveawayId, { originalMessageUpdated: true });
      } catch (error) {
        console.error(`Không cập nhật được panel giveaway ${giveawayId}:`, error);
      }
    }

    const dmSentUserIds = new Set(giveaway.dmSentUserIds || []);
    for (const winnerId of giveaway.winners) {
      if (dmSentUserIds.has(winnerId)) {
        continue;
      }

      try {
        const winner = await client.users.fetch(winnerId);
        await winner.send(
          `Chúc mừng! Bạn đã thắng giveaway **${giveaway.name}** trong server **${guild.name}**. Phần thưởng: **${giveaway.prize}**.`
        );
        dmSentUserIds.add(winnerId);
        giveaway = updateGiveaway(giveawayId, { dmSentUserIds: [...dmSentUserIds] });
      } catch (error) {
        console.error(`Không gửi được DM kết quả giveaway cho người thắng ${winnerId}:`, error);
      }
    }

    updateGiveaway(giveawayId, {
      status: "completed",
      completedAt: new Date().toISOString()
    });
    giveawayTimers.delete(giveawayId);
  } catch (error) {
    console.error(`Không thể hoàn tất giveaway ${giveawayId}; sẽ thử lại:`, error);
    const giveaway = getGiveaway(giveawayId);
    if (giveaway && ["active", "processing"].includes(giveaway.status)) {
      scheduleGiveaway(giveaway, 60000);
    }
  } finally {
    finishingGiveaways.delete(giveawayId);
  }
}

async function closeTicket(channel, closedBy) {
  const ownerId = getTicketOwner(channel);
  if (!ownerId) {
    throw new Error("Kênh này không phải ticket do bot tạo.");
  }
  if (isTicketClosed(channel)) {
    throw new Error("Ticket này đã được đóng.");
  }

  const messages = await channel.messages.fetch({ limit: 100 });
  const transcript = [...messages.values()]
    .sort((left, right) => left.createdTimestamp - right.createdTimestamp)
    .map((message) => {
      const timestamp = new Date(message.createdTimestamp).toISOString();
      const content = message.content || (message.attachments.size ? "[Có tệp đính kèm]" : "[Không có nội dung văn bản]");
      return `[${timestamp}] ${message.author.tag}: ${content}`;
    })
    .join("\n");
  const attachment = new AttachmentBuilder(
    Buffer.from(transcript || "Ticket không có tin nhắn.", "utf8"),
    { name: `${channel.name}-transcript.txt` }
  );

  await channel.permissionOverwrites.edit(ownerId, {
    ViewChannel: false,
    SendMessages: false
  });
  await channel.setName(`closed-${channel.name}`.slice(0, 100));
  await channel.setTopic(`${ticketOwnerPrefix}${ownerId};closed`);
  await channel.send({
    content: `Ticket đã được đóng bởi <@${closedBy}>. Bản ghi tối đa 100 tin nhắn gần nhất:`,
    files: [attachment]
  });
}

async function handleTicketOpen(interaction) {
  const settings = getGuildSettings(interaction.guildId);
  if (!settings.ticketSupportRoleId) {
    await interaction.reply({
      content: "Ticket chưa được cài đặt. Quản trị viên hãy chạy `/ticket setup`.",
      ephemeral: true
    });
    return;
  }

  const existing = interaction.guild.channels.cache.find(
    (channel) => channel.type === ChannelType.GuildText &&
      getTicketOwner(channel) === interaction.user.id &&
      !isTicketClosed(channel)
  );
  if (existing) {
    await interaction.reply({
      content: `Bạn đang có ticket mở: ${existing}`,
      ephemeral: true
    });
    return;
  }

  const channel = await interaction.guild.channels.create({
    name: `ticket-${interaction.user.username}`.toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 90),
    type: ChannelType.GuildText,
    parent: settings.ticketCategoryId || undefined,
    topic: `${ticketOwnerPrefix}${interaction.user.id}`,
    permissionOverwrites: [
      {
        id: interaction.guild.roles.everyone.id,
        deny: [PermissionFlagsBits.ViewChannel]
      },
      {
        id: interaction.user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.AttachFiles
        ]
      },
      {
        id: settings.ticketSupportRoleId,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory
        ]
      },
      {
        id: client.user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.ManageChannels,
          PermissionFlagsBits.AttachFiles
        ]
      }
    ]
  });

  await channel.send({
    content: `<@${interaction.user.id}> <@&${settings.ticketSupportRoleId}>`,
    embeds: [
      new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("Ticket hỗ trợ")
        .setDescription("Hãy mô tả vấn đề của bạn. Nhân viên hỗ trợ sẽ phản hồi sớm nhất có thể.")
    ],
    components: [closeControl()]
  });
  await interaction.reply({ content: `Đã tạo ticket: ${channel}`, ephemeral: true });
}

async function handleTicketClose(interaction) {
  const ownerId = getTicketOwner(interaction.channel);
  const settings = getGuildSettings(interaction.guildId);
  const memberRoles = interaction.member?.roles;
  const isSupport = Boolean(
    settings.ticketSupportRoleId &&
    (Array.isArray(memberRoles)
      ? memberRoles.includes(settings.ticketSupportRoleId)
      : memberRoles?.cache.has(settings.ticketSupportRoleId))
  );
  const canClose = ownerId === interaction.user.id ||
    isSupport ||
    interaction.memberPermissions.has(PermissionFlagsBits.ManageChannels);

  if (!ownerId || !canClose) {
    await interaction.reply({
      content: "Chỉ chủ ticket hoặc nhân viên hỗ trợ mới có thể đóng ticket này.",
      ephemeral: true
    });
    return;
  }

  await interaction.deferReply();
  await closeTicket(interaction.channel, interaction.user.id);
  await interaction.editReply("Đã đóng ticket và lưu bản ghi hội thoại.");
}

async function handleTicketCommand(interaction) {
  const subcommand = interaction.options.getSubcommand();
  if (subcommand === "setup") {
    if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.reply({ content: "Bạn cần quyền Quản lý máy chủ.", ephemeral: true });
      return;
    }

    const channel = interaction.options.getChannel("kenh", true);
    const supportRole = interaction.options.getRole("role-ho-tro", true);
    const category = interaction.options.getChannel("danh-muc");

    updateGuildSettings(interaction.guildId, {
      ticketSupportRoleId: supportRole.id,
      ticketCategoryId: category?.id ?? null
    });

    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle("Trung tâm hỗ trợ")
          .setDescription("Nhấn nút bên dưới để tạo một kênh ticket riêng tư với đội ngũ hỗ trợ.")
      ],
      components: [ticketControls()]
    });
    await interaction.reply({ content: `Đã cài đặt panel ticket tại ${channel}.`, ephemeral: true });
    return;
  }

  if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageChannels)) {
    await interaction.reply({ content: "Bạn cần quyền Quản lý kênh để đóng ticket.", ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  await closeTicket(interaction.channel, interaction.user.id);
  await interaction.editReply("Đã đóng ticket và lưu bản ghi hội thoại.");
}

function parseDateTime(value, label) {
  if (!/T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) {
    throw new Error(`Thời gian ${label} cần có múi giờ, ví dụ 2026-12-01T19:00:00+07:00.`);
  }

  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new Error(`Thời gian ${label} không hợp lệ. Hãy dùng định dạng ISO 8601 có múi giờ.`);
  }
  return date;
}

async function handleEventCommand(interaction) {
  const subcommand = interaction.options.getSubcommand();
  if (subcommand === "giveaway") {
    if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageEvents)) {
      await interaction.reply({ content: "Bạn cần quyền Quản lý sự kiện.", ephemeral: true });
      return;
    }

    await interaction.deferReply({ ephemeral: true });
    const giveaway = {
      id: randomUUID(),
      guildId: interaction.guildId,
      channelId: interaction.options.getChannel("kenh", true).id,
      name: interaction.options.getString("ten", true),
      prize: interaction.options.getString("phan-thuong", true),
      winnerCount: interaction.options.getInteger("so-nguoi-thang", true),
      endsAt: Date.now() + interaction.options.getInteger("so-ngay", true) * 24 * 60 * 60 * 1000,
      createdBy: interaction.user.id,
      createdAt: new Date().toISOString(),
      status: "creating",
      entrants: [],
      winners: [],
      dmSentUserIds: []
    };

    createGiveaway(giveaway);
    try {
      const channel = interaction.options.getChannel("kenh", true);
      const message = await channel.send({
        embeds: [giveawayEmbed(giveaway)],
        components: [giveawayControls(giveaway)],
        allowedMentions: { parse: [] }
      });
      const activeGiveaway = updateGiveaway(giveaway.id, {
        messageId: message.id,
        status: "active"
      });
      scheduleGiveaway(activeGiveaway);
      await interaction.editReply(
        `Đã tạo giveaway **${giveaway.name}** tại ${channel}. Kết thúc <t:${Math.floor(giveaway.endsAt / 1000)}:F>.`
      );
    } catch (error) {
      updateGiveaway(giveaway.id, { status: "failed" });
      throw error;
    }
    return;
  }

  if (subcommand === "create") {
    if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageEvents)) {
      await interaction.reply({ content: "Bạn cần quyền Quản lý sự kiện.", ephemeral: true });
      return;
    }

    const start = parseDateTime(interaction.options.getString("bat-dau", true), "bắt đầu");
    const end = parseDateTime(interaction.options.getString("ket-thuc", true), "kết thúc");
    if (start <= new Date() || end <= start) {
      await interaction.reply({
        content: "Giờ bắt đầu phải ở tương lai và giờ kết thúc phải sau giờ bắt đầu.",
        ephemeral: true
      });
      return;
    }

    await interaction.deferReply();
    const event = await interaction.guild.scheduledEvents.create({
      name: interaction.options.getString("ten", true),
      description: interaction.options.getString("mo-ta"),
      scheduledStartTime: start,
      scheduledEndTime: end,
      privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
      entityType: GuildScheduledEventEntityType.External,
      entityMetadata: { location: interaction.options.getString("dia-diem", true) }
    });
    await interaction.editReply(`Đã tạo sự kiện **${event.name}**. ID: \`${event.id}\`\n${event.url}`);
    return;
  }

  if (subcommand === "list") {
    const events = await interaction.guild.scheduledEvents.fetch();
    const upcoming = [...events.values()]
      .filter((event) => event.scheduledStartTimestamp > Date.now())
      .sort((left, right) => left.scheduledStartTimestamp - right.scheduledStartTimestamp)
      .slice(0, 10);
    const embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle("Sự kiện sắp diễn ra")
      .setDescription(
        upcoming.length
          ? upcoming.map((event) =>
            `**${event.name}**\nBắt đầu: <t:${Math.floor(event.scheduledStartTimestamp / 1000)}:F>\nID: \`${event.id}\``
          ).join("\n\n")
          : "Hiện không có sự kiện sắp diễn ra."
      );
    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageEvents)) {
    await interaction.reply({ content: "Bạn cần quyền Quản lý sự kiện.", ephemeral: true });
    return;
  }

  const eventId = interaction.options.getString("id", true);
  const events = await interaction.guild.scheduledEvents.fetch();
  const event = events.get(eventId);
  if (!event) {
    await interaction.reply({ content: "Không tìm thấy sự kiện với ID đó.", ephemeral: true });
    return;
  }

  await event.delete();
  await interaction.reply({ content: `Đã hủy sự kiện **${event.name}**.`, ephemeral: true });
}

async function handleGiveawayButton(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const giveawayId = interaction.customId.slice("giveaway:join:".length);
  let giveaway = getGiveaway(giveawayId);

  if (!giveaway || giveaway.guildId !== interaction.guildId) {
    await interaction.editReply("Không tìm thấy giveaway này.");
    return;
  }
  if (giveaway.status !== "active" || giveaway.endsAt <= Date.now()) {
    if (giveaway.status === "active" || giveaway.status === "processing") {
      await finishGiveaway(giveawayId);
    }
    await interaction.editReply("Giveaway đã kết thúc.");
    return;
  }

  const entrants = new Set(giveaway.entrants);
  const wasEntered = entrants.has(interaction.user.id);
  if (wasEntered) {
    entrants.delete(interaction.user.id);
  } else {
    entrants.add(interaction.user.id);
  }

  giveaway = updateGiveaway(giveawayId, { entrants: [...entrants] });
  await interaction.message.edit({
    embeds: [giveawayEmbed(giveaway)],
    components: [giveawayControls(giveaway)]
  });
  await interaction.editReply(
    wasEntered
      ? "Bạn đã rút khỏi giveaway."
      : `Bạn đã tham gia giveaway **${giveaway.name}**!`
  );
}

async function handleWelcomeCommand(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({ content: "Bạn cần quyền Quản lý máy chủ.", ephemeral: true });
    return;
  }

  const subcommand = interaction.options.getSubcommand();
  if (subcommand === "setup-welcome") {
    const channel = interaction.options.getChannel("kenh", true);
    updateGuildSettings(interaction.guildId, {
      welcomeChannelId: channel.id,
      welcomeMessage: interaction.options.getString("tin-nhan") || defaultWelcomeMessage
    });
    await interaction.reply({
      content: `Đã cài đặt thông báo welcome tại ${channel}. Thành viên mới cũng sẽ nhận DM riêng.`,
      ephemeral: true
    });
    return;
  }

  if (subcommand === "setup-leave") {
    const channel = interaction.options.getChannel("kenh", true);
    updateGuildSettings(interaction.guildId, {
      leaveChannelId: channel.id,
      leaveMessage: interaction.options.getString("tin-nhan") || defaultLeaveMessage
    });
    await interaction.reply({
      content: `Đã cài đặt thông báo thành viên rời server tại ${channel}.`,
      ephemeral: true
    });
    return;
  }

  if (subcommand === "setup-dm") {
    updateGuildSettings(interaction.guildId, {
      dmWelcomeEnabled: true,
      dmWelcomeMessage: interaction.options.getString("tin-nhan", true)
    });
    await interaction.reply({ content: "Đã cập nhật nội dung DM welcome.", ephemeral: true });
    return;
  }

  const type = interaction.options.getString("loai", true);
  const settingKey = {
    welcome: "welcomeChannelId",
    leave: "leaveChannelId",
    dm: "dmWelcomeEnabled"
  }[type];
  updateGuildSettings(interaction.guildId, {
    [settingKey]: type === "dm" ? false : null
  });
  await interaction.reply({ content: "Đã tắt thông báo đã chọn.", ephemeral: true });
}

async function handleVerifyCommand(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({ content: "Bạn cần quyền Quản lý máy chủ.", ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  if (interaction.options.getSubcommand() === "disable") {
    updateGuildSettings(interaction.guildId, { verifyRoleId: null });
    await interaction.editReply("Đã tắt hệ thống xác minh.");
    return;
  }

  const channel = interaction.options.getChannel("kenh", true);
  const role = interaction.options.getRole("role", true);
  const botMember = await interaction.guild.members.fetchMe();

  if (role.id === interaction.guild.roles.everyone.id) {
    await interaction.editReply("Không thể dùng @everyone làm role xác minh.");
    return;
  }
  if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
    await interaction.editReply("Bot cần quyền Quản lý vai trò để cấp role xác minh.");
    return;
  }
  if (role.position >= botMember.roles.highest.position) {
    await interaction.editReply("Hãy kéo role bot lên cao hơn role xác minh trong cài đặt vai trò server.");
    return;
  }

  updateGuildSettings(interaction.guildId, { verifyRoleId: role.id });
  await channel.send({
    embeds: [
      new EmbedBuilder()
        .setColor(0xe74c3c)
        .setTitle("Xác minh thành viên")
        .setDescription("Nhấn nút bên dưới để xác minh và nhận role thành viên.")
    ],
    components: [verifyControl()]
  });
  await interaction.editReply(`Đã đăng panel xác minh tại ${channel}.`);
}

async function handleAnnouncementCommand(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({ content: "Bạn cần quyền Quản lý máy chủ.", ephemeral: true });
    return;
  }

  const channel = interaction.options.getChannel("kenh", true);
  const message = interaction.options.getString("noi-dung", true);
  await interaction.deferReply({ ephemeral: true });
  await channel.send({ content: message, allowedMentions: { parse: [] } });
  await interaction.editReply(`Đã gửi thông báo tại ${channel}.`);
}

async function handleAccessCommand(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({ content: "Bạn cần quyền Quản lý máy chủ để quản lý danh sách ID.", ephemeral: true });
    return;
  }

  const settings = getGuildSettings(interaction.guildId);
  const subcommand = interaction.options.getSubcommand();
  if (subcommand === "list") {
    const allowedUserIds = Array.isArray(settings.allowedUserIds) ? settings.allowedUserIds : [];
    const blockedUserIds = Array.isArray(settings.blockedUserIds) ? settings.blockedUserIds : [];
    const formatIds = (ids) => {
      if (ids.length === 0) {
        return "Trống";
      }

      const visibleIds = ids.slice(0, 25).map((id) => `\`${id}\``).join(", ");
      return ids.length > 25 ? `${visibleIds}, … và ${ids.length - 25} ID khác` : visibleIds;
    };

    await interaction.reply({
      content: `**Được phép (${allowedUserIds.length}):** ${formatIds(allowedUserIds)}\n**Bị chặn (${blockedUserIds.length}):** ${formatIds(blockedUserIds)}\nKhi allowlist có ID, chỉ ID trong đó được dùng; blocklist luôn ưu tiên.`,
      ephemeral: true
    });
    return;
  }

  const user = interaction.options.getUser("nguoi-dung", true);
  if (subcommand === "remove") {
    updateGuildSettings(interaction.guildId, {
      allowedUserIds: (Array.isArray(settings.allowedUserIds) ? settings.allowedUserIds : [])
        .filter((id) => id !== user.id),
      blockedUserIds: (Array.isArray(settings.blockedUserIds) ? settings.blockedUserIds : [])
        .filter((id) => id !== user.id)
    });
    await interaction.reply({ content: `Đã gỡ ID của ${user} khỏi cả hai danh sách.`, ephemeral: true });
    return;
  }

  const listKey = subcommand === "allow" ? "allowedUserIds" : "blockedUserIds";
  const userIds = Array.isArray(settings[listKey]) ? settings[listKey] : [];
  updateGuildSettings(interaction.guildId, {
    [listKey]: userIds.includes(user.id) ? userIds : [...userIds, user.id]
  });

  if (subcommand === "allow" && settings.blockedUserIds?.includes(user.id)) {
    await interaction.reply({
      content: `Đã thêm ${user} vào allowlist, nhưng ID vẫn bị block. Dùng \`/access remove\` để gỡ khỏi cả hai danh sách.`,
      ephemeral: true
    });
    return;
  }

  const listName = subcommand === "allow" ? "allowlist" : "blocklist";
  await interaction.reply({ content: `Đã thêm ${user} vào ${listName}.`, ephemeral: true });
}

async function handleModerationCommand(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({ content: "Bạn cần quyền Quản lý máy chủ.", ephemeral: true });
    return;
  }

  const subcommand = interaction.options.getSubcommand();
  if (subcommand === "links") {
    const enabled = interaction.options.getString("action", true) === "enable";
    updateGuildSettings(interaction.guildId, { linkDeletionEnabled: enabled });
    await interaction.reply({
      content: enabled ? "Đã bật tự động xóa link trong các kênh server." : "Đã tắt tự động xóa link.",
      ephemeral: true
    });
    return;
  }

  if (subcommand === "disable-raid") {
    updateGuildSettings(interaction.guildId, { antiRaidEnabled: false });
    await interaction.reply({ content: "Đã tắt cảnh báo anti-raid.", ephemeral: true });
    return;
  }

  const settings = getGuildSettings(interaction.guildId);
  const channel = interaction.options.getChannel("kenh", true);
  const threshold = interaction.options.getInteger("so-nguoi");
  const windowSeconds = interaction.options.getInteger("so-giay");
  const nextThreshold = threshold ?? settings.raidThreshold ?? 5;
  const nextWindowSeconds = windowSeconds ?? settings.raidWindowSeconds ?? 30;

  updateGuildSettings(interaction.guildId, {
    antiRaidEnabled: true,
    raidAlertChannelId: channel.id,
    raidThreshold: nextThreshold,
    raidWindowSeconds: nextWindowSeconds
  });
  await interaction.reply({
    content: `Đã bật cảnh báo raid tại ${channel}: ${nextThreshold} lượt vào trong ${nextWindowSeconds} giây. Bot chỉ cảnh báo, không tự kick/ban/khóa chat.`,
    ephemeral: true
  });
}

async function handleDirectMessageCommand(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({ content: "Bạn cần quyền Quản lý máy chủ.", ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  const user = interaction.options.getUser("nguoi-dung", true);
  let member;
  try {
    member = await interaction.guild.members.fetch(user.id);
  } catch (error) {
    if (error.code === 10007) {
      await interaction.editReply("Người nhận phải là thành viên của server này.");
      return;
    }
    throw error;
  }

  const content = interaction.options.getString("tin-nhan", true);
  await member.send({ content, allowedMentions: { parse: [] } });
  await interaction.editReply(`Đã gửi DM cho ${user}.`);
}

function renderGreeting(template, member) {
  const values = {
    mention: `<@${member.id}>`,
    user: member.user.username,
    display_name: member.displayName,
    server: member.guild.name,
    member_count: String(member.guild.memberCount)
  };

  return template.replace(/\{(mention|user|display_name|server|member_count)\}/g, (_, key) => values[key]);
}

async function sendMemberAnnouncement(member, channelId, template) {
  const channel = await member.guild.channels.fetch(channelId);
  if (!channel?.isTextBased() || !channel.send) {
    throw new Error(`Kênh thông báo ${channelId} không tồn tại hoặc không phải kênh văn bản.`);
  }

  const avatar = member.user.displayAvatarURL({ size: 256 });
  const embed = new EmbedBuilder()
    .setColor(0x57f287)
    .setAuthor({ name: member.user.tag, iconURL: avatar })
    .setDescription(renderGreeting(template, member))
    .setThumbnail(avatar)
    .setImage("attachment://welcome-banner.png")
    .setFooter({ text: member.guild.name });

  await channel.send({
    content: `<@${member.id}>`,
    embeds: [embed],
    files: [new AttachmentBuilder(path.join(__dirname, "..", "assets", "welcome-banner.png"))],
    allowedMentions: { users: [member.id], parse: [] }
  });
}

async function handleMemberJoin(member) {
  const settings = getGuildSettings(member.guild.id);
  if (settings.welcomeChannelId) {
    try {
      await sendMemberAnnouncement(
        member,
        settings.welcomeChannelId,
        settings.welcomeMessage || defaultWelcomeMessage
      );
    } catch (error) {
      console.error(`Không gửi được welcome trong server ${member.guild.id}:`, error);
    }
  }

  if (!member.user.bot && settings.dmWelcomeEnabled !== false) {
    try {
      await member.send({
        content: renderGreeting(settings.dmWelcomeMessage || defaultDirectMessage, member),
        allowedMentions: { users: [member.id], parse: [] }
      });
    } catch (error) {
      console.error(`Không gửi được welcome DM cho thành viên ${member.id}:`, error);
    }
  }
}

async function handleMemberLeave(member) {
  try {
    for (const giveaway of getGiveaways()) {
      if (giveaway.guildId === member.guild.id &&
        giveaway.status === "active" &&
        giveaway.entrants.includes(member.id)) {
        updateGiveaway(giveaway.id, {
          entrants: giveaway.entrants.filter((userId) => userId !== member.id)
        });
      }
    }
  } catch (error) {
    console.error(`Không gỡ được người rời server khỏi giveaway ${member.guild.id}:`, error);
  }

  const settings = getGuildSettings(member.guild.id);
  if (settings.leaveChannelId) {
    await sendMemberAnnouncement(
      member,
      settings.leaveChannelId,
      settings.leaveMessage || defaultLeaveMessage
    );
  }
}

async function handleRaidJoin(member) {
  const settings = getGuildSettings(member.guild.id);
  if (settings.antiRaidEnabled !== true) {
    return;
  }

  const threshold = Number.isInteger(settings.raidThreshold) ? settings.raidThreshold : 5;
  const windowSeconds = Number.isInteger(settings.raidWindowSeconds) ? settings.raidWindowSeconds : 30;
  const now = Date.now();
  const recentJoins = getRecentJoinTimes(
    raidJoinTimesByGuild.get(member.guild.id) || [],
    now,
    windowSeconds * 1000
  );
  recentJoins.push(now);
  raidJoinTimesByGuild.set(member.guild.id, recentJoins);

  if (recentJoins.length < threshold) {
    return;
  }
  const lastAlertAt = lastRaidAlertAtByGuild.get(member.guild.id) || 0;
  if (now - lastAlertAt < windowSeconds * 1000) {
    return;
  }
  lastRaidAlertAtByGuild.set(member.guild.id, now);

  const channel = await member.guild.channels.fetch(settings.raidAlertChannelId);
  if (!channel?.isTextBased() || !channel.send) {
    console.warn(`Không có kênh cảnh báo anti-raid cho server ${member.guild.id}; hãy chạy /moderation setup-raid.`);
    return;
  }

  await channel.send({
    content: `⚠️ Phát hiện ${recentJoins.length} lượt thành viên vào trong ${windowSeconds} giây. Hãy kiểm tra server; bot chỉ cảnh báo, không tự kick/ban/khóa chat.`,
    allowedMentions: { parse: [] }
  });
}

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    const canManageAccess = interaction.isChatInputCommand() &&
      interaction.commandName === "access" &&
      interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
    if (interaction.guildId && !canManageAccess &&
      !canUseBot(getGuildSettings(interaction.guildId), interaction.user.id)) {
      await interaction.reply({
        content: "Bạn không có quyền sử dụng bot ở server này.",
        ephemeral: true
      });
      return;
    }

    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === "ticket") {
        await handleTicketCommand(interaction);
      } else if (interaction.commandName === "event") {
        await handleEventCommand(interaction);
      } else if (interaction.commandName === "welcome") {
        await handleWelcomeCommand(interaction);
      } else if (interaction.commandName === "verify") {
        await handleVerifyCommand(interaction);
      } else if (interaction.commandName === "announce") {
        await handleAnnouncementCommand(interaction);
      } else if (interaction.commandName === "access") {
        await handleAccessCommand(interaction);
      } else if (interaction.commandName === "moderation") {
        await handleModerationCommand(interaction);
      } else if (interaction.commandName === "dm") {
        await handleDirectMessageCommand(interaction);
      }
      return;
    }

    if (!interaction.isButton()) {
      return;
    }

    if (interaction.customId === "ticket:open") {
      await handleTicketOpen(interaction);
    } else if (interaction.customId === "ticket:close") {
      await handleTicketClose(interaction);
    } else if (interaction.customId.startsWith("giveaway:join:")) {
      await handleGiveawayButton(interaction);
    } else if (interaction.customId === "verify:claim") {
      const settings = getGuildSettings(interaction.guildId);
      if (!settings.verifyRoleId) {
        await interaction.reply({
          content: "Hệ thống xác minh chưa được cài đặt.",
          ephemeral: true
        });
        return;
      }

      await interaction.deferReply({ ephemeral: true });
      const member = await interaction.guild.members.fetch(interaction.user.id);
      if (member.roles.cache.has(settings.verifyRoleId)) {
        await interaction.editReply("Bạn đã xác minh rồi.");
        return;
      }

      await member.roles.add(settings.verifyRoleId, "Completed server verification");
      await interaction.editReply("Xác minh thành công! Bạn đã nhận role.");
    }
  } catch (error) {
    console.error("Không xử lý được Discord interaction:", error);
    const response = {
      content: "Đã xảy ra lỗi khi xử lý thao tác. Hãy kiểm tra quyền bot và thử lại."
    };

    if (interaction.isRepliable()) {
      if (interaction.deferred) {
        await interaction.editReply(response).catch((replyError) => {
          console.error("Không gửi được thông báo lỗi interaction:", replyError);
        });
      } else if (!interaction.replied) {
        await interaction.reply({ ...response, ephemeral: true }).catch((replyError) => {
          console.error("Không gửi được thông báo lỗi interaction:", replyError);
        });
      }
    }
  }
});

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot || !message.guild) {
    return;
  }

  const settings = getGuildSettings(message.guild.id);
  if (settings.linkDeletionEnabled !== false && containsLink(message.content)) {
    try {
      await message.delete();
    } catch (error) {
      console.error(`Không xóa được tin nhắn có link trong server ${message.guild.id}:`, error);
    }
    return;
  }

  if (message.content.trim().toLowerCase() !== "hi" ||
    !canUseBot(settings, message.author.id)) {
    return;
  }

  try {
    await message.reply({
      content: "Y LOH",
      allowedMentions: { repliedUser: false }
    });
  } catch (error) {
    console.error(`Không trả lời được lời chào trong server ${message.guild.id}:`, error);
  }
});

client.on(Events.GuildMemberAdd, (member) => {
  void handleMemberJoin(member).catch((error) => {
    console.error(`Không xử lý được thành viên mới trong server ${member.guild.id}:`, error);
  });
  void handleRaidJoin(member).catch((error) => {
    console.error(`Không xử lý được kiểm tra anti-raid trong server ${member.guild.id}:`, error);
  });
});

client.on(Events.GuildMemberRemove, (member) => {
  void handleMemberLeave(member).catch((error) => {
    console.error(`Không gửi được thông báo rời server ${member.guild.id}:`, error);
  });
});

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Đã đăng nhập bot: ${readyClient.user.tag}`);
  try {
    for (const giveaway of getGiveaways()) {
      scheduleGiveaway(giveaway);
    }
  } catch (error) {
    console.error("Không khôi phục được lịch kết thúc giveaway:", error);
  }
});

client.on(Events.Error, (error) => {
  console.error("Discord client error:", error);
});

process.on("unhandledRejection", (error) => {
  console.error("Unhandled promise rejection:", error);
});

if (!process.env.DISCORD_TOKEN) {
  throw new Error("Thiếu DISCORD_TOKEN. Hãy tạo file .env dựa trên .env.example.");
}

client.login(process.env.DISCORD_TOKEN).catch((error) => {
  console.error("Không đăng nhập được Discord:", error);
  process.exitCode = 1;
});
