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
    queueLimit: 0,
    charset: 'utf8mb4'
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
                    full_name VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
                    class_name VARCHAR(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
                    score FLOAT NOT NULL
                ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
            `);
            connection.release();
            console.log("Database initialized successfully with utf8mb4");
            break;
        } catch (err) {
            console.log(`Waiting for database... retries left: ${retries - 1} (${err.message})`);
            retries--;
            await new Promise(resolve => setTimeout(resolve, 3000));
        }
    }
}

initDB().catch(console.error);

// Helper function to classify score
function getGrade(score) {
    if (score >= 9.0) return { label: 'Xuất sắc', class: 'grade-excellent', icon: '🌟' };
    if (score >= 8.0) return { label: 'Giỏi', class: 'grade-good', icon: '🏆' };
    if (score >= 6.5) return { label: 'Khá', class: 'grade-fair', icon: '🎯' };
    if (score >= 5.0) return { label: 'Trung bình', class: 'grade-average', icon: '📚' };
    return { label: 'Yếu', class: 'grade-poor', icon: '⚠️' };
}

// Helper to escape HTML characters
function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

app.get('/', async (req, res) => {
    try {
        if (!pool) {
            return res.status(503).send(`
                <!DOCTYPE html>
                <html lang="vi">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Khởi động hệ thống | QLSV</title>
                    <style>
                        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #0f172a; color: #fff; text-align: center; }
                        .spinner { width: 50px; height: 50px; border: 4px solid rgba(255,255,255,0.1); border-top-color: #6366f1; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 20px; }
                        @keyframes spin { to { transform: rotate(360deg); } }
                    </style>
                    <meta http-equiv="refresh" content="3">
                </head>
                <body>
                    <div>
                        <div class="spinner"></div>
                        <h2>Đang kết nối cơ sở dữ liệu MySQL...</h2>
                        <p style="color: #94a3b8;">Trang sẽ tự động tải lại sau vài giây.</p>
                    </div>
                </body>
                </html>
            `);
        }

        const [rows] = await pool.query('SELECT * FROM students ORDER BY id DESC');

        // Calculate statistics
        const totalStudents = rows.length;
        const avgScore = totalStudents > 0 
            ? (rows.reduce((sum, s) => sum + parseFloat(s.score), 0) / totalStudents).toFixed(2) 
            : 0;
        const passCount = rows.filter(s => s.score >= 5.0).length;
        const passRate = totalStudents > 0 ? ((passCount / totalStudents) * 100).toFixed(1) : 0;
        const excellentCount = rows.filter(s => s.score >= 8.0).length;
        const poorCount = rows.filter(s => s.score < 5.0).length;

        // Distinct classes for filter
        const classList = [...new Set(rows.map(r => r.class_name))].sort();

        // Pass rows to client JSON for client-side sorting/filtering
        const clientDataJson = JSON.stringify(rows.map(r => ({
            id: r.id,
            student_code: r.student_code,
            full_name: r.full_name,
            class_name: r.class_name,
            score: parseFloat(r.score)
        })));

        const html = `<!DOCTYPE html>
<html lang="vi" data-theme="dark">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Hệ thống Quản lý Sinh viên | QLSV Pro Dashboard</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
    <style>
        :root {
            --font-main: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            
            /* Dark Theme (Default) */
            --bg-body: #0b0f19;
            --bg-card: rgba(17, 24, 39, 0.75);
            --bg-card-hover: rgba(31, 41, 55, 0.85);
            --bg-surface: #131c2e;
            --bg-input: #1e293b;
            --border-color: rgba(255, 255, 255, 0.08);
            --border-focus: #6366f1;
            --text-main: #f8fafc;
            --text-muted: #94a3b8;
            --text-light: #64748b;
            
            /* Primary Accents */
            --primary: #6366f1;
            --primary-hover: #4f46e5;
            --primary-gradient: linear-gradient(135deg, #6366f1 0%, #4338ca 100%);
            --primary-glow: rgba(99, 102, 241, 0.25);
            
            /* Status Colors */
            --success: #10b981;
            --success-bg: rgba(16, 185, 129, 0.15);
            --warning: #f59e0b;
            --warning-bg: rgba(245, 158, 11, 0.15);
            --danger: #ef4444;
            --danger-bg: rgba(239, 68, 68, 0.15);
            --info: #0ea5e9;
            --info-bg: rgba(14, 165, 233, 0.15);
            --purple: #a855f7;
            --purple-bg: rgba(168, 85, 247, 0.15);
            
            --card-shadow: 0 10px 30px -5px rgba(0, 0, 0, 0.4), 0 0 1px 1px rgba(255, 255, 255, 0.05);
            --nav-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
            --glass-blur: blur(16px);
        }

        [data-theme="light"] {
            --bg-body: #f1f5f9;
            --bg-card: rgba(255, 255, 255, 0.9);
            --bg-card-hover: #ffffff;
            --bg-surface: #f8fafc;
            --bg-input: #ffffff;
            --border-color: #e2e8f0;
            --border-focus: #4f46e5;
            --text-main: #0f172a;
            --text-muted: #475569;
            --text-light: #94a3b8;
            
            --primary: #4f46e5;
            --primary-hover: #4338ca;
            --primary-gradient: linear-gradient(135deg, #4f46e5 0%, #3730a3 100%);
            --primary-glow: rgba(79, 70, 229, 0.2);
            
            --card-shadow: 0 10px 25px -5px rgba(15, 23, 42, 0.06), 0 4px 10px -2px rgba(15, 23, 42, 0.03);
            --nav-shadow: 0 2px 15px rgba(0, 0, 0, 0.05);
        }

        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
            font-family: var(--font-main);
            transition: background-color 0.25s ease, border-color 0.25s ease, color 0.25s ease;
        }

        body {
            background-color: var(--bg-body);
            color: var(--text-main);
            min-height: 100vh;
            line-height: 1.5;
            position: relative;
            overflow-x: hidden;
        }

        /* Ambient background glow */
        body::before {
            content: '';
            position: fixed;
            top: -200px;
            left: 50%;
            transform: translateX(-50%);
            width: 800px;
            height: 450px;
            background: radial-gradient(circle, rgba(99, 102, 241, 0.15) 0%, transparent 70%);
            pointer-events: none;
            z-index: 0;
        }

        /* Navbar Header */
        .navbar {
            position: sticky;
            top: 0;
            z-index: 50;
            background: var(--bg-card);
            backdrop-filter: var(--glass-blur);
            -webkit-backdrop-filter: var(--glass-blur);
            border-bottom: 1px solid var(--border-color);
            box-shadow: var(--nav-shadow);
        }

        .nav-container {
            max-width: 1300px;
            margin: 0 auto;
            padding: 12px 24px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 16px;
        }

        .brand-group {
            display: flex;
            align-items: center;
            gap: 14px;
            text-decoration: none;
        }

        .brand-logo {
            width: 44px;
            height: 44px;
            border-radius: 12px;
            background: var(--primary-gradient);
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 4px 14px var(--primary-glow);
            color: #fff;
            flex-shrink: 0;
        }

        .brand-logo svg {
            width: 26px;
            height: 26px;
        }

        .brand-text h1 {
            font-size: 19px;
            font-weight: 800;
            color: var(--text-main);
            display: flex;
            align-items: center;
            gap: 8px;
            letter-spacing: -0.02em;
        }

        .brand-badge {
            font-size: 11px;
            font-weight: 700;
            padding: 2px 8px;
            border-radius: 20px;
            background: var(--primary-glow);
            color: var(--primary);
            border: 1px solid var(--primary);
            text-transform: uppercase;
        }

        .brand-text p {
            font-size: 12px;
            color: var(--text-muted);
            margin-top: 1px;
        }

        .nav-actions {
            display: flex;
            align-items: center;
            gap: 10px;
            flex-wrap: wrap;
        }

        .status-pill {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 6px 12px;
            background: var(--bg-surface);
            border: 1px solid var(--border-color);
            border-radius: 30px;
            font-size: 12px;
            font-weight: 600;
            color: var(--text-muted);
        }

        .status-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: var(--success);
            box-shadow: 0 0 10px var(--success);
            animation: pulse-dot 2s infinite;
        }

        @keyframes pulse-dot {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.5; transform: scale(1.2); }
        }

        .btn-nav-link {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 7px 13px;
            border-radius: 8px;
            font-size: 13px;
            font-weight: 600;
            text-decoration: none;
            background: var(--bg-surface);
            color: var(--text-muted);
            border: 1px solid var(--border-color);
            cursor: pointer;
            transition: all 0.2s ease;
        }

        .btn-nav-link:hover {
            color: var(--text-main);
            background: var(--bg-card-hover);
            border-color: var(--border-focus);
            transform: translateY(-1px);
        }

        .theme-toggle {
            width: 38px;
            height: 38px;
            border-radius: 10px;
            border: 1px solid var(--border-color);
            background: var(--bg-surface);
            color: var(--text-main);
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: all 0.2s ease;
        }

        .theme-toggle:hover {
            background: var(--bg-card-hover);
            border-color: var(--border-focus);
            transform: rotate(15deg);
        }

        /* Main Container */
        .main-layout {
            max-width: 1300px;
            margin: 0 auto;
            padding: 28px 24px 60px;
            position: relative;
            z-index: 1;
        }

        /* Stats Grid */
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
            gap: 16px;
            margin-bottom: 28px;
        }

        .stat-card {
            background: var(--bg-card);
            backdrop-filter: var(--glass-blur);
            -webkit-backdrop-filter: var(--glass-blur);
            border: 1px solid var(--border-color);
            border-radius: 16px;
            padding: 20px;
            box-shadow: var(--card-shadow);
            display: flex;
            align-items: center;
            gap: 16px;
            position: relative;
            overflow: hidden;
            transition: transform 0.2s ease, box-shadow 0.2s ease;
        }

        .stat-card:hover {
            transform: translateY(-3px);
            box-shadow: 0 15px 35px -5px rgba(0, 0, 0, 0.35);
        }

        .stat-icon {
            width: 52px;
            height: 52px;
            border-radius: 14px;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
        }

        .stat-icon svg {
            width: 26px;
            height: 26px;
        }

        .stat-icon.primary { background: var(--primary-glow); color: var(--primary); }
        .stat-icon.success { background: var(--success-bg); color: var(--success); }
        .stat-icon.warning { background: var(--warning-bg); color: var(--warning); }
        .stat-icon.purple  { background: var(--purple-bg); color: var(--purple); }
        .stat-icon.danger  { background: var(--danger-bg); color: var(--danger); }

        .stat-content {
            flex-grow: 1;
        }

        .stat-title {
            font-size: 13px;
            font-weight: 600;
            color: var(--text-muted);
            text-transform: uppercase;
            letter-spacing: 0.04em;
        }

        .stat-value {
            font-size: 26px;
            font-weight: 800;
            color: var(--text-main);
            line-height: 1.2;
            margin: 4px 0 2px;
            letter-spacing: -0.02em;
        }

        .stat-sub {
            font-size: 12px;
            color: var(--text-light);
            display: flex;
            align-items: center;
            gap: 4px;
        }

        /* Action & Filter Toolbar */
        .toolbar {
            background: var(--bg-card);
            backdrop-filter: var(--glass-blur);
            -webkit-backdrop-filter: var(--glass-blur);
            border: 1px solid var(--border-color);
            border-radius: 16px;
            padding: 18px 20px;
            margin-bottom: 24px;
            box-shadow: var(--card-shadow);
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            justify-content: space-between;
            gap: 16px;
        }

        .search-filter-group {
            display: flex;
            align-items: center;
            gap: 12px;
            flex-wrap: wrap;
            flex: 1 1 500px;
        }

        .search-box {
            position: relative;
            flex: 1 1 240px;
            min-width: 200px;
        }

        .search-box svg {
            position: absolute;
            left: 14px;
            top: 50%;
            transform: translateY(-50%);
            width: 18px;
            height: 18px;
            color: var(--text-light);
            pointer-events: none;
        }

        .search-input {
            width: 100%;
            padding: 10px 14px 10px 42px;
            background: var(--bg-input);
            border: 1px solid var(--border-color);
            border-radius: 10px;
            color: var(--text-main);
            font-size: 14px;
            outline: none;
            transition: all 0.2s ease;
        }

        .search-input:focus {
            border-color: var(--border-focus);
            box-shadow: 0 0 0 3px var(--primary-glow);
        }

        .filter-select {
            padding: 10px 14px;
            background: var(--bg-input);
            border: 1px solid var(--border-color);
            border-radius: 10px;
            color: var(--text-main);
            font-size: 14px;
            outline: none;
            cursor: pointer;
            transition: all 0.2s ease;
        }

        .filter-select:focus {
            border-color: var(--border-focus);
        }

        .action-btn-group {
            display: flex;
            align-items: center;
            gap: 10px;
            flex-wrap: wrap;
        }

        .btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            padding: 10px 18px;
            border-radius: 10px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            border: none;
            outline: none;
            transition: all 0.2s ease;
            text-decoration: none;
            white-space: nowrap;
        }

        .btn svg {
            width: 18px;
            height: 18px;
        }

        .btn-primary {
            background: var(--primary-gradient);
            color: #fff;
            box-shadow: 0 4px 14px var(--primary-glow);
        }

        .btn-primary:hover {
            box-shadow: 0 6px 20px var(--primary-glow);
            transform: translateY(-1px);
        }

        .btn-secondary {
            background: var(--bg-surface);
            color: var(--text-main);
            border: 1px solid var(--border-color);
        }

        .btn-secondary:hover {
            background: var(--bg-card-hover);
            border-color: var(--border-focus);
            transform: translateY(-1px);
        }

        /* Table Card Container */
        .table-card {
            background: var(--bg-card);
            backdrop-filter: var(--glass-blur);
            -webkit-backdrop-filter: var(--glass-blur);
            border: 1px solid var(--border-color);
            border-radius: 16px;
            overflow: hidden;
            box-shadow: var(--card-shadow);
        }

        .table-header-info {
            padding: 18px 24px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            border-bottom: 1px solid var(--border-color);
            background: var(--bg-surface);
        }

        .table-title {
            font-size: 16px;
            font-weight: 700;
            color: var(--text-main);
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .table-count-badge {
            font-size: 12px;
            font-weight: 600;
            background: var(--primary-glow);
            color: var(--primary);
            padding: 2px 10px;
            border-radius: 20px;
        }

        .table-responsive {
            width: 100%;
            overflow-x: auto;
        }

        table {
            width: 100%;
            border-collapse: collapse;
            text-align: left;
        }

        thead th {
            background: var(--bg-surface);
            color: var(--text-muted);
            font-size: 12px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            padding: 14px 20px;
            border-bottom: 1px solid var(--border-color);
            white-space: nowrap;
        }

        tbody tr {
            border-bottom: 1px solid var(--border-color);
            transition: background-color 0.15s ease;
        }

        tbody tr:last-child {
            border-bottom: none;
        }

        tbody tr:hover {
            background-color: var(--bg-card-hover);
        }

        tbody td {
            padding: 16px 20px;
            font-size: 14px;
            color: var(--text-main);
            vertical-align: middle;
        }

        /* Custom Student Cells */
        .student-cell {
            display: flex;
            align-items: center;
            gap: 12px;
        }

        .student-avatar {
            width: 40px;
            height: 40px;
            border-radius: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 700;
            font-size: 15px;
            color: #fff;
            flex-shrink: 0;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
        }

        .student-info-name {
            font-weight: 600;
            color: var(--text-main);
            font-size: 14px;
        }

        .student-code-badge {
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
            background: var(--bg-surface);
            border: 1px solid var(--border-color);
            padding: 4px 10px;
            border-radius: 8px;
            font-size: 13px;
            font-weight: 600;
            color: var(--primary);
            display: inline-flex;
            align-items: center;
            gap: 6px;
            cursor: pointer;
            transition: all 0.2s ease;
        }

        .student-code-badge:hover {
            border-color: var(--primary);
            background: var(--primary-glow);
        }

        .class-badge {
            display: inline-block;
            background: var(--bg-surface);
            border: 1px solid var(--border-color);
            color: var(--text-muted);
            padding: 4px 10px;
            border-radius: 8px;
            font-size: 13px;
            font-weight: 600;
        }

        .score-pill {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            font-weight: 800;
            font-size: 16px;
        }

        /* Grade Badges */
        .grade-tag {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 700;
            letter-spacing: 0.02em;
        }

        .grade-excellent { background: var(--purple-bg); color: var(--purple); border: 1px solid rgba(168, 85, 247, 0.3); }
        .grade-good      { background: var(--success-bg); color: var(--success); border: 1px solid rgba(16, 185, 129, 0.3); }
        .grade-fair      { background: var(--info-bg); color: var(--info); border: 1px solid rgba(14, 165, 233, 0.3); }
        .grade-average   { background: var(--warning-bg); color: var(--warning); border: 1px solid rgba(245, 158, 11, 0.3); }
        .grade-poor      { background: var(--danger-bg); color: var(--danger); border: 1px solid rgba(239, 68, 68, 0.3); }

        .action-icons {
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .btn-icon {
            width: 34px;
            height: 34px;
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            border: 1px solid var(--border-color);
            background: var(--bg-surface);
            cursor: pointer;
            transition: all 0.2s ease;
            color: var(--text-muted);
        }

        .btn-icon svg {
            width: 16px;
            height: 16px;
        }

        .btn-icon.edit:hover {
            color: var(--primary);
            border-color: var(--primary);
            background: var(--primary-glow);
        }

        .btn-icon.delete:hover {
            color: var(--danger);
            border-color: var(--danger);
            background: var(--danger-bg);
        }

        /* Empty State */
        .empty-state {
            padding: 60px 20px;
            text-align: center;
            color: var(--text-muted);
        }

        .empty-icon {
            width: 64px;
            height: 64px;
            margin: 0 auto 16px;
            color: var(--text-light);
            opacity: 0.7;
        }

        .empty-state h3 {
            font-size: 18px;
            color: var(--text-main);
            margin-bottom: 6px;
        }

        .empty-state p {
            font-size: 14px;
            max-width: 400px;
            margin: 0 auto 20px;
        }

        /* Modal Backdrop & Dialog */
        .modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.65);
            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
            z-index: 100;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
            opacity: 0;
            visibility: hidden;
            transition: all 0.25s ease;
        }

        .modal-overlay.active {
            opacity: 1;
            visibility: visible;
        }

        .modal-card {
            background: var(--bg-card);
            border: 1px solid var(--border-color);
            border-radius: 20px;
            width: 100%;
            max-width: 520px;
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
            transform: scale(0.95) translateY(10px);
            transition: transform 0.25s ease;
            overflow: hidden;
        }

        .modal-overlay.active .modal-card {
            transform: scale(1) translateY(0);
        }

        .modal-header {
            padding: 20px 24px;
            border-bottom: 1px solid var(--border-color);
            display: flex;
            align-items: center;
            justify-content: space-between;
            background: var(--bg-surface);
        }

        .modal-header h3 {
            font-size: 18px;
            font-weight: 700;
            color: var(--text-main);
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .btn-close-modal {
            background: transparent;
            border: none;
            color: var(--text-muted);
            cursor: pointer;
            font-size: 20px;
            padding: 4px;
            border-radius: 6px;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .btn-close-modal:hover {
            color: var(--text-main);
            background: var(--border-color);
        }

        .modal-body {
            padding: 24px;
        }

        .form-group {
            margin-bottom: 18px;
        }

        .form-group label {
            display: block;
            font-size: 13px;
            font-weight: 600;
            color: var(--text-muted);
            margin-bottom: 6px;
        }

        .input-group-custom {
            position: relative;
        }

        .input-group-custom svg {
            position: absolute;
            left: 14px;
            top: 50%;
            transform: translateY(-50%);
            width: 18px;
            height: 18px;
            color: var(--text-light);
        }

        .input-control {
            width: 100%;
            padding: 12px 14px 12px 42px;
            background: var(--bg-input);
            border: 1px solid var(--border-color);
            border-radius: 10px;
            color: var(--text-main);
            font-size: 14px;
            outline: none;
            transition: all 0.2s ease;
        }

        .input-control:focus {
            border-color: var(--border-focus);
            box-shadow: 0 0 0 3px var(--primary-glow);
        }

        .score-preview-badge {
            margin-top: 8px;
            display: inline-flex;
            align-items: center;
            gap: 6px;
            font-size: 12px;
            font-weight: 600;
        }

        .modal-footer {
            padding: 16px 24px;
            border-top: 1px solid var(--border-color);
            background: var(--bg-surface);
            display: flex;
            justify-content: flex-end;
            gap: 12px;
        }

        /* Toast notifications */
        .toast-container {
            position: fixed;
            top: 24px;
            right: 24px;
            z-index: 200;
            display: flex;
            flex-direction: column;
            gap: 10px;
            pointer-events: none;
        }

        .toast {
            background: var(--bg-card);
            border: 1px solid var(--border-color);
            box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.4);
            border-radius: 12px;
            padding: 14px 20px;
            display: flex;
            align-items: center;
            gap: 12px;
            color: var(--text-main);
            font-size: 14px;
            font-weight: 600;
            animation: slide-in 0.3s cubic-bezier(0.16, 1, 0.3, 1);
            pointer-events: auto;
        }

        @keyframes slide-in {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }

        .toast svg {
            width: 20px;
            height: 20px;
            flex-shrink: 0;
        }

        /* Footer */
        .app-footer {
            margin-top: 40px;
            text-align: center;
            color: var(--text-light);
            font-size: 13px;
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        .footer-badges {
            display: flex;
            justify-content: center;
            gap: 8px;
            flex-wrap: wrap;
        }

        .tech-pill {
            background: var(--bg-surface);
            border: 1px solid var(--border-color);
            padding: 3px 10px;
            border-radius: 6px;
            font-size: 11px;
            font-weight: 600;
            color: var(--text-muted);
        }

        /* Print styles */
        @media print {
            body { background: #fff !important; color: #000 !important; }
            body::before, .navbar, .toolbar, .action-icons, .modal-overlay, .toast-container, .app-footer, .btn-submit-row {
                display: none !important;
            }
            .table-card { border: 1px solid #ccc !important; box-shadow: none !important; }
            table { width: 100% !important; }
            th, td { border: 1px solid #ccc !important; color: #000 !important; }
        }

        @media (max-width: 768px) {
            .nav-container { flex-direction: column; align-items: stretch; gap: 12px; }
            .nav-actions { justify-content: space-between; }
            .toolbar { flex-direction: column; align-items: stretch; }
            .search-filter-group { flex-direction: column; align-items: stretch; }
            .action-btn-group { justify-content: space-between; }
        }
    </style>
</head>
<body>

    <!-- Sticky Navigation Bar -->
    <header class="navbar">
        <div class="nav-container">
            <a href="/" class="brand-group">
                <div class="brand-logo">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M22 10v6M2 10l10-5 10 5-10 5z"/>
                        <path d="M6 12v5c3 3 9 3 12 0v-5"/>
                    </svg>
                </div>
                <div class="brand-text">
                    <h1>QLSV PRO <span class="brand-badge">Đề 2</span></h1>
                    <p>Hệ thống Quản lý Sinh viên & Giám sát Hạ tầng</p>
                </div>
            </a>

            <div class="nav-actions">
                <div class="status-pill" title="Hệ quản trị CSDL MySQL">
                    <div class="status-dot"></div>
                    <span>MySQL: Connected</span>
                </div>

                <a href="/phpmyadmin/" target="_blank" class="btn-nav-link" title="Mở trang quản trị CSDL">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <ellipse cx="12" cy="5" rx="9" ry="3"></ellipse>
                        <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path>
                        <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path>
                    </svg>
                    phpMyAdmin
                </a>

                <a href="http://localhost:3001" target="_blank" class="btn-nav-link" title="Mở Grafana Dashboard">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="20" x2="18" y2="10"></line>
                        <line x1="12" y1="20" x2="12" y2="4"></line>
                        <line x1="6" y1="20" x2="6" y2="14"></line>
                    </svg>
                    Grafana (3001)
                </a>

                <button id="themeToggleBtn" class="theme-toggle" title="Đổi giao diện Sáng / Tối">
                    <svg id="themeIconDark" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
                    </svg>
                    <svg id="themeIconLight" style="display:none;" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="5"></circle>
                        <line x1="12" y1="1" x2="12" y2="3"></line>
                        <line x1="12" y1="21" x2="12" y2="23"></line>
                        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                        <line x1="1" y1="12" x2="3" y2="12"></line>
                        <line x1="21" y1="12" x2="23" y2="12"></line>
                        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
                    </svg>
                </button>
            </div>
        </div>
    </header>

    <main class="main-layout">

        <!-- Top Statistics Cards -->
        <section class="stats-grid">
            <div class="stat-card">
                <div class="stat-icon primary">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                        <circle cx="9" cy="7" r="4"></circle>
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                        <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                    </svg>
                </div>
                <div class="stat-content">
                    <div class="stat-title">Tổng sinh viên</div>
                    <div class="stat-value" id="kpiTotal">${totalStudents}</div>
                    <div class="stat-sub">Hồ sơ trong hệ thống</div>
                </div>
            </div>

            <div class="stat-card">
                <div class="stat-icon purple">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="8" r="7"></circle>
                        <polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"></polyline>
                    </svg>
                </div>
                <div class="stat-content">
                    <div class="stat-title">Điểm trung bình</div>
                    <div class="stat-value" style="color: ${avgScore >= 6.5 ? 'var(--success)' : avgScore >= 5.0 ? 'var(--warning)' : 'var(--danger)'};">${avgScore}</div>
                    <div class="stat-sub">Thang điểm 10.0</div>
                </div>
            </div>

            <div class="stat-card">
                <div class="stat-icon success">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                        <polyline points="22 4 12 14.01 9 11.01"></polyline>
                    </svg>
                </div>
                <div class="stat-content">
                    <div class="stat-title">Tỉ lệ đạt (≥ 5.0)</div>
                    <div class="stat-value" style="color: var(--success);">${passRate}%</div>
                    <div class="stat-sub">${passCount}/${totalStudents} sinh viên qua môn</div>
                </div>
            </div>

            <div class="stat-card">
                <div class="stat-icon warning">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                    </svg>
                </div>
                <div class="stat-content">
                    <div class="stat-title">Giỏi & Xuất sắc (≥ 8)</div>
                    <div class="stat-value" style="color: var(--warning);">${excellentCount}</div>
                    <div class="stat-sub">Chiếm ${totalStudents > 0 ? ((excellentCount/totalStudents)*100).toFixed(0) : 0}% tổng số</div>
                </div>
            </div>

            <div class="stat-card">
                <div class="stat-icon danger">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                        <line x1="12" y1="9" x2="12" y2="13"></line>
                        <line x1="12" y1="17" x2="12.01" y2="17"></line>
                    </svg>
                </div>
                <div class="stat-content">
                    <div class="stat-title">Cần cải thiện (< 5)</div>
                    <div class="stat-value" style="color: var(--danger);">${poorCount}</div>
                    <div class="stat-sub">Cần hỗ trợ học tập</div>
                </div>
            </div>
        </section>

        <!-- Controls Toolbar -->
        <section class="toolbar">
            <div class="search-filter-group">
                <div class="search-box">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="11" cy="11" r="8"></circle>
                        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                    </svg>
                    <input type="text" id="searchInput" class="search-input" placeholder="Tìm theo Tên, Mã SV hoặc Lớp..." autofocus autocomplete="off">
                </div>

                <select id="classFilter" class="filter-select">
                    <option value="">🏫 Tất cả các lớp</option>
                    ${classList.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('')}
                </select>

                <select id="gradeFilter" class="filter-select">
                    <option value="">🎯 Tất cả học lực</option>
                    <option value="excellent">🌟 Xuất sắc (≥ 9.0)</option>
                    <option value="good">🏆 Giỏi (8.0 - 8.9)</option>
                    <option value="fair">🎯 Khá (6.5 - 7.9)</option>
                    <option value="average">📚 Trung bình (5.0 - 6.4)</option>
                    <option value="poor">⚠️ Yếu (< 5.0)</option>
                </select>

                <select id="sortBy" class="filter-select">
                    <option value="newest">⏱️ Mới nhất</option>
                    <option value="score_desc">📈 Điểm cao nhất</option>
                    <option value="score_asc">📉 Điểm thấp nhất</option>
                    <option value="name_asc">🔤 Tên (A - Z)</option>
                    <option value="code_asc">🔢 Mã sinh viên</option>
                </select>
            </div>

            <div class="action-btn-group">
                <button id="openAddModalBtn" class="btn btn-primary">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="12" y1="5" x2="12" y2="19"></line>
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                    </svg>
                    Thêm sinh viên
                </button>

                <button id="exportCsvBtn" class="btn btn-secondary" title="Tải xuống tệp CSV">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="7 10 12 15 17 10"></polyline>
                        <line x1="12" y1="15" x2="12" y2="3"></line>
                    </svg>
                    Xuất CSV
                </button>

                <button onclick="window.print()" class="btn btn-secondary" title="In danh sách">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="6 9 6 2 18 2 18 9"></polyline>
                        <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
                        <rect x="6" y="14" width="12" height="8"></rect>
                    </svg>
                    In
                </button>

                ${totalStudents === 0 ? `
                <form action="/seed" method="POST" style="display:inline;">
                    <button type="submit" class="btn btn-secondary" style="border-color: var(--primary); color: var(--primary);" title="Thêm 5 bản ghi mẫu">
                        ⚡ Thêm dữ liệu mẫu
                    </button>
                </form>
                ` : ''}
            </div>
        </section>

        <!-- Main Data Table -->
        <section class="table-card">
            <div class="table-header-info">
                <div class="table-title">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                        <line x1="16" y1="13" x2="8" y2="13"></line>
                        <line x1="16" y1="17" x2="8" y2="17"></line>
                        <polyline points="10 9 9 9 8 9"></polyline>
                    </svg>
                    Danh sách Sinh viên
                    <span id="filteredCountBadge" class="table-count-badge">${totalStudents} sinh viên</span>
                </div>
            </div>

            <div class="table-responsive">
                <table id="studentsTable">
                    <thead>
                        <tr>
                            <th style="width: 50px;">#</th>
                            <th>Mã Sinh Viên</th>
                            <th>Họ và Tên</th>
                            <th>Lớp</th>
                            <th>Điểm số</th>
                            <th>Xếp loại</th>
                            <th style="text-align: right; width: 110px;">Thao tác</th>
                        </tr>
                    </thead>
                    <tbody id="studentsTableBody">
                        <!-- Populated by JavaScript -->
                    </tbody>
                </table>
            </div>

            <div id="emptyState" class="empty-state" style="display: none;">
                <svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <circle cx="12" cy="12" r="10"></circle>
                    <path d="M16 16s-1.5-2-4-2-4 2-4 2"></path>
                    <line x1="9" y1="9" x2="9.01" y2="9"></line>
                    <line x1="15" y1="9" x2="15.01" y2="9"></line>
                </svg>
                <h3>Không tìm thấy sinh viên nào</h3>
                <p>Thử tìm kiếm với từ khóa khác hoặc bấm nút thêm mới để tạo hồ sơ sinh viên.</p>
                <button class="btn btn-primary" onclick="openAddModal()">
                    Thêm sinh viên mới
                </button>
            </div>
        </section>

        <footer class="app-footer">
            <p>Hệ thống Quản lý Sinh viên & Giám sát - Đề 2 &copy; 2026</p>
            <div class="footer-badges">
                <span class="tech-pill">Node.js Express</span>
                <span class="tech-pill">MySQL 8.0</span>
                <span class="tech-pill">Nginx SSL Reverse Proxy</span>
                <span class="tech-pill">Prometheus</span>
                <span class="tech-pill">Grafana</span>
                <span class="tech-pill">Loki & Promtail</span>
            </div>
        </footer>

    </main>

    <!-- Modal: Thêm Sinh viên Mới -->
    <div id="addModal" class="modal-overlay">
        <div class="modal-card">
            <div class="modal-header">
                <h3>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                        <circle cx="8.5" cy="7" r="4"></circle>
                        <line x1="20" y1="8" x2="20" y2="14"></line>
                        <line x1="23" y1="11" x2="17" y2="11"></line>
                    </svg>
                    Thêm Sinh Viên Mới
                </h3>
                <button type="button" class="btn-close-modal" onclick="closeAddModal()">&times;</button>
            </div>
            <form action="/add" method="POST">
                <div class="modal-body">
                    <div class="form-group">
                        <label for="add_student_code">Mã Sinh Viên *</label>
                        <div class="input-group-custom">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <rect x="3" y="4" width="18" height="16" rx="2"></rect>
                                <line x1="7" y1="8" x2="17" y2="8"></line>
                                <line x1="7" y1="12" x2="17" y2="12"></line>
                                <line x1="7" y1="16" x2="13" y2="16"></line>
                            </svg>
                            <input type="text" id="add_student_code" name="student_code" class="input-control" placeholder="VD: B21DCCN001" required autocomplete="off">
                        </div>
                    </div>

                    <div class="form-group">
                        <label for="add_full_name">Họ và Tên *</label>
                        <div class="input-group-custom">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                                <circle cx="12" cy="7" r="4"></circle>
                            </svg>
                            <input type="text" id="add_full_name" name="full_name" class="input-control" placeholder="VD: Nguyễn Văn An" required autocomplete="off">
                        </div>
                    </div>

                    <div class="form-group">
                        <label for="add_class_name">Lớp Học *</label>
                        <div class="input-group-custom">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
                            </svg>
                            <input type="text" id="add_class_name" name="class_name" class="input-control" placeholder="VD: D21CQCN01" required autocomplete="off">
                        </div>
                    </div>

                    <div class="form-group">
                        <label for="add_score">Điểm Tổng Kết (0 - 10) *</label>
                        <div class="input-group-custom">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="12" cy="12" r="10"></circle>
                                <polyline points="12 6 12 12 14 14"></polyline>
                            </svg>
                            <input type="number" id="add_score" name="score" step="0.1" min="0" max="10" class="input-control" placeholder="VD: 8.5" required oninput="previewGrade(this.value, 'addGradePreview')">
                        </div>
                        <div id="addGradePreview" class="score-preview-badge"></div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" onclick="closeAddModal()">Hủy</button>
                    <button type="submit" class="btn btn-primary">➕ Thêm Sinh Viên</button>
                </div>
            </form>
        </div>
    </div>

    <!-- Modal: Chỉnh sửa Sinh viên -->
    <div id="editModal" class="modal-overlay">
        <div class="modal-card">
            <div class="modal-header">
                <h3>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M12 20h9"></path>
                        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                    </svg>
                    Chỉnh Sửa Thông Tin Sinh Viên
                </h3>
                <button type="button" class="btn-close-modal" onclick="closeEditModal()">&times;</button>
            </div>
            <form id="editForm" method="POST">
                <div class="modal-body">
                    <div class="form-group">
                        <label for="edit_student_code">Mã Sinh Viên *</label>
                        <div class="input-group-custom">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <rect x="3" y="4" width="18" height="16" rx="2"></rect>
                                <line x1="7" y1="8" x2="17" y2="8"></line>
                                <line x1="7" y1="12" x2="17" y2="12"></line>
                                <line x1="7" y1="16" x2="13" y2="16"></line>
                            </svg>
                            <input type="text" id="edit_student_code" name="student_code" class="input-control" required autocomplete="off">
                        </div>
                    </div>

                    <div class="form-group">
                        <label for="edit_full_name">Họ và Tên *</label>
                        <div class="input-group-custom">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                                <circle cx="12" cy="7" r="4"></circle>
                            </svg>
                            <input type="text" id="edit_full_name" name="full_name" class="input-control" required autocomplete="off">
                        </div>
                    </div>

                    <div class="form-group">
                        <label for="edit_class_name">Lớp Học *</label>
                        <div class="input-group-custom">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
                            </svg>
                            <input type="text" id="edit_class_name" name="class_name" class="input-control" required autocomplete="off">
                        </div>
                    </div>

                    <div class="form-group">
                        <label for="edit_score">Điểm Tổng Kết (0 - 10) *</label>
                        <div class="input-group-custom">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="12" cy="12" r="10"></circle>
                                <polyline points="12 6 12 12 14 14"></polyline>
                            </svg>
                            <input type="number" id="edit_score" name="score" step="0.1" min="0" max="10" class="input-control" required oninput="previewGrade(this.value, 'editGradePreview')">
                        </div>
                        <div id="editGradePreview" class="score-preview-badge"></div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" onclick="closeEditModal()">Hủy</button>
                    <button type="submit" class="btn btn-primary">💾 Lưu Thay Đổi</button>
                </div>
            </form>
        </div>
    </div>

    <!-- Modal: Xác nhận Xóa -->
    <div id="deleteModal" class="modal-overlay">
        <div class="modal-card">
            <div class="modal-header">
                <h3 style="color: var(--danger);">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                        <line x1="12" y1="9" x2="12" y2="13"></line>
                        <line x1="12" y1="17" x2="12.01" y2="17"></line>
                    </svg>
                    Xác nhận Xóa Sinh Viên
                </h3>
                <button type="button" class="btn-close-modal" onclick="closeDeleteModal()">&times;</button>
            </div>
            <form id="deleteForm" method="POST">
                <div class="modal-body">
                    <p style="font-size: 15px; color: var(--text-main); line-height: 1.6;">
                        Bạn có chắc chắn muốn xóa sinh viên <strong id="deleteStudentName" style="color: var(--danger);"></strong> (Mã SV: <span id="deleteStudentCode" style="font-family: monospace;"></span>) khỏi hệ thống không?
                    </p>
                    <p style="font-size: 13px; color: var(--text-muted); margin-top: 8px;">
                        ⚠️ Hành động này sẽ xóa dữ liệu vĩnh viễn khỏi cơ sở dữ liệu MySQL và không thể hoàn tác.
                    </p>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" onclick="closeDeleteModal()">Hủy</button>
                    <button type="submit" class="btn" style="background: var(--danger); color: #fff;">🗑️ Xóa Vĩnh Viễn</button>
                </div>
            </form>
        </div>
    </div>

    <!-- Toast Notification Container -->
    <div id="toastContainer" class="toast-container"></div>

    <script>
        // Initial Dataset passed from Server
        const rawStudents = ${clientDataJson};

        // Colorful avatar background generator based on name
        const avatarColors = [
            'linear-gradient(135deg, #4f46e5, #06b6d4)',
            'linear-gradient(135deg, #ec4899, #8b5cf6)',
            'linear-gradient(135deg, #10b981, #059669)',
            'linear-gradient(135deg, #f59e0b, #d97706)',
            'linear-gradient(135deg, #3b82f6, #1d4ed8)',
            'linear-gradient(135deg, #8b5cf6, #6d28d9)',
            'linear-gradient(135deg, #06b6d4, #0891b2)',
            'linear-gradient(135deg, #14b8a6, #0f766e)'
        ];

        function getAvatarColor(name) {
            let hash = 0;
            for (let i = 0; i < name.length; i++) {
                hash = name.charCodeAt(i) + ((hash << 5) - hash);
            }
            return avatarColors[Math.abs(hash) % avatarColors.length];
        }

        function getInitials(name) {
            const parts = name.trim().split(/\\s+/);
            if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
            return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
        }

        function getGradeInfo(score) {
            if (score >= 9.0) return { label: 'Xuất sắc', class: 'grade-excellent', icon: '🌟', key: 'excellent' };
            if (score >= 8.0) return { label: 'Giỏi', class: 'grade-good', icon: '🏆', key: 'good' };
            if (score >= 6.5) return { label: 'Khá', class: 'grade-fair', icon: '🎯', key: 'fair' };
            if (score >= 5.0) return { label: 'Trung bình', class: 'grade-average', icon: '📚', key: 'average' };
            return { label: 'Yếu', class: 'grade-poor', icon: '⚠️', key: 'poor' };
        }

        function previewGrade(val, targetId) {
            const el = document.getElementById(targetId);
            const score = parseFloat(val);
            if (isNaN(score) || score < 0 || score > 10) {
                el.innerHTML = '';
                return;
            }
            const info = getGradeInfo(score);
            el.innerHTML = '<span class="grade-tag ' + info.class + '">' + info.icon + ' ' + info.label + '</span>';
        }

        // Render Table Rows with Search, Filter & Sort
        function renderStudents() {
            const search = document.getElementById('searchInput').value.trim().toLowerCase();
            const classFilter = document.getElementById('classFilter').value;
            const gradeFilter = document.getElementById('gradeFilter').value;
            const sortBy = document.getElementById('sortBy').value;

            let filtered = rawStudents.filter(s => {
                const matchSearch = !search || 
                    s.student_code.toLowerCase().includes(search) || 
                    s.full_name.toLowerCase().includes(search) || 
                    s.class_name.toLowerCase().includes(search);
                
                const matchClass = !classFilter || s.class_name === classFilter;
                
                const gradeInfo = getGradeInfo(s.score);
                const matchGrade = !gradeFilter || gradeInfo.key === gradeFilter;

                return matchSearch && matchClass && matchGrade;
            });

            // Sorting
            filtered.sort((a, b) => {
                if (sortBy === 'newest') return b.id - a.id;
                if (sortBy === 'score_desc') return b.score - a.score;
                if (sortBy === 'score_asc') return a.score - b.score;
                if (sortBy === 'name_asc') return a.full_name.localeCompare(b.full_name, 'vi');
                if (sortBy === 'code_asc') return a.student_code.localeCompare(b.student_code);
                return b.id - a.id;
            });

            const tbody = document.getElementById('studentsTableBody');
            const emptyState = document.getElementById('emptyState');
            const table = document.getElementById('studentsTable');
            const countBadge = document.getElementById('filteredCountBadge');

            countBadge.innerText = filtered.length + ' sinh viên';

            if (filtered.length === 0) {
                tbody.innerHTML = '';
                table.style.display = 'none';
                emptyState.style.display = 'block';
                return;
            }

            table.style.display = 'table';
            emptyState.style.display = 'none';

            let html = '';
            filtered.forEach((s, idx) => {
                const grade = getGradeInfo(s.score);
                const avatarBg = getAvatarColor(s.full_name);
                const initials = getInitials(s.full_name);
                const scoreColor = s.score >= 8.0 ? 'var(--success)' : s.score >= 5.0 ? 'var(--primary)' : 'var(--danger)';

                html += '<tr>' +
                    '<td style="color: var(--text-light); font-weight: 600;">' + (idx + 1) + '</td>' +
                    '<td><span class="student-code-badge" onclick="copyCode(\\'' + s.student_code + '\\')" title="Nhấn để sao chép">' +
                        s.student_code +
                        '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>' +
                    '</span></td>' +
                    '<td>' +
                        '<div class="student-cell">' +
                            '<div class="student-avatar" style="background: ' + avatarBg + ';">' + initials + '</div>' +
                            '<div class="student-info-name">' + escapeHtml(s.full_name) + '</div>' +
                        '</div>' +
                    '</td>' +
                    '<td><span class="class-badge">' + escapeHtml(s.class_name) + '</span></td>' +
                    '<td><div class="score-pill" style="color: ' + scoreColor + ';">' + s.score.toFixed(1) + '</div></td>' +
                    '<td><span class="grade-tag ' + grade.class + '">' + grade.icon + ' ' + grade.label + '</span></td>' +
                    '<td style="text-align: right;">' +
                        '<div class="action-icons" style="justify-content: flex-end;">' +
                            '<button class="btn-icon edit" onclick="openEditModal(' + s.id + ')" title="Chỉnh sửa thông tin">' +
                                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>' +
                            '</button>' +
                            '<button class="btn-icon delete" onclick="openDeleteModal(' + s.id + ', \\'' + escapeJs(s.full_name) + '\\', \\'' + escapeJs(s.student_code) + '\\')" title="Xóa sinh viên">' +
                                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>' +
                            '</button>' +
                        '</div>' +
                    '</td>' +
                '</tr>';
            });

            tbody.innerHTML = html;
        }

        function escapeHtml(str) {
            return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        }

        function escapeJs(str) {
            return String(str).replace(/\\\\/g, '\\\\\\\\').replace(/'/g, "\\\\'");
        }

        function copyCode(code) {
            navigator.clipboard.writeText(code).then(() => {
                showToast('Đã sao chép mã sinh viên: ' + code, 'success');
            }).catch(() => {
                showToast('Mã SV: ' + code, 'info');
            });
        }

        // Modals Management
        function openAddModal() {
            document.getElementById('addModal').classList.add('active');
            document.getElementById('add_student_code').focus();
        }

        function closeAddModal() {
            document.getElementById('addModal').classList.remove('active');
        }

        function openEditModal(id) {
            const student = rawStudents.find(s => s.id === id);
            if (!student) return;
            document.getElementById('edit_student_code').value = student.student_code;
            document.getElementById('edit_full_name').value = student.full_name;
            document.getElementById('edit_class_name').value = student.class_name;
            document.getElementById('edit_score').value = student.score;
            previewGrade(student.score, 'editGradePreview');
            document.getElementById('editForm').action = '/edit/' + id;
            document.getElementById('editModal').classList.add('active');
        }

        function closeEditModal() {
            document.getElementById('editModal').classList.remove('active');
        }

        function openDeleteModal(id, name, code) {
            document.getElementById('deleteStudentName').innerText = name;
            document.getElementById('deleteStudentCode').innerText = code;
            document.getElementById('deleteForm').action = '/delete/' + id;
            document.getElementById('deleteModal').classList.add('active');
        }

        function closeDeleteModal() {
            document.getElementById('deleteModal').classList.remove('active');
        }

        // Close modal on click outside
        window.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal-overlay')) {
                e.target.classList.remove('active');
            }
        });

        // Close on ESC key
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                closeAddModal();
                closeEditModal();
                closeDeleteModal();
            }
        });

        // Toast notifications
        function showToast(message, type = 'success') {
            const container = document.getElementById('toastContainer');
            const toast = document.createElement('div');
            toast.className = 'toast';
            const color = type === 'success' ? 'var(--success)' : type === 'danger' ? 'var(--danger)' : 'var(--primary)';
            toast.style.borderColor = color;
            toast.innerHTML = 
                '<svg viewBox="0 0 24 24" fill="none" stroke="' + color + '" stroke-width="2">' +
                    (type === 'danger' 
                        ? '<circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line>' 
                        : '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline>') +
                '</svg>' +
                '<span>' + message + '</span>';
            container.appendChild(toast);
            setTimeout(() => {
                toast.style.opacity = '0';
                toast.style.transform = 'translateY(-10px)';
                toast.style.transition = 'all 0.3s ease';
                setTimeout(() => toast.remove(), 300);
            }, 3500);
        }

        // Export to CSV
        document.getElementById('exportCsvBtn').addEventListener('click', () => {
            if (rawStudents.length === 0) {
                showToast('Chưa có dữ liệu để xuất CSV!', 'danger');
                return;
            }
            let csv = '\\uFEFFSTT,Mã Sinh Viên,Họ và Tên,Lớp,Điểm Số,Xếp Loại\\n';
            rawStudents.forEach((s, idx) => {
                const grade = getGradeInfo(s.score).label;
                csv += \`\${idx + 1},"\${s.student_code}","\${s.full_name}","\${s.class_name}",\${s.score},"\${grade}"\\n\`;
            });
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'Danh_sach_sinh_vien_' + new Date().toISOString().slice(0,10) + '.csv';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            showToast('Đã xuất danh sách sinh viên ra tệp CSV!');
        });

        // Theme management
        const themeBtn = document.getElementById('themeToggleBtn');
        const themeDarkIcon = document.getElementById('themeIconDark');
        const themeLightIcon = document.getElementById('themeIconLight');

        function setTheme(theme) {
            document.documentElement.setAttribute('data-theme', theme);
            localStorage.setItem('qlsv_theme', theme);
            if (theme === 'light') {
                themeDarkIcon.style.display = 'none';
                themeLightIcon.style.display = 'block';
            } else {
                themeDarkIcon.style.display = 'block';
                themeLightIcon.style.display = 'none';
            }
        }

        const savedTheme = localStorage.getItem('qlsv_theme') || 'dark';
        setTheme(savedTheme);

        themeBtn.addEventListener('click', () => {
            const current = document.documentElement.getAttribute('data-theme');
            setTheme(current === 'light' ? 'dark' : 'light');
        });

        // Add Modal Trigger
        document.getElementById('openAddModalBtn').addEventListener('click', openAddModal);

        // Filter & Search Events
        document.getElementById('searchInput').addEventListener('input', renderStudents);
        document.getElementById('classFilter').addEventListener('change', renderStudents);
        document.getElementById('gradeFilter').addEventListener('change', renderStudents);
        document.getElementById('sortBy').addEventListener('change', renderStudents);

        // URL Query feedback
        const urlParams = new URLSearchParams(window.location.search);
        const status = urlParams.get('status');
        if (status === 'added') {
            showToast('Đã thêm sinh viên mới thành công!', 'success');
            window.history.replaceState({}, document.title, window.location.pathname);
        } else if (status === 'updated') {
            showToast('Đã cập nhật thông tin sinh viên!', 'success');
            window.history.replaceState({}, document.title, window.location.pathname);
        } else if (status === 'deleted') {
            showToast('Đã xóa sinh viên khỏi danh sách!', 'success');
            window.history.replaceState({}, document.title, window.location.pathname);
        } else if (status === 'seeded') {
            showToast('Đã tạo 5 hồ sơ sinh viên mẫu thành công!', 'success');
            window.history.replaceState({}, document.title, window.location.pathname);
        }

        // Initial render
        renderStudents();
    </script>
</body>
</html>`;

        res.send(html);
    } catch (e) {
        console.error("Dashboard error:", e);
        res.status(500).send("Lỗi kết nối CSDL: " + e.message);
    }
});

// Route: Thêm sinh viên mới
app.post('/add', async (req, res) => {
    try {
        const { student_code, full_name, class_name, score } = req.body;
        if (!student_code || !full_name || !class_name || score === undefined) {
            return res.status(400).send("Vui lòng điền đầy đủ thông tin.");
        }
        await pool.query(
            'INSERT INTO students (student_code, full_name, class_name, score) VALUES (?, ?, ?, ?)', 
            [student_code.trim(), full_name.trim(), class_name.trim(), parseFloat(score)]
        );
        res.redirect('/?status=added');
    } catch (e) {
        res.status(500).send("Lỗi thêm sinh viên: " + e.message);
    }
});

// Route: Cập nhật thông tin sinh viên
app.post('/edit/:id', async (req, res) => {
    try {
        const { student_code, full_name, class_name, score } = req.body;
        const id = req.params.id;
        await pool.query(
            'UPDATE students SET student_code = ?, full_name = ?, class_name = ?, score = ? WHERE id = ?',
            [student_code.trim(), full_name.trim(), class_name.trim(), parseFloat(score), id]
        );
        res.redirect('/?status=updated');
    } catch (e) {
        res.status(500).send("Lỗi cập nhật sinh viên: " + e.message);
    }
});

// Route: Xóa sinh viên
app.post('/delete/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM students WHERE id = ?', [req.params.id]);
        res.redirect('/?status=deleted');
    } catch (e) {
        res.status(500).send("Lỗi xóa sinh viên: " + e.message);
    }
});

