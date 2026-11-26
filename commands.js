const {
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder
} = require("discord.js");

const commands = [
  new SlashCommandBuilder()
    .setName("ticket")
    .setDescription("Cài đặt và quản lý hệ thống ticket")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("setup")
        .setDescription("Tạo panel mở ticket")
        .addChannelOption((option) =>
          option
            .setName("kenh")
            .setDescription("Kênh đăng panel ticket")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
        .addRoleOption((option) =>
          option
            .setName("role-ho-tro")
            .setDescription("Role được xem và hỗ trợ ticket")
            .setRequired(true)
        )
        .addChannelOption((option) =>
          option
            .setName("danh-muc")
            .setDescription("Danh mục chứa các ticket (không bắt buộc)")
            .addChannelTypes(ChannelType.GuildCategory)
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("close").setDescription("Đóng ticket hiện tại")
    ),
  new SlashCommandBuilder()
    .setName("event")
    .setDescription("Tạo và quản lý Discord Events")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("create")
        .setDescription("Tạo sự kiện bên ngoài trên Discord")
        .addStringOption((option) =>
          option
            .setName("ten")
            .setDescription("Tên sự kiện")
            .setMaxLength(100)
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("bat-dau")
            .setDescription("Thời gian ISO 8601, ví dụ 2026-12-01T19:00:00+07:00")
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("ket-thuc")
            .setDescription("Thời gian ISO 8601, phải sau giờ bắt đầu")
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("dia-diem")
            .setDescription("Địa điểm hoặc link tham gia")
            .setMaxLength(100)
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("mo-ta")
            .setDescription("Mô tả sự kiện (không bắt buộc)")
            .setMaxLength(1000)
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("giveaway")
        .setDescription("Tạo giveaway có thời hạn và bốc thăm người thắng")
        .addStringOption((option) =>
          option
            .setName("ten")
            .setDescription("Tên giveaway")
            .setMaxLength(100)
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("phan-thuong")
            .setDescription("Phần thưởng của giveaway")
            .setMaxLength(500)
            .setRequired(true)
        )
        .addIntegerOption((option) =>
          option
            .setName("so-ngay")
            .setDescription("Số ngày giveaway diễn ra")
            .setMinValue(1)
            .setMaxValue(365)
            .setRequired(true)
        )
        .addIntegerOption((option) =>
          option
            .setName("so-nguoi-thang")
            .setDescription("Số người thắng được bốc thăm")
            .setMinValue(1)
            .setMaxValue(100)
            .setRequired(true)
        )
        .addChannelOption((option) =>
          option
            .setName("kenh")
            .setDescription("Kênh đăng giveaway và kết quả")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("list").setDescription("Xem các sự kiện sắp diễn ra")
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("cancel")
        .setDescription("Hủy một sự kiện")
        .addStringOption((option) =>
          option
            .setName("id")
            .setDescription("ID sự kiện (lấy bằng /event list)")
            .setRequired(true)
        )
    ),
  new SlashCommandBuilder()
    .setName("welcome")
    .setDescription("Cài đặt thông báo thành viên vào/rời server")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("setup-welcome")
        .setDescription("Chọn kênh và nội dung chào thành viên mới")
        .addChannelOption((option) =>
          option
            .setName("kenh")
            .setDescription("Kênh đăng thông báo welcome")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("tin-nhan")
            .setDescription("Có thể dùng {mention}, {user}, {display_name}, {server}, {member_count}")
            .setMaxLength(1000)
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("setup-leave")
        .setDescription("Chọn kênh và nội dung thông báo thành viên rời server")
        .addChannelOption((option) =>
          option
            .setName("kenh")
            .setDescription("Kênh đăng thông báo leave")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("tin-nhan")
            .setDescription("Có thể dùng {mention}, {user}, {display_name}, {server}, {member_count}")
            .setMaxLength(1000)
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("setup-dm")
        .setDescription("Tùy chỉnh tin nhắn riêng tự gửi khi người dùng vào server")
        .addStringOption((option) =>
          option
            .setName("tin-nhan")
            .setDescription("Nội dung tin nhắn riêng gửi cho thành viên mới")
            .setMaxLength(1000)
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("disable")
        .setDescription("Tắt một loại thông báo")
        .addStringOption((option) =>
          option
            .setName("loai")
            .setDescription("Chọn thông báo cần tắt")
            .addChoices(
              { name: "Welcome trong kênh", value: "welcome" },
              { name: "Leave trong kênh", value: "leave" },
              { name: "Tin nhắn riêng welcome", value: "dm" }
            )
            .setRequired(true)
        )
    ),
  new SlashCommandBuilder()
    .setName("verify")
    .setDescription("Cài đặt nút xác minh để nhận role")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("setup")
        .setDescription("Đăng panel xác minh trong một kênh")
        .addChannelOption((option) =>
          option
            .setName("kenh")
            .setDescription("Kênh đăng panel xác minh")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
        .addRoleOption((option) =>
          option
            .setName("role")
            .setDescription("Role cấp cho người nhấn nút xác minh")
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("disable").setDescription("Tắt nút xác minh")
    ),
  new SlashCommandBuilder()
    .setName("announce")
    .setDescription("Gửi thông báo vào một kênh")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("send")
        .setDescription("Viết và gửi thông báo vào kênh")
        .addChannelOption((option) =>
          option
            .setName("kenh")
            .setDescription("Kênh nhận thông báo")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("noi-dung")
            .setDescription("Nội dung thông báo")
            .setMaxLength(2000)
            .setRequired(true)
        )
    ),
  new SlashCommandBuilder()
    .setName("access")
    .setDescription("Quản lý ID được phép hoặc bị chặn dùng bot")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("allow")
        .setDescription("Cho phép một ID sử dụng bot")
        .addUserOption((option) =>
          option
            .setName("nguoi-dung")
            .setDescription("Người dùng cần thêm vào allowlist")
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("deny")
        .setDescription("Chặn một ID sử dụng bot")
        .addUserOption((option) =>
          option
            .setName("nguoi-dung")
            .setDescription("Người dùng cần thêm vào blocklist")
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("remove")
        .setDescription("Gỡ một ID khỏi cả hai danh sách")
        .addUserOption((option) =>
          option
            .setName("nguoi-dung")
            .setDescription("Người dùng cần gỡ")
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("list").setDescription("Xem allowlist và blocklist của server")
    ),
  new SlashCommandBuilder()
    .setName("moderation")
    .setDescription("Cài đặt xóa link và cảnh báo anti-raid")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("links")
        .setDescription("Bật hoặc tắt tự động xóa tin nhắn có link")
        .addStringOption((option) =>
          option
            .setName("action")
            .setDescription("Chọn trạng thái tự động xóa link")
            .addChoices(
              { name: "Bật xóa link", value: "enable" },
              { name: "Tắt xóa link", value: "disable" }
            )
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("setup-raid")
        .setDescription("Đặt ngưỡng join để bot cảnh báo raid")
        .addChannelOption((option) =>
          option
            .setName("kenh")
            .setDescription("Kênh nhận cảnh báo anti-raid")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true)
        )
        .addIntegerOption((option) =>
          option
            .setName("so-nguoi")
            .setDescription("Số lượt vào để kích hoạt cảnh báo (mặc định 5)")
            .setMinValue(2)
            .setMaxValue(50)
            .setRequired(false)
        )
        .addIntegerOption((option) =>
          option
            .setName("so-giay")
            .setDescription("Khoảng thời gian tính lượt vào, giây (mặc định 30)")
            .setMinValue(5)
            .setMaxValue(300)
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("disable-raid").setDescription("Tắt cảnh báo anti-raid")
    ),
  new SlashCommandBuilder()
    .setName("dm")
    .setDescription("Gửi tin nhắn riêng cho một thành viên server")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("send")
        .setDescription("Gửi một DM đến thành viên đã chọn")
        .addUserOption((option) =>
          option
            .setName("nguoi-dung")
            .setDescription("Người nhận tin nhắn riêng")
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("tin-nhan")
            .setDescription("Nội dung tin nhắn")
            .setMaxLength(2000)
            .setRequired(true)
        )
    )
];

for (const command of commands) {
  command.setDMPermission(false);
}

const commandJson = commands.map((command) => command.toJSON());

module.exports = { commandJson };
