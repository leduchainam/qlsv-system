# 📊 Danh Sách Truy Vấn PromQL Mẫu (Prometheus & Grafana)

Tài liệu tổng hợp các biểu thức truy vấn **PromQL (Prometheus Query Language)** phục vụ việc tra cứu, kiểm tra và vẽ đồ thị trực tiếp trên giao diện **Prometheus Web UI** (`http://localhost:9090/graph`) hoặc **Grafana Explore** (`http://localhost:3001/explore`, chọn Datasource **Prometheus**).

---

## 🧭 Hướng Dẫn Cách Nhập Truy Vấn Trên Giao Diện Prometheus

1. Mở trình duyệt và truy cập: **`http://localhost:9090`** (hoặc `http://<IP_MÁY_ẢO>:9090`).
2. Nhấp vào thẻ **Graph** trên thanh điều hướng.
3. Dán câu lệnh PromQL vào thanh **Expression** (ô tìm kiếm).
4. Nhấn nút **Execute** (hoặc phím `Enter`):
   * Thẻ **Table:** Hiển thị giá trị tức thời tại thời điểm hiện tại.
   * Thẻ **Graph:** Vẽ biểu đồ dữ liệu biến thiên theo thời gian.
5. Để kiểm tra trạng thái hoạt động của các Exporter, truy cập: **`http://localhost:9090/targets`**.

---

## 🩺 1. Kiểm Tra Sức Khỏe & Độ Sẵn Sàng Của Hệ Thống (Health & Uptime)

### A. Kiểm tra trạng thái hoạt động của tất cả dịch vụ (Target Health)
```promql
up
```
* **Ý nghĩa:** Trả về `1` nếu dịch vụ đang hoạt động bình thường (UP), trả về `0` nếu dịch vụ gặp sự cố hoặc ngừng hoạt động (DOWN).
* **Kết quả gồm 3 job:** `node-exporter` (phần cứng), `mysqld-exporter` (cơ sở dữ liệu), `prometheus` (máy chủ giám sát).

### B. Kiểm tra riêng từng dịch vụ cụ thể
```promql
# Kiểm tra Node Exporter
up{job="node-exporter"}

# Kiểm tra MySQL Exporter
up{job="mysqld-exporter"}
```

### C. Thời gian máy chủ đã hoạt động liên tục (Host Uptime - Tính theo Giờ)
```promql
(node_time_seconds - node_boot_time_seconds) / 3600
```
* **Ý nghĩa:** Tính số giờ máy chủ hoạt động kể từ lần khởi động gần nhất.

### D. Thời gian cơ sở dữ liệu MySQL đã chạy liên tục (MySQL Uptime - Tính theo Giờ)
```promql
mysql_global_status_uptime / 3600
```

---

## 💻 2. Giám Sát Phần Cứng Máy Chủ Host (Node Exporter)

### A. Tỷ lệ CPU sử dụng (% CPU Utilization)
```promql
100 - (avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[1m])) * 100)
```
* **Ý nghĩa:** Lấy 100% trừ đi tỷ lệ thời gian CPU rảnh rỗi (`idle`) trong 1 phút vừa qua. Phản ánh mức độ chịu tải hiện tại của CPU.

### B. Tỷ lệ bộ nhớ RAM đã sử dụng (% RAM Usage)
```promql
((node_memory_MemTotal_bytes - node_memory_MemAvailable_bytes) / node_memory_MemTotal_bytes) * 100
```
* **Ý nghĩa:** Tính phần trăm dung lượng RAM đang được hệ điều hành và các container Docker sử dụng.

### C. Dung lượng RAM còn khả dụng (Available RAM - Tính theo GB)
```promql
node_memory_MemAvailable_bytes / 1024 / 1024 / 1024
```
* **Ý nghĩa:** Đo lường lượng RAM còn trống mà các tiến trình có thể cấp phát an toàn trước khi xảy ra hiện tượng tràn RAM (OOM).

### D. Tỷ lệ dung lượng ổ cứng đã sử dụng (% Disk Usage)
```promql
topk(1, 100 - ((node_filesystem_avail_bytes{fstype="ext4"} / node_filesystem_size_bytes{fstype="ext4"}) * 100))
```
* **Ý nghĩa:** Tính tỷ lệ phần trăm dung lượng ổ đĩa phân vùng chính (`ext4`) đã sử dụng.

### E. Băng thông mạng truyền nhận (Network In/Out Traffic - KB/s)
* **Băng thông tải về (Receive Rate):**
  ```promql
  sum(rate(node_network_receive_bytes_total{device!~"lo|docker.*|br.*|veth.*"}[1m])) / 1024
  ```
* **Băng thông gửi đi (Transmit Rate):**
  ```promql
  sum(rate(node_network_transmit_bytes_total{device!~"lo|docker.*|br.*|veth.*"}[1m])) / 1024
  ```
