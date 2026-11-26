# Discord Ticket & Event Bot

Bot Discord viết bằng Node.js và discord.js, tập trung vào ticket hỗ trợ riêng tư và Discord Events.

## Yêu cầu

- Node.js 20.11 trở lên
- Ứng dụng bot trên Discord Developer Portal
- Bot được mời vào server với quyền quản lý kênh, xem/gửi tin nhắn và quản lý sự kiện

Trong Discord Developer Portal > Bot, bật:

- **Message Content Intent** để transcript ticket có nội dung tin nhắn.
- **Server Members Intent** để nhận biết thành viên vào/rời server, gửi welcome và DM.

Khi tạo invite, chọn scope `bot` và `applications.commands`. Cấp tối thiểu các quyền:

- View Channels, Send Messages, Read Message History, Attach Files
- Manage Channels (ticket)
- Manage Events (sự kiện)
- Manage Messages (xóa link)
- Send Messages và Embed Links trong các kênh welcome/leave
- Manage Roles, với role bot nằm cao hơn role xác minh

## Cài đặt

1. Tạo ứng dụng và bot tại <https://discord.com/developers/applications>, rồi sao chép token.
2. Tạo file `.env`; điền `DISCORD_TOKEN` và `DISCORD_CLIENT_ID`. Có thể thêm `DISCORD_GUILD_ID` để đăng ký lệnh thử nghiệm trong một server.
3. Có thể điền `DISCORD_GUILD_ID` để cập nhật lệnh nhanh trong một server thử nghiệm. Để trống để đăng ký lệnh toàn cục.
4. Chạy:

   ```sh
   npm install
   npm run deploy
   npm start
   ```

Không chia sẻ file `.env` hoặc bot token. Nếu token bị lộ, hãy reset token trong Developer Portal.

## Chạy bot trên Render

1. Đưa mã nguồn lên một GitHub repository riêng. Không upload `.env`, token hoặc thư mục `data`.
2. Trong Render Dashboard, chọn **New > Background Worker** và kết nối repository. Đây là bot chạy liên tục, không cần Web Service hay port.
3. Chọn runtime **Node**, đặt:
   - Build Command: `npm ci`
   - Start Command: `npm start`
4. Trong **Environment**, thêm `DISCORD_TOKEN` và `DISCORD_CLIENT_ID`. `DISCORD_GUILD_ID` chỉ cần khi muốn đăng ký lệnh cho một server thử nghiệm.
5. Để giữ cấu hình server và giveaway qua các lần deploy/restart, gắn **Persistent Disk** vào worker với mount path `/var/data`, rồi đặt `DATA_DIR=/var/data`. Render dùng filesystem tạm nếu không có disk; dữ liệu bot sẽ mất khi service restart/redeploy. Persistent Disk cần loại service/plan Render hỗ trợ disk.
6. Chỉ chạy một instance của worker vì dữ liệu và lịch giveaway dùng file cục bộ.

Slash commands hiện đã được đăng ký cho server đã cấu hình. Nếu sau này thay đổi định nghĩa lệnh, chạy `npm run deploy` một lần với cùng token và application ID. Bật **Message Content Intent** và **Server Members Intent** trong Discord Developer Portal như hướng dẫn ở trên.

## Lệnh

### Ticket

- `/ticket setup kenh:#support role-ho-tro:@Staff danh-muc:#Tickets` tạo panel và lưu cấu hình cho server.
- Người dùng nhấn **Mở ticket** để tạo kênh chỉ họ và role hỗ trợ xem được.
- Chủ ticket hoặc nhân viên hỗ trợ nhấn **Đóng ticket**. Bot khóa quyền xem của chủ ticket, đổi tên kênh và gửi bản ghi 100 tin nhắn gần nhất.
- `/ticket close` đóng ticket hiện tại (yêu cầu quyền Quản lý kênh).

### Sự kiện

- `/event create` tạo Discord Scheduled Event dạng địa điểm/link bên ngoài. Thời gian cần ở định dạng ISO 8601, có múi giờ, ví dụ `2026-12-01T19:00:00+07:00`.
- `/event list` liệt kê tối đa 10 sự kiện sắp diễn ra.
- `/event cancel id:<event-id>` hủy sự kiện.
- `/event giveaway ten:<tên> phan-thuong:<giải> so-ngay:<1-365> so-nguoi-thang:<1-100> kenh:#event` tạo giveaway riêng, không thay thế Discord Scheduled Event.

