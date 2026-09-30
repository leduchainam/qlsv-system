const express = require('express');
const mysql = require('mysql2/promise');
const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const dbConfig = {
    host: 'db',
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
    console.log("Database initialized");
}

initDB().catch(console.error);

app.get('/', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM students');
        let html = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Quản lý sinh viên</title>
                <style>
                    body { font-family: Arial; padding: 20px; }
                    table { border-collapse: collapse; width: 100%; margin-top: 20px; }
                    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                    th { background-color: #f2f2f2; }
                    form { margin-bottom: 20px; background: #f9f9f9; padding: 15px; border-radius: 5px; }
                    input, button { margin: 5px 0; padding: 8px; }
                </style>
            </head>
            <body>
                <h1>Quản lý Sinh viên</h1>
                <form action="/add" method="POST">
                    <input type="text" name="student_code" placeholder="Mã SV" required />
                    <input type="text" name="full_name" placeholder="Họ Tên" required />
                    <input type="text" name="class_name" placeholder="Lớp" required />
                    <input type="number" step="0.1" name="score" placeholder="Điểm" required />
                    <button type="submit">Thêm sinh viên</button>
                </form>
                <table>
                    <tr>
                        <th>ID</th><th>Mã SV</th><th>Họ Tên</th><th>Lớp</th><th>Điểm</th><th>Hành động</th>
                    </tr>
        `;
        rows.forEach(r => {
            html += `
                <tr>
                    <td>${r.id}</td><td>${r.student_code}</td><td>${r.full_name}</td><td>${r.class_name}</td><td>${r.score}</td>
                    <td>
                        <form action="/delete/${r.id}" method="POST" style="margin:0; padding:0; background:none; border:none;">
                            <button type="submit" style="color:red; cursor:pointer;">Xóa</button>
                        </form>
                    </td>
                </tr>
            `;
        });
        html += `</table></body></html>`;
        res.send(html);
    } catch (e) {
        res.status(500).send("Lỗi kết nối DB: " + e.message);
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
app.listen(port, () => console.log(\`Server running on port \${port}\`));
