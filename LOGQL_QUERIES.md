# 🔍 Danh Sách Truy Vấn LogQL Mẫu (Grafana Explore)

Tài liệu tổng hợp các mẫu truy vấn **LogQL** phục vụ demo trực quan trên giao diện **Grafana Explore** (`http://localhost:3001/explore`), bao gồm giám sát lưu lượng Nginx, phát hiện tấn công xác thực và truy vết nhật ký hành động (Audit Trail).

---

## 🌐 1. Giám Sát Lưu Lượng Mạng & Reverse Proxy (Nginx)

### A. Xem toàn bộ dòng log truy cập thời gian thực
```logql
{job="nginx"}
```
* **Mục đích:** Kiểm tra luồng request đi qua Nginx Reverse Proxy từ client.

### B. Lọc các yêu cầu hoàn tất thành công (HTTP 200 OK)
```logql
{job="nginx"} |= " 200 "
```

### C. Lọc các yêu cầu bị lỗi máy chủ hoặc đường dẫn không hợp lệ (4xx, 5xx)
```logql
{job="nginx"} |~ "HTTP/1.1\" [45][0-9]{2}"
```

### D. Biểu đồ tần suất truy cập hệ thống (Request Rate mỗi phút)
```logql
rate({job="nginx"}[1m])
```

---

## 🛡️ 2. Giám Sát An Ninh & Xác Thực Người Dùng (Security & Auth)

### A. Phát hiện các lần đăng nhập sai (HTTP 401 Unauthorized)
```logql
{job="nginx"} |= "POST /api/login" |= " 401 "
```
* **Ý nghĩa:** Định vị các nỗ lực đăng nhập thất bại do nhập sai mật khẩu Quản trị viên.

### B. Cảnh báo hành vi dò mật khẩu tự động (Brute-Force Attack Detection)
```logql
rate({job="nginx"} |= "POST /api/login" |= " 401 "[1m])
```
* **Ý nghĩa:** Vẽ biểu đồ tần suất đăng nhập thất bại. Nếu đường biểu đồ tăng vọt trên 5 req/phút, hệ thống đang bị rà quét mật khẩu tự động.

### C. Phát hiện nỗ lực thao tác dữ liệu trái phép (HTTP 403 Forbidden)
```logql
{job="nginx"} |= " 403 "
```
* **Ý nghĩa:** Ghi nhận các request cố tình thêm, sửa hoặc xóa dữ liệu sinh viên khi chưa đăng nhập quyền Admin.

---

## 📋 3. Giám Sát Nhật Ký Ứng Dụng & Truy Vết (Web App Audit Logs)

Promtail thu thập trực tiếp tệp log của ứng dụng Web Node.js từ volume `/var/log/app/app.log`:

### A. Xem toàn bộ log của ứng dụng Web
```logql
{job="webapp"}
```

### B. Lọc toàn bộ sự kiện xác thực (Thành công / Thất bại / Đăng xuất)
```logql
{job="webapp"} |~ "(AUTH_SUCCESS|AUTH_FAILED|AUTH_LOGOUT)"
```

### C. Truy vết thao tác chỉnh sửa CSDL (Audit Trail)
```logql
{job="webapp"} |~ "(STUDENT_ADDED|STUDENT_UPDATED|STUDENT_DELETED|SAMPLE_DATA_SEEDED)"
```

### D. Lọc nhanh các thông báo lỗi và cảnh báo an ninh
```logql
{job="webapp"} |~ "(ERROR|WARN|UNAUTHORIZED)"
```
