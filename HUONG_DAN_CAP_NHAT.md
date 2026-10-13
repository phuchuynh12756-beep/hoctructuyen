# Nâng cấp giao diện toàn bộ web + Bạn bè & Tin nhắn

## Các file trong gói
- `server.js`: API ID tài khoản, tìm người dùng, kết bạn, tin nhắn và gửi tệp.
- `public/index.html`: giao diện mới cho toàn bộ web, gồm lớp học, MIMI AI, kho đề, cài đặt và chat responsive.
- `.gitignore`: bỏ qua dữ liệu tin nhắn và tệp tải lên.
- Không có `.env`, API key, `data/users.json` hoặc `data/secret.txt` trong gói này.

## Cách cập nhật
1. Sao lưu thư mục dự án hiện tại.
2. Giải nén gói cập nhật vào thư mục `sever_hoctructuyen_settings_ban` và ghi đè `server.js`, `public/index.html`, `.gitignore`. Gói này đã giữ lại tính năng kết bạn/nhắn tin của bản trước và nâng cấp giao diện; không thay các file dữ liệu cá nhân.
3. Không xóa hoặc thay thế `data/users.json`, `data/secret.txt` hay các file dữ liệu hiện có trên máy.
4. Chạy `node server.js`, rồi mở `http://localhost:3000`.
5. Thử bằng hai tài khoản: vào tab **Bạn bè & tin nhắn**, sao chép ID của một tài khoản, tìm ID bằng tài khoản kia, gửi lời mời, chấp nhận rồi nhắn tin/gửi tệp.
6. Chỉ đẩy code lên GitHub sau khi thử ổn và xử lý mục bảo mật bên dưới.

## Quan trọng: dữ liệu riêng tư đã được Git theo dõi
Trong bản ZIP bạn gửi, Git đang theo dõi `data/users.json` và `data/secret.txt`. `.gitignore` không tự ngừng theo dõi các file đã được commit. Nếu đã đưa lên GitHub, hãy cân nhắc đặt repo thành Private và chạy trong PowerShell ở thư mục dự án:

```powershell
git rm --cached data/users.json data/secret.txt
git add .gitignore server.js public/index.html
git commit -m "Them tinh nang ket ban va nhan tin"
git push origin main
```

Lệnh `git rm --cached` chỉ bỏ các file khỏi Git, không xóa file dữ liệu ở máy của bạn. Commit mới sẽ gỡ chúng khỏi phiên bản hiện tại trên GitHub, nhưng không xóa bản sao trong lịch sử commit cũ. Nếu repo từng công khai, nên làm sạch lịch sử Git và đổi `SESSION_SECRET` trong phần Environment của Render. Không đưa API key Gemini lên GitHub.

## Các điểm cần biết
- ID `HV-XXXXXX` được cấp tự động cho tài khoản mới; tài khoản cũ được cấp ID khi máy chủ đọc dữ liệu lần đầu.
- Nhắn tin chỉ hoạt động giữa hai tài khoản đã kết bạn.
- Hỗ trợ ảnh phổ biến và tài liệu PDF, Word, PowerPoint, Excel, OpenDocument, TXT/CSV/RTF; tối đa 8 MB mỗi tệp.
- Tin nhắn và tệp hiện lưu trong `data/social.json` và `data/uploads/`; hai nơi này được `.gitignore` bỏ qua.
- **Lưu ý Render:** ổ đĩa của dịch vụ miễn phí có thể không giữ dữ liệu sau deploy/restart. Muốn giữ tin nhắn và tệp lâu dài trên web online, cần cơ sở dữ liệu và kho lưu trữ bền vững (hoặc dịch vụ có persistent disk phù hợp).


## Bản cập nhật: ảnh/video trong câu hỏi + giao diện điện thoại
- Trong Kho đề → Tự thêm đề, mỗi câu có 4 lựa chọn: Thêm ảnh, Chụp ảnh, Thêm video, Quay video. Có xem trước và nút bỏ tệp.
- Ảnh tối đa 5 MB; video tối đa 8 MB. Câu hỏi có thể chỉ có ảnh/video, không bắt buộc nhập chữ.
- Tệp được lưu trong `public/data/exam-media/`; bản triển khai Render không có ổ đĩa bền vững thì tệp có thể mất khi dịch vụ khởi động lại. Muốn giữ lâu dài cần Persistent Disk hoặc dịch vụ lưu trữ tệp.
- Giao diện chọn ảnh/video tự co lại trên màn hình điện thoại; icon SVG không cần cài thư viện ngoài.
- Cập nhật bằng cách giải nén và thay `server.js`, `public/index.html`; giữ lại dữ liệu tài khoản và file `.env` hiện tại, không ghi đè bằng file mẫu.

## Chế độ chỉ gửi ảnh/video, không cần đáp án
Trong mục Tự thêm đề, chọn loại câu **“Chỉ gửi ảnh/video (không cần đáp án)”**, đính kèm ảnh hoặc video rồi bấm **Thêm câu vào bản nháp**. Có thể để trống nội dung chữ; loại câu này chỉ hiển thị tệp cho người xem, không yêu cầu trả lời hay đáp án.