Giveaway có nút tham gia; nhấn lại để rút. Khi hết số ngày đã chọn, bot bốc thăm ngẫu nhiên tối đa số người thắng từ người còn trong server, đăng kết quả vào cùng kênh và DM từng người thắng. Lịch giveaway được lưu và tiếp tục sau khi bot khởi động lại. Cần quyền **Quản lý sự kiện** để tạo/hủy event; kết quả giveaway gửi DM tùy thuộc người thắng có mở DM hay không.

Các lệnh tạo/hủy Discord Scheduled Event cần quyền **Quản lý sự kiện**. Discord hiển thị tính năng quan tâm/tham gia bằng Scheduled Events gốc.

### Welcome và leave

Các lệnh sau cần quyền **Quản lý máy chủ**:

- `/welcome setup-welcome kenh:#welcome [tin-nhan]` chọn kênh và nội dung chào. Embed có avatar, tên và mention thành viên; bot cũng tự gửi DM welcome cho thành viên mới.
- `/welcome setup-leave kenh:#goodbye [tin-nhan]` chọn kênh và nội dung khi thành viên rời server.
- `/welcome setup-dm tin-nhan` đổi nội dung DM chào mừng.
- `/welcome disable loai:welcome|leave|dm` tắt từng loại thông báo.

Trong nội dung có thể dùng `{mention}`, `{user}`, `{display_name}`, `{server}`, `{member_count}`. Thông báo welcome và leave hiển thị avatar thành viên cùng banner `assets/welcome-banner.png`. Bot gửi thông báo kênh cho thành viên vào/rời, bao gồm cả bot; không gửi DM cho tài khoản bot. DM có thể thất bại nếu thành viên chặn DM hoặc đóng DM từ server.

### Xác minh role

- `/verify setup kenh:#verify role:@Member` đăng panel có nút **Xác minh**. Người nhấn nút nhận role đã chọn.
- `/verify disable` tắt cấp role qua panel.

Bot cần quyền **Manage Roles**, và role bot phải nằm cao hơn role được cấp. Đây là xác minh bằng nút, không phải CAPTCHA.

### Thông báo và trả lời nhanh

- `/announce send kenh:#announcements noi-dung:<nội dung>` gửi thông báo vào kênh đã chọn. Người dùng lệnh cần quyền **Quản lý máy chủ**; mention trong nội dung không tự ping thành viên.
- Khi thành viên nhắn `hi` hoặc `HI` trong server, bot tự trả lời `Y LOH`. Bot bỏ qua tin nhắn từ bot khác.

### Quyền sử dụng bot

Các danh sách được lưu riêng theo từng server. Người có quyền **Quản lý máy chủ** quản lý bằng:

- `/access allow nguoi-dung:@User` thêm ID vào allowlist.
- `/access deny nguoi-dung:@User` thêm ID vào blocklist.
- `/access remove nguoi-dung:@User` gỡ ID khỏi cả hai danh sách.
- `/access list` xem các ID hiện có.

Khi allowlist có ít nhất một ID, chỉ các ID trong đó được dùng lệnh, nút và tính năng tự trả lời; blocklist luôn ưu tiên. Quản trị viên không được bỏ qua giới hạn cho các tính năng, nhưng vẫn có thể dùng riêng `/access` để quản lý danh sách.

### Lọc link, anti-raid và DM

- Tự động xóa link được bật riêng theo server. `/moderation links action:disable` để tắt hoặc chọn `enable` để bật lại. Bot cần quyền **Manage Messages** ở kênh áp dụng.
- `/moderation setup-raid kenh:#mod-log [so-nguoi] [so-giay]` bật cảnh báo khi có mặc định 5 lượt vào trong 30 giây. Bot chỉ cảnh báo, không tự kick, ban hay khóa chat. `/moderation disable-raid` để tắt.
- `/dm send nguoi-dung:@User tin-nhan:<nội dung>` gửi DM một lần cho thành viên trong server. Người chạy lệnh cần quyền **Quản lý máy chủ**; người nhận phải mở DM từ bot/server.

## Dữ liệu

Cấu hình ticket và welcome/leave được lưu trong `data/guild-settings.json`, tự tạo khi chạy lệnh setup. Hãy giữ bản sao lưu nếu cần di chuyển cấu hình sang máy khác.
