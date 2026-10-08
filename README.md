# Học Trực Tuyến

## Chạy đúng cách

Không mở trực tiếp `public/index.html` bằng cách double-click (địa chỉ sẽ bắt đầu bằng `file:///`). Khi đó các lệnh `fetch('/api/...')` không thể gọi server và sẽ báo `Failed to fetch`.

### Cách nhanh nhất trên Windows

1. Chạy `start.bat`.
2. Trình duyệt sẽ mở `http://localhost:3000`.
3. Đăng ký tài khoản.

Nếu chạy thủ công:

```bat
npm install
node server.js
```

Sau đó mở `http://localhost:3000`.

## Tài khoản nội bộ

Không còn ô **Mã giáo viên**.

- Tài khoản đăng ký đầu tiên: **Giáo viên**.
- Các tài khoản đăng ký tiếp theo: **Học sinh**.

Điều này phù hợp với mô hình sử dụng nội bộ ít người và không cần phát mã giáo viên.