* **Ý nghĩa:** Bỏ qua các giao diện mạng ảo nội bộ (`lo`, `docker`, `veth`) để đo lường chính xác lưu lượng ra vào qua card mạng thực tế.

### F. Tốc độ đọc / ghi ổ đĩa (Disk I/O Rate - KB/s)
* **Tốc độ đọc đĩa (Disk Read):**
  ```promql
  rate(node_disk_read_bytes_total[1m]) / 1024
  ```
* **Tốc độ ghi đĩa (Disk Write):**
  ```promql
  rate(node_disk_written_bytes_total[1m]) / 1024
  ```

---

## 🗄️ 3. Giám Sát Cơ Sở Dữ Liệu MySQL (mysqld-exporter)

### A. Kiểm tra trạng thái kết nối MySQL
```promql
mysql_up
```
* **Ý nghĩa:** Giá trị `1` là kết nối CSDL MySQL đang thông suốt, `0` là mất kết nối đến database `mysql_db`.

### B. Số lượng kết nối đang mở đồng thời (Active Connections / Threads Connected)
```promql
mysql_global_status_threads_connected
```
* **Ý nghĩa:** Số luồng client đang kết nối đến MySQL (gồm Web App, phpMyAdmin, mysqld-exporter).

### C. Tần suất câu truy vấn thực thi mỗi giây (Queries Per Second - QPS)
```promql
rate(mysql_global_status_questions[1m])
```
* **Ý nghĩa:** Đo tốc độ tiếp nhận và xử lý các câu truy vấn SQL gửi đến MySQL.

### D. Đếm số câu truy vấn bị chậm (Slow Queries)
```promql
mysql_global_status_slow_queries
```
* **Ý nghĩa:** Số câu lệnh SQL có thời gian xử lý vượt ngưỡng quy định (`long_query_time`).

### E. Tần suất câu lệnh SELECT mỗi giây
```promql
rate(mysql_global_status_commands_total{command="select"}[1m])
```

### F. Tần suất các thao tác thay đổi dữ liệu (INSERT, UPDATE, DELETE)
```promql
sum(rate(mysql_global_status_commands_total{command=~"insert|update|delete"}[1m]))
```
* **Ý nghĩa:** Theo dõi khối lượng công việc ghi dữ liệu (Thêm sinh viên mới, cập nhật điểm, xóa bản ghi) từ ứng dụng.

### G. Lưu lượng truyền tải dữ liệu MySQL qua mạng (KB/s)
* **Dữ liệu MySQL nhận được:**
  ```promql
  rate(mysql_global_status_bytes_received[1m]) / 1024
  ```
* **Dữ liệu MySQL gửi phản hồi:**
  ```promql
  rate(mysql_global_status_bytes_sent[1m]) / 1024
  ```

---

## ⚡ 4. Giám Sát Máy Chủ Prometheus (Prometheus Server Metrics)

### A. Tốc độ thu thập mẫu chỉ số mới (Samples Ingested Rate / s)
```promql
rate(prometheus_tsdb_head_samples_appended_total[1m])
```
* **Ý nghĩa:** Đo số lượng điểm dữ liệu (metrics samples) mà Prometheus nạp vào bộ nhớ mỗi giây.

### B. Thời gian hoàn tất mỗi lượt cào dữ liệu (Scrape Duration - giây)
```promql
scrape_duration_seconds
```
* **Ý nghĩa:** Kiểm tra xem Prometheus mất bao nhiêu giây để lấy dữ liệu từ từng Exporter. Nếu vượt quá `scrape_timeout` (10s), target sẽ bị đánh dấu là unhealthy.

---

## 📌 Bảng Tóm Tắt Tra Cứu Nhanh

| Mục Đích Giám Sát | Biểu Thức PromQL | Đơn Vị | Ngưỡng Cảnh Báo (Khuyến Nghị) |
| :--- | :--- | :--- | :--- |
| **Sức khỏe dịch vụ** | `up` | Boolean | `0` (Dịch vụ bị ngắt) |
| **Tải CPU máy chủ** | `100 - (avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[1m])) * 100)` | `%` | `> 85%` |
| **Tải bộ nhớ RAM** | `((node_memory_MemTotal_bytes - node_memory_MemAvailable_bytes) / node_memory_MemTotal_bytes) * 100` | `%` | `> 90%` |
| **Dung lượng ổ đĩa** | `topk(1, 100 - ((node_filesystem_avail_bytes{fstype="ext4"} / node_filesystem_size_bytes{fstype="ext4"}) * 100))` | `%` | `> 85%` |
| **Kết nối MySQL** | `mysql_up` | Boolean | `0` (MySQL DOWN) |
| **Luồng MySQL active** | `mysql_global_status_threads_connected` | Số luồng | `> 100` luồng |
| **Tần suất truy vấn QPS**| `rate(mysql_global_status_questions[1m])` | req/s | Tăng đột biến bất thường |
