const express = require('express');
const mysql = require('mysql2/promise');
const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const dbConfig = {
    host: process.env.DB_HOST || 'db',
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

let pool;

async function initDB() {
    pool = mysql.createPool(dbConfig);
    let retries = 15;
    while (retries > 0) {
        try {
            const connection = await pool.getConnection();
            await connection.query(`
                CREATE TABLE IF NOT EXISTS students (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    student_code VARCHAR(20) NOT NULL,
                    full_name VARCHAR(100) NOT NULL,
                    class_name VARCHAR(50) NOT NULL,
                    score FLOAT NOT NULL
                )
            `);
            connection.release();
            console.log("Database initialized successfully");
            break;
        } catch (err) {
            console.log(`Waiting for database... retries left: ${retries - 1} (${err.message})`);
            retries--;
            await new Promise(resolve => setTimeout(resolve, 3000));
        }
    }
}

initDB().catch(console.error);

app.get('/', async (req, res) => {
    try {
        if (!pool) {
            return res.status(503).send("Đang kết nối cơ sở dữ liệu, vui lòng F5 lại sau vài giây...");
        }
        const [rows] = await pool.query('SELECT * FROM students ORDER BY id DESC');
        let html = `
            <!DOCTYPE html>
            <html lang="vi">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Hệ thống Quản lý Sinh viên</title>
                <style>
                    * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
                    body { background: #f0f2f5; margin: 0; padding: 30px 20px; color: #333; }
                    .container { max-width: 900px; margin: 0 auto; background: #fff; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.08); padding: 30px; }
                    h1 { color: #1e3a8a; margin-top: 0; display: flex; align-items: center; gap: 10px; }
                    .badge { background: #e0e7ff; color: #3730a3; font-size: 14px; padding: 4px 10px; border-radius: 20px; font-weight: 500; }
                    .form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 15px; margin-bottom: 25px; background: #f8fafc; padding: 20px; border-radius: 8px; border: 1px solid #e2e8f0; }
                    .form-group { display: flex; flex-direction: column; gap: 6px; }
                    label { font-size: 13px; font-weight: 600; color: #475569; }
                    input { padding: 10px 12px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 14px; outline: none; transition: border 0.2s; }
                    input:focus { border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59,130,246,0.2); }
                    .btn-submit { grid-column: 1 / -1; background: #2563eb; color: #fff; padding: 12px; border: none; border-radius: 6px; font-weight: 600; font-size: 15px; cursor: pointer; transition: background 0.2s; }
                    .btn-submit:hover { background: #1d4ed8; }
                    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
                    th, td { padding: 12px 14px; text-align: left; border-bottom: 1px solid #e2e8f0; }
                    th { background-color: #f8fafc; color: #475569; font-weight: 600; font-size: 14px; }
                    tr:hover { background-color: #f1f5f9; }
                    .btn-delete { background: #ef4444; color: white; border: none; padding: 6px 12px; border-radius: 4px; font-size: 13px; cursor: pointer; transition: background 0.2s; }
                    .btn-delete:hover { background: #dc2626; }
                    .empty-state { text-align: center; color: #94a3b8; padding: 40px 0; }
                    .links { margin-top: 25px; padding-top: 15px; border-top: 1px solid #e2e8f0; display: flex; gap: 20px; font-size: 14px; }
                    .links a { color: #2563eb; text-decoration: none; font-weight: 500; }
                    .links a:hover { text-decoration: underline; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>🎓 Quản lý Sinh viên <span class="badge">Đề 2</span></h1>
                    
                    <form action="/add" method="POST">
                        <div class="form-grid">
                            <div class="form-group">
                                <label>Mã Sinh Viên</label>
                                <input type="text" name="student_code" placeholder="VD: B21DCCN001" required />
                            </div>
                            <div class="form-group">
                                <label>Họ và Tên</label>
                                <input type="text" name="full_name" placeholder="VD: Nguyễn Văn A" required />
                            </div>
                            <div class="form-group">
                                <label>Lớp</label>
                                <input type="text" name="class_name" placeholder="VD: D21CQCN01" required />
                            </div>
                            <div class="form-group">
                                <label>Điểm số (0 - 10)</label>
                                <input type="number" step="0.1" min="0" max="10" name="score" placeholder="VD: 8.5" required />
                            </div>
                            <button type="submit" class="btn-submit">➕ Thêm Sinh Viên</button>
                        </div>
                    </form>

                    <table>
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>Mã SV</th>
                                <th>Họ Tên</th>
                                <th>Lớp</th>
                                <th>Điểm</th>
                                <th>Thao tác</th>
                            </tr>
                        </thead>
                        <tbody>
        `;
        if (rows.length === 0) {
            html += `<tr><td colspan="6" class="empty-state">Chưa có dữ liệu sinh viên nào. Hãy nhập thông tin phía trên!</td></tr>`;
        } else {
            rows.forEach((r, idx) => {
                html += `
                    <tr>
                        <td>${idx + 1}</td>
                        <td><strong>${r.student_code}</strong></td>
                        <td>${r.full_name}</td>
                        <td>${r.class_name}</td>
                        <td><span style="font-weight:600; color: ${r.score >= 5 ? '#16a34a' : '#dc2626'}">${r.score}</span></td>
                        <td>
                            <form action="/delete/${r.id}" method="POST" style="margin:0;">
                                <button type="submit" class="btn-delete" onclick="return confirm('Bạn có chắc chắn muốn xóa sinh viên này?')">Xóa</button>
                            </form>
                        </td>
                    </tr>
                `;
            });
        }
        html += `
                        </tbody>
                    </table>

                    <div class="links">
                        <span>🔗 Liên kết quản trị:</span>
                        <a href="/phpmyadmin/" target="_blank">phpMyAdmin</a>
                        <a href="http://localhost:3001" target="_blank">Grafana (Port 3001)</a>
                    </div>
                </div>
            </body>
            </html>
        `;
        res.send(html);
    } catch (e) {
        res.status(500).send("Lỗi kết nối CSDL: " + e.message);
    }
});

app.post('/add', async (req, res) => {
    try {
        const { student_code, full_name, class_name, score } = req.body;
        await pool.query('INSERT INTO students (student_code, full_name, class_name, score) VALUES (?, ?, ?, ?)', 
            [student_code, full_name, class_name, parseFloat(score)]);
        res.redirect('/');
    } catch (e) {
        res.status(500).send(e.message);
    }
});

app.post('/delete/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM students WHERE id = ?', [req.params.id]);
        res.redirect('/');
    } catch (e) {
        res.status(500).send(e.message);
    }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running on port ${port}`));
