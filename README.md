# Lớp học trực tuyến + Giáo viên AI

## Chạy cục bộ
1. Cài Node.js LTS.
2. Chạy `npm install`.
3. Đặt `GEMINI_API_KEY` trong biến môi trường hoặc file `.env` ở cùng thư mục `server.js`.
4. Chạy `npm start` rồi mở `http://localhost:3000`.

## Deploy Render
- Build Command: `npm install`
- Start Command: `node server.js`
- Thêm Environment Variable `GEMINI_API_KEY` trong Render.

## Lưu ý bảo mật
- Không commit `.env`, `data/users.json` hoặc `data/secret.txt`.
- Dữ liệu JSON trên filesystem của hosting miễn phí có thể mất khi redeploy/restart. Nếu cần lưu tài khoản/đề thi bền vững, hãy dùng database hoặc persistent disk.
- Tất cả tài khoản đều là thành viên bình đẳng. Người dùng chỉ xóa/sửa được đề do chính tài khoản đó đăng; kiểm tra quyền được thực hiện ở máy chủ.
- Chia sẻ màn hình từ web phụ thuộc API và hỗ trợ của trình duyệt/thiết bị. Nhiều trình duyệt di động không hỗ trợ `getDisplayMedia()`.