// Route: Tạo dữ liệu mẫu (Sample data seeder)
app.post('/seed', async (req, res) => {
    try {
        const sampleStudents = [
            ['B21DCCN001', 'Nguyễn Văn An', 'D21CQCN01', 8.8],
            ['B21DCCN045', 'Trần Thị Mai', 'D21CQCN01', 9.2],
            ['B21DCAT012', 'Lê Hoàng Long', 'D21CQAT02', 7.5],
            ['B21DCVT088', 'Phạm Minh Tuấn', 'D21CQVT01', 5.8],
            ['B21DCCN102', 'Vũ Thị Ngọc Ánh', 'D21CQCN03', 4.2]
        ];

        for (const s of sampleStudents) {
            await pool.query(
                'INSERT INTO students (student_code, full_name, class_name, score) VALUES (?, ?, ?, ?)',
                s
            );
        }
        res.redirect('/?status=seeded');
    } catch (e) {
        res.status(500).send("Lỗi tạo dữ liệu mẫu: " + e.message);
    }
});

// Route: API lấy danh sách sinh viên dạng JSON
app.get('/api/students', async (req, res) => {
    try {
        if (!pool) return res.status(503).json({ error: 'DB not ready' });
        const [rows] = await pool.query('SELECT * FROM students ORDER BY id DESC');
        res.json(rows);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Route: Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', uptime: process.uptime() });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running on port ${port}`));
