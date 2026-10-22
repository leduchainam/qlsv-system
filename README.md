# 🎓 Hệ Thống Quản Lý Sinh Viên (QLSV-SYSTEM)

> Hệ thống quản lý sinh viên hiện đại được container hóa toàn diện với Docker, tích hợp Nginx Reverse Proxy bảo mật HTTPS, hệ thống giám sát metrics theo thời gian thực (Prometheus + Grafana) và quản lý log tập trung (Loki + Promtail).

---

## 📌 Bảng Danh Sách Các Dịch Vụ & Đường Dẫn Truy Cập

| Dịch Vụ | Giao Thức / URL Truy Cập | Cổng (Port) | Tài Khoản / Mật Khẩu Mặc Định | Mô Tả |
| :--- | :--- | :--- | :--- | :--- |
| **Web Application** | [https://localhost](https://localhost) *(hoặc `https://<IP_MÁY_ẢO>`)* | `443` (HTTPS) | Không yêu cầu | Giao diện quản lý hồ sơ sinh viên (CRUD) |
| **HTTP Redirect** | [http://localhost](http://localhost) | `80` (HTTP) | - | Tự động chuyển hướng (301) sang HTTPS 443 |
| **phpMyAdmin** | [https://localhost/phpmyadmin/](https://localhost/phpmyadmin/) | `443` | User: `student_user` hoặc `root`<br>Pass: Trong tệp `.env` | Giao diện quản trị cơ sở dữ liệu MySQL |
| **Grafana Dashboard** | [http://localhost:3001](http://localhost:3001) *(hoặc `http://<IP>:3001`)* | `3001` | User: `admin`<br>Pass: `admin` *(hoặc giá trị `GRAFANA_PASSWORD`)* | Trực quan hóa hiệu năng máy chủ và MySQL |
| **Prometheus Server** | [http://localhost:9090](http://localhost:9090) | `9090` | Không yêu cầu | Thu thập và lưu trữ time-series metrics |
| **Prometheus Targets** | [http://localhost:9090/targets](http://localhost:9090/targets) | `9090` | - | Trạng thái sức khỏe các Exporters (UP/DOWN) |
| **Loki Log Server** | [http://localhost:3100/ready](http://localhost:3100/ready) | `3100` | - | Endpoint kiểm tra sẵn sàng của Loki Log Engine |

*(Lưu ý: Nếu truy cập từ máy tính host Windows vào máy ảo, hãy thay `localhost` bằng IP máy ảo, ví dụ `https://192.168.153.128`).*

---

## 🏗️ Kiến Trúc Hệ Thống (Architecture Overview)

Hệ thống được thiết kế theo mô hình Microservices đa tầng với 3 mạng ảo (Docker Networks) độc lập:

* **Tầng Gateway:** Nginx làm Reverse Proxy, tiếp nhận cổng 80 & 443, SSL/TLS Termination, cấu hình Security Headers (CSP, X-Frame-Options, nosniff).
* **Tầng Ứng Dụng (Application):** Node.js 18 (Alpine), Express REST API, đóng gói an toàn chạy dưới quyền **Non-root user (`appuser`)**.
* **Tầng Dữ Liệu (Database):** MySQL 8.0 lưu trữ bền vững với Docker Volume `db_data`, cô lập hoàn toàn trong mạng nội bộ `backend-network` (đóng cổng 3306 ra ngoài máy host).
* **Tầng Giám Sát (Metrics):**
  * `node-exporter`: Thu thập chỉ số tài nguyên máy chủ host (CPU, RAM, Disk, Network).
  * `mysqld-exporter`: Thu thập chỉ số hiệu năng cơ sở dữ liệu MySQL.
  * `prometheus`: Cào dữ liệu định kỳ mỗi 15 giây.
  * `grafana`: Tự động nạp sẵn (Provisioning) Datasource và Dashboards.
* **Tầng Quản Lý Nhật Ký (Logging):**
  * `promtail`: Đọc liên tục tệp log Nginx từ volume chia sẻ `nginx_logs`.
  * `loki`: Lưu trữ và lập chỉ mục metadata log, hỗ trợ truy vấn bằng **LogQL**.

---

## 🚀 Hướng Dẫn Cài Đặt & Khởi Chạy

### 1. Yêu cầu môi trường
* Hệ điều hành: Linux / Ubuntu (hoặc WSL2 / macOS)
* Đã cài đặt: **Docker** và **Docker Compose**

### 2. Thiết lập biến môi trường
Sao chép tệp mẫu và cập nhật các mật khẩu bảo mật:
```bash
cp .env.example .env
chmod 600 .env
```
Chỉnh sửa mật khẩu bên trong tệp `.env`:
```ini
MYSQL_ROOT_PASSWORD=root_secure_password
MYSQL_DATABASE=student_db
MYSQL_USER=student_user
MYSQL_PASSWORD=student_secure_password
PORT=3000
NODE_ENV=production
GRAFANA_PASSWORD=admin
```

### 3. Khởi chạy toàn bộ hệ thống
Khởi động tất cả các container chạy ngầm:
```bash
docker compose up -d --build
```

Kiểm tra trạng thái các container:
```bash
docker compose ps
```

---

## 🔍 Hướng Dẫn Truy Vấn LogQL Mẫu (Grafana Explore)

Truy cập Grafana tại `http://localhost:3001` -> Menu **Explore** -> Chọn Datasource **Loki**:

1. **Xem toàn bộ log truy cập Nginx:**
   ```logql
   {job="nginx"}
   ```
2. **Lọc các yêu cầu thành công HTTP 200:**
   ```logql
   {job="nginx"} |= " 200 "
   ```
3. **Lọc các yêu cầu lỗi HTTP 4xx hoặc 5xx:**
   ```logql
   {job="nginx"} |~ "HTTP/1.1\" [45]"
   ```
4. **Vẽ biểu đồ tần suất request trên mỗi phút:**
   ```logql
   rate({job="nginx"}[1m])
   ```

---

## 🛡️ Các Biện Pháp Gia Cố Bảo Mật (Hardening)

* ✅ **Non-root Container:** Ứng dụng Web chạy với tài khoản `appuser` (UID=100), hạn chế tối đa nguy cơ leo thang đặc quyền.
* ✅ **Network Segmentation:** Tách biệt 3 mạng `frontend-network`, `backend-network`, `monitoring-network`. Không phơi lộ cổng Database 3306 ra ngoài Host.
* ✅ **Mã Hóa HTTPS:** Nginx tích hợp chứng chỉ SSL/TLS 2048-bit, tự động chuyển hướng HTTP sang HTTPS.
* ✅ **HTTP Security Headers:** Thiết lập `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, và `Content-Security-Policy`.
* ✅ **Bảo Mật Cấu Hình:** Tệp mật khẩu `.env` được loại trừ khỏi Git (`.gitignore`) và phân quyền an toàn `chmod 600`.

---

## 🛑 Các Lệnh Quản Trị Thường Dùng

* **Xem log thời gian thực:**
  ```bash
  docker compose logs -f nginx
  docker compose logs -f web-app
  ```
* **Khởi động lại một dịch vụ:**
  ```bash
  docker compose restart <service_name>
  ```
* **Dừng toàn bộ hệ thống:**
  ```bash
  docker compose down
  ```
* **Dừng hệ thống và xóa sạch dữ liệu volume:**
  ```bash
  docker compose down -v
  ```
