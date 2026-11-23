# 🎵 Triệu Trái Tim (.info) — Web Nghe Nhạc Giao Diện Xưa (2007 – 2009)

Phiên bản phục dựng trang web nghe nhạc hoài niệm phong cách **trieutraitim.info** thế hệ 8x – 9x (thời kỳ Yahoo! Messenger, Blog 360 & Flash Windows Media Player), tích hợp đầy đủ **Bảng Quản Trị Webmaster AdminCP** và hỗ trợ **Upload file MP3 trực tiếp lên GitHub Pages**.

## ✨ Tính năng nổi bật
- **Giao diện chuẩn 2008**: Bố cục 3 cột caro xanh nốt nhạc, thanh tiêu đề gương `✳ : Thông Tin : ✳`, trình phát nhạc bóng gương kiểu WMP 11 có thanh trượt xanh lá mạ, icon sóng nhạc 4 cột `ılıl`, nút ẩn/hiện Banner (**Chế Độ Ảnh Gốc**).
- **Bộ phát âm thanh kép**: Phát ngay giai điệu hòa tấu Music Box / Electric Piano cho mọi ca khúc trong danh sách hoặc phát trực tiếp file `.mp3` thật.
- **Tương tác hoài niệm**: Cửa sổ chat **Yahoo! Messenger** (`YH! Con mòe kêu meo meo`) có nút rung màn hình **`⚡ BUZZ!`** kèm âm thanh đặc trưng, tiện ích tra cứu biển số xe VN, đổi đơn vị, xem thời tiết...
- **Bảng Quản Trị AdminCP (`admin.html`)**:
  - Thêm / Sửa / Xóa / Đổi thứ tự bài hát, chỉnh lời nhạc, chọn bài mở đầu mặc định.
  - **Upload hàng loạt file `.mp3` (Kéo & Thả)** tự động tách `Tên bài - Ca sĩ` và đo thời lượng.
  - Chỉnh sửa toàn bộ cấu hình giao diện, lời chào chạy chữ, Yahoo ID, bộ đếm LCD và các chuyên mục cột trái / cột phải.
  - **Kết nối GitHub Cloud**: Cho phép upload `.mp3` và lưu `site-db.json` trực tiếp từ trình duyệt lên kho GitHub để chạy online trên **GitHub Pages**!

## 🚀 Hướng dẫn sử dụng
1. **Trên GitHub Pages**:
   - Mở trang nghe nhạc tại `https://<username>.github.io/<ten-repo>/`
   - Mở trang quản trị tại `https://<username>.github.io/<ten-repo>/admin.html` (mặc định: `admin` / `123456`).
   - Vào tab **💾 Kho File MP3 & Hệ Thống → ☁ Kết Nối GitHub Cloud**, dán **GitHub Personal Access Token** (quyền `repo` hoặc `Contents: Read & Write`) để upload nhạc `.mp3` trực tiếp lên web online! *(Token chỉ lưu riêng trong `localStorage` trình duyệt máy bạn).*
2. **Chạy trên máy tính Windows (Local Server)**:
   - Chạy `powershell -ExecutionPolicy Bypass -File .\serve.ps1` rồi mở `http://127.0.0.1:8123/`.
