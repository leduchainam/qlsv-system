const express = require('express');
const mysql = require('mysql2/promise');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Security & Authentication Configuration
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const SESSION_SECRET = process.env.SESSION_SECRET || 'qlsv_secure_session_token_key_2026';
const LOG_FILE_PATH = '/var/log/app/app.log';

// Structured Logger: ghi log có cấu trúc chuẩn JSON ra cả stdout và /var/log/app/app.log
function writeLog(level, event, data = {}) {
    const logEntry = {
        timestamp: new Date().toISOString(),
        level: level.toUpperCase(),
        event,
        ...data
    };
    const logString = JSON.stringify(logEntry);
    console.log(logString);
    try {
        fs.appendFileSync(LOG_FILE_PATH, logString + '\n');
    } catch (e) {
        // Bỏ qua nếu volume log chưa sẵn sàng
    }
}

// Token xác thực chống giả mạo bằng HMAC-SHA256 (Hiệu lực 24 giờ)
function createAuthToken(username) {
    const timestamp = Date.now();
    const payload = `${username}:${timestamp}`;
    const signature = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
    return `${payload}:${signature}`;
}

function verifyAuthToken(token) {
    if (!token || typeof token !== 'string') return null;
    const parts = token.split(':');
    if (parts.length !== 3) return null;
    const [username, timestamp, signature] = parts;
    const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(`${username}:${timestamp}`).digest('hex');
    if (signature !== expectedSig) return null;
    if (Date.now() - parseInt(timestamp, 10) > 24 * 60 * 60 * 1000) return null;
    return { username };
}

function getCookie(req, name) {
    const cookieHeader = req.headers.cookie;
    if (!cookieHeader) return null;
    const match = cookieHeader.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]*)'));
    return match ? decodeURIComponent(match[1]) : null;
}

function getAuthenticatedUser(req) {
    const token = getCookie(req, 'qlsv_session') || 
                  (req.headers.authorization && req.headers.authorization.replace(/^Bearer\s+/i, ''));
    return verifyAuthToken(token);
}

function getClientIp(req) {
    return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 
           req.headers['x-real-ip'] || 
           req.socket.remoteAddress || 
           '127.0.0.1';
}

// Middleware bảo vệ các thao tác ghi dữ liệu (RBAC)
function requireAdminAuth(req, res, next) {
    const user = getAuthenticatedUser(req);
    const clientIp = getClientIp(req);
    if (!user) {
        writeLog('WARN', 'UNAUTHORIZED_ACCESS_BLOCKED', {
            path: req.path,
            method: req.method,
            ip: clientIp,
            message: 'Truy cập trái phép bị từ chối (403 Forbidden): Yêu cầu đăng nhập Quản trị viên'
        });
        if (req.xhr || req.headers.accept?.includes('json')) {
            return res.status(403).json({
                success: false,
                error: 'Từ chối truy cập (403 Forbidden): Bạn cần đăng nhập tài khoản Quản trị viên để thực hiện thao tác này!'
            });
        }
        return res.status(403).redirect('/?status=unauthorized');
    }
    req.user = user;
    next();
}

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
            writeLog('INFO', 'DATABASE_INITIALIZED', { message: 'Database initialized successfully with utf8mb4' });
            break;
        } catch (err) {
            writeLog('WARN', 'DATABASE_WAITING', { retriesLeft: retries - 1, error: err.message });
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

        const currentUser = getAuthenticatedUser(req);
        const isAdmin = !!currentUser;

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

        /* Role badges & Auth buttons */
        .user-role-badge {
            display: inline-flex;
            align-items: center;
            gap: 7px;
            padding: 6px 13px;
            border-radius: 9999px;
            font-size: 13px;
            font-weight: 600;
            user-select: none;
        }

        .user-role-badge.guest {
            background: rgba(148, 163, 184, 0.12);
            color: var(--text-muted);
            border: 1px solid rgba(148, 163, 184, 0.25);
        }

        .user-role-badge.admin {
            background: rgba(16, 185, 129, 0.15);
            color: var(--success);
            border: 1px solid rgba(16, 185, 129, 0.35);
        }

        .role-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
        }

        .role-dot.guest {
            background: #94a3b8;
        }

        .role-dot.admin {
            background: #10b981;
            box-shadow: 0 0 10px #10b981;
            animation: pulse-dot 2s infinite;
        }

        @keyframes pulse-dot {
            0%, 100% { transform: scale(1); opacity: 1; }
            50% { transform: scale(1.25); opacity: 0.7; }
        }

        .btn-auth {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 7px 14px;
            border-radius: 10px;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            border: 1px solid transparent;
            transition: all 0.2s ease;
        }

        .btn-auth.login {
            background: var(--primary-gradient);
            color: #ffffff;
            box-shadow: 0 4px 14px var(--primary-glow);
        }

        .btn-auth.login:hover {
            transform: translateY(-1px);
            box-shadow: 0 6px 20px var(--primary-glow);
        }

        .btn-auth.logout {
            background: var(--bg-surface);
            color: var(--danger);
            border-color: rgba(239, 68, 68, 0.3);
        }

        .btn-auth.logout:hover {
            background: var(--danger-bg);
            border-color: var(--danger);
        }

        .btn-icon.guest-lock {
            color: var(--text-light);
            opacity: 0.75;
        }

        .btn-icon.guest-lock:hover {
            color: var(--warning);
            border-color: var(--warning);
            background: var(--warning-bg);
            opacity: 1;
        }

        .demo-account-box {
            background: rgba(99, 102, 241, 0.08);
            border: 1px dashed rgba(99, 102, 241, 0.35);
            border-radius: 12px;
            padding: 12px 14px;
            margin-bottom: 18px;
            font-size: 13px;
        }

        .demo-account-title {
            display: flex;
            align-items: center;
            gap: 6px;
            color: var(--primary);
            font-weight: 600;
            margin-bottom: 8px;
        }

        .demo-account-content {
            display: flex;
            align-items: center;
            flex-wrap: wrap;
            gap: 12px;
            color: var(--text-muted);
        }

        .demo-account-content code {
            background: var(--bg-surface);
            color: var(--text-main);
            padding: 2px 7px;
            border-radius: 6px;
            font-family: monospace;
            font-weight: bold;
            border: 1px solid var(--border-color);
        }

        .btn-fill-demo {
            margin-left: auto;
            background: var(--primary);
            color: #fff;
            border: none;
            padding: 4px 10px;
            border-radius: 6px;
            font-size: 11px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s ease;
        }

        .btn-fill-demo:hover {
            background: var(--primary-hover);
        }

        .logql-card {
            background: var(--bg-surface);
            border: 1px solid var(--border-color);
            border-radius: 12px;
            padding: 14px 16px;
            margin-bottom: 14px;
            transition: border-color 0.2s ease;
        }

        .logql-card:hover {
            border-color: var(--primary);
        }

        .logql-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 8px;
        }

        .logql-title {
            font-weight: 600;
            font-size: 13px;
            color: var(--text-main);
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .logql-code {
            background: var(--bg-body);
            border: 1px solid var(--border-color);
            border-radius: 8px;
            padding: 10px 14px;
            font-family: monospace;
            font-size: 13px;
            color: #38bdf8;
            word-break: break-all;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
        }

        .copy-btn-mini {
            background: rgba(255, 255, 255, 0.08);
            border: 1px solid var(--border-color);
            color: var(--text-muted);
            padding: 4px 8px;
            border-radius: 6px;
            font-size: 11px;
            cursor: pointer;
            white-space: nowrap;
            transition: all 0.2s;
        }

        .copy-btn-mini:hover {
            background: var(--primary);
            color: #fff;
            border-color: var(--primary);
        }

        @media (max-width: 768px) {
            .nav-container { flex-direction: column; align-items: stretch; gap: 12px; }
            .nav-actions { justify-content: space-between; flex-wrap: wrap; }
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
                    Grafana
                </a>

                <button id="openSecurityGuideBtn" type="button" class="btn-nav-link" title="Xem Hướng dẫn An ninh & Mẫu truy vấn LogQL">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                    </svg>
                    An ninh & LogQL
                </button>

                ${currentUser ? `
                <div class="user-role-badge admin" title="Tài khoản Quản trị viên (Toàn quyền)">
                    <span class="role-dot admin"></span>
                    <span>Admin: <strong>${escapeHtml(currentUser.username)}</strong></span>
                </div>
                <button id="logoutBtn" type="button" class="btn-auth logout" title="Đăng xuất khỏi hệ thống">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                        <polyline points="16 17 21 12 16 7"></polyline>
                        <line x1="21" y1="12" x2="9" y2="12"></line>
                    </svg>
                    Đăng xuất
                </button>
                ` : `
                <div class="user-role-badge guest" title="Chế độ khách (Chỉ xem)">
                    <span class="role-dot guest"></span>
                    <span>Khách (Chỉ xem)</span>
                </div>
                <button id="openLoginModalBtn" type="button" class="btn-auth login" title="Đăng nhập Quản trị viên">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                        <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                    </svg>
                    Đăng nhập Admin
                </button>
                `}


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
                <button type="button" id="seedDataBtn" class="btn btn-secondary" style="border-color: var(--primary); color: var(--primary);" title="Thêm 5 bản ghi mẫu">
                    ⚡ Thêm dữ liệu mẫu
                </button>
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

    <!-- Modal: Đăng nhập Quản trị viên (Admin Login) -->
    <div id="loginModal" class="modal-overlay">
        <div class="modal-card">
            <div class="modal-header">
                <h3>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                        <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                    </svg>
                    Đăng Nhập Quản Trị Viên (Admin)
                </h3>
                <button type="button" class="btn-close-modal" onclick="closeLoginModal()">&times;</button>
            </div>
            <form id="loginForm" onsubmit="handleLoginSubmit(event)">
                <div class="modal-body">
                    <div id="loginAlertBox" style="display: none; padding: 10px 14px; border-radius: 10px; margin-bottom: 16px; font-size: 13px; line-height: 1.5;"></div>

                    <div class="demo-account-box">
                        <div class="demo-account-title">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
                            Tài khoản kiểm thử mặc định:
                        </div>
                        <div class="demo-account-content">
                            <span>User: <code>admin</code></span>
                            <span>Pass: <code>admin123</code></span>
                            <button type="button" class="btn-fill-demo" onclick="fillDemoCredentials()">Điền nhanh</button>
                        </div>
                    </div>

                    <div class="form-group">
                        <label for="login_username">Tên đăng nhập *</label>
                        <div class="input-group-custom">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                                <circle cx="12" cy="7" r="4"></circle>
                            </svg>
                            <input type="text" id="login_username" name="username" class="input-control" placeholder="Nhập tên tài khoản..." required autocomplete="username">
                        </div>
                    </div>

                    <div class="form-group">
                        <label for="login_password">Mật khẩu *</label>
                        <div class="input-group-custom">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                            </svg>
                            <input type="password" id="login_password" name="password" class="input-control" placeholder="Nhập mật khẩu..." required autocomplete="current-password">
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" onclick="closeLoginModal()">Hủy</button>
                    <button type="submit" id="loginSubmitBtn" class="btn btn-primary">
                        🔑 Xác Thực Đăng Nhập
                    </button>
                </div>
            </form>
        </div>
    </div>

    <!-- Modal: Hướng dẫn An ninh & Truy vấn LogQL -->
    <div id="securityGuideModal" class="modal-overlay">
        <div class="modal-card" style="max-width: 650px;">
            <div class="modal-header">
                <h3 style="color: var(--primary);">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                    </svg>
                    Bảo Mật Hệ Thống & Kiểm Chứng LogQL
                </h3>
                <button type="button" class="btn-close-modal" onclick="closeSecurityGuideModal()">&times;</button>
            </div>
            <div class="modal-body" style="max-height: 65vh; overflow-y: auto; padding-right: 10px;">
                <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 16px; line-height: 1.6;">
                    Hệ thống tích hợp giám sát log tập trung với <strong>Loki + Promtail</strong>. Mọi sự kiện xác thực, tấn công brute-force hoặc truy cập trái phép đều được ghi nhận thời gian thực để tra cứu trên <strong>Grafana Explore</strong>.
                </p>

                <div class="logql-card">
                    <div class="logql-header">
                        <div class="logql-title">
                            <span style="color: var(--danger);">🔴 1. Phát hiện Đăng nhập thất bại (HTTP 401)</span>
                        </div>
                        <button type="button" class="copy-btn-mini" onclick="copyLogQL('{job=\"nginx\"} |= \"POST /api/login\" |= \" 401 \"')">Sao chép</button>
                    </div>
                    <div class="logql-code">
                        <span>{job="nginx"} |= "POST /api/login" |= " 401 "</span>
                    </div>
                </div>

                <div class="logql-card">
                    <div class="logql-header">
                        <div class="logql-title">
                            <span style="color: var(--warning);">⚡ 2. Cảnh báo Tấn công Brute-Force (Tần suất đăng nhập sai)</span>
                        </div>
                        <button type="button" class="copy-btn-mini" onclick="copyLogQL('rate({job=\"nginx\"} |= \"POST /api/login\" |= \" 401 \"[1m])')">Sao chép</button>
                    </div>
                    <div class="logql-code">
                        <span>rate({job="nginx"} |= "POST /api/login" |= " 401 "[1m])</span>
                    </div>
                </div>

                <div class="logql-card">
                    <div class="logql-header">
                        <div class="logql-title">
                            <span style="color: var(--danger);">🛑 3. Phát hiện Truy cập trái phép bị chặn (HTTP 403 Forbidden)</span>
                        </div>
                        <button type="button" class="copy-btn-mini" onclick="copyLogQL('{job=\"nginx\"} |= \" 403 \"')">Sao chép</button>
                    </div>
                    <div class="logql-code">
                        <span>{job="nginx"} |= " 403 "</span>
                    </div>
                </div>

                <div class="logql-card">
                    <div class="logql-header">
                        <div class="logql-title">
                            <span style="color: var(--info);">📋 4. Xem Audit Log thao tác từ Web App</span>
                        </div>
                        <button type="button" class="copy-btn-mini" onclick="copyLogQL('{job=\"webapp\"} |~ \"(AUTH_|STUDENT_|UNAUTHORIZED)\"')">Sao chép</button>
                    </div>
                    <div class="logql-code">
                        <span>{job="webapp"} |~ "(AUTH_|STUDENT_|UNAUTHORIZED)"</span>
                    </div>
                </div>

                <div class="logql-card">
                    <div class="logql-header">
                        <div class="logql-title">
                            <span style="color: var(--success);">🟢 5. Toàn bộ nhật ký truy cập Nginx</span>
                        </div>
                        <button type="button" class="copy-btn-mini" onclick="copyLogQL('{job=\"nginx\"}')">Sao chép</button>
                    </div>
                    <div class="logql-code">
                        <span>{job="nginx"}</span>
                    </div>
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" onclick="closeSecurityGuideModal()">Đóng</button>
                <a href="http://localhost:3001/explore" target="_blank" class="btn btn-primary" style="text-decoration: none;">
                    Mở Grafana Explore ↗
                </a>
            </div>
        </div>
    </div>

    <!-- Toast Notification Container -->
    <div id="toastContainer" class="toast-container"></div>


    <script>
        // Initial Dataset passed from Server
        const rawStudents = ${clientDataJson};
        const IS_ADMIN = ${isAdmin};
        const CURRENT_USER = ${JSON.stringify(currentUser ? currentUser.username : null)};

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
                            (IS_ADMIN ? (
                                '<button class="btn-icon edit" onclick="openEditModal(' + s.id + ')" title="Chỉnh sửa thông tin">' +
                                    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>' +
                                '</button>' +
                                '<button class="btn-icon delete" onclick="openDeleteModal(' + s.id + ', \\'' + escapeJs(s.full_name) + '\\', \\'' + escapeJs(s.student_code) + '\\')" title="Xóa sinh viên">' +
                                    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>' +
                                '</button>'
                            ) : (
                                '<button class="btn-icon guest-lock" onclick="promptAdminLogin(\\'Cần quyền Quản trị viên để chỉnh sửa sinh viên!\\')" title="Yêu cầu đăng nhập Quản trị">' +
                                    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>' +
                                '</button>' +
                                '<button class="btn-icon guest-lock" onclick="promptAdminLogin(\\'Cần quyền Quản trị viên để xóa sinh viên!\\')" title="Yêu cầu đăng nhập Quản trị">' +
                                    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>' +
                                '</button>'
                            )) +
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
            if (!IS_ADMIN) {
                promptAdminLogin('Vui lòng đăng nhập Quản trị viên để thêm sinh viên mới!');
                return;
            }
            document.getElementById('addModal').classList.add('active');
            document.getElementById('add_student_code').focus();
        }

        function closeAddModal() {
            document.getElementById('addModal').classList.remove('active');
        }

        function openEditModal(id) {
            if (!IS_ADMIN) {
                promptAdminLogin('Chỉ Quản trị viên mới có quyền chỉnh sửa hồ sơ sinh viên!');
                return;
            }
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
            if (!IS_ADMIN) {
                promptAdminLogin('Chỉ Quản trị viên mới có quyền xóa sinh viên khỏi hệ thống!');
                return;
            }
            document.getElementById('deleteStudentName').innerText = name;
            document.getElementById('deleteStudentCode').innerText = code;
            document.getElementById('deleteForm').action = '/delete/' + id;
            document.getElementById('deleteModal').classList.add('active');
        }

        function closeDeleteModal() {
            document.getElementById('deleteModal').classList.remove('active');
        }

        // Auth & Security Modal Handlers
        function openLoginModal() {
            const modal = document.getElementById('loginModal');
            if (modal) {
                modal.classList.add('active');
                document.getElementById('login_username').focus();
            }
        }

        function closeLoginModal() {
            const modal = document.getElementById('loginModal');
            if (modal) modal.classList.remove('active');
        }

        function fillDemoCredentials() {
            document.getElementById('login_username').value = 'admin';
            document.getElementById('login_password').value = 'admin123';
            document.getElementById('loginSubmitBtn').focus();
        }

        function promptAdminLogin(message = 'Vui lòng đăng nhập tài khoản Quản trị viên để thực hiện thao tác này!') {
            showToast(message, 'danger');
            const alertBox = document.getElementById('loginAlertBox');
            if (alertBox) {
                alertBox.style.display = 'block';
                alertBox.style.background = 'var(--danger-bg)';
                alertBox.style.color = 'var(--danger)';
                alertBox.style.border = '1px solid rgba(239, 68, 68, 0.3)';
                alertBox.innerText = message;
            }
            openLoginModal();
        }

        async function handleLoginSubmit(e) {
            e.preventDefault();
            const usernameInput = document.getElementById('login_username');
            const passwordInput = document.getElementById('login_password');
            const submitBtn = document.getElementById('loginSubmitBtn');
            const alertBox = document.getElementById('loginAlertBox');

            const username = usernameInput.value.trim();
            const password = passwordInput.value;

            submitBtn.disabled = true;
            submitBtn.innerText = 'Đang xác thực...';
            alertBox.style.display = 'none';

            try {
                const response = await fetch('/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });

                const data = await response.json();
                if (response.ok && data.success) {
                    showToast('Đăng nhập Quản trị viên thành công!', 'success');
                    closeLoginModal();
                    setTimeout(() => {
                        window.location.href = '/?status=logged_in';
                    }, 400);
                } else {
                    alertBox.style.display = 'block';
                    alertBox.style.background = 'var(--danger-bg)';
                    alertBox.style.color = 'var(--danger)';
                    alertBox.style.border = '1px solid rgba(239, 68, 68, 0.3)';
                    alertBox.innerText = data.error || 'Tài khoản hoặc mật khẩu không chính xác!';
                    submitBtn.disabled = false;
                    submitBtn.innerText = '🔑 Xác Thực Đăng Nhập';
                }
            } catch (err) {
                alertBox.style.display = 'block';
                alertBox.style.background = 'var(--danger-bg)';
                alertBox.style.color = 'var(--danger)';
                alertBox.style.border = '1px solid rgba(239, 68, 68, 0.3)';
                alertBox.innerText = 'Lỗi kết nối máy chủ: ' + err.message;
                submitBtn.disabled = false;
                submitBtn.innerText = '🔑 Xác Thực Đăng Nhập';
            }
        }

        async function handleLogout() {
            try {
                await fetch('/api/logout', { method: 'POST' });
                window.location.href = '/?status=logged_out';
            } catch (e) {
                window.location.href = '/logout';
            }
        }

        function openSecurityGuideModal() {
            const modal = document.getElementById('securityGuideModal');
            if (modal) modal.classList.add('active');
        }

        function closeSecurityGuideModal() {
            const modal = document.getElementById('securityGuideModal');
            if (modal) modal.classList.remove('active');
        }

        function copyLogQL(queryText) {
            navigator.clipboard.writeText(queryText).then(() => {
                showToast('Đã sao chép câu lệnh LogQL vào bộ nhớ tạm!', 'success');
            }).catch(() => {
                showToast('LogQL: ' + queryText, 'info');
            });
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

        // Event Listeners for Buttons
        const addBtn = document.getElementById('openAddModalBtn');
        if (addBtn) addBtn.addEventListener('click', openAddModal);

        const openLoginBtn = document.getElementById('openLoginModalBtn');
        if (openLoginBtn) openLoginBtn.addEventListener('click', openLoginModal);

        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);

        const securityGuideBtn = document.getElementById('openSecurityGuideBtn');
        if (securityGuideBtn) securityGuideBtn.addEventListener('click', openSecurityGuideModal);

        const seedBtn = document.getElementById('seedDataBtn');
        if (seedBtn) {
            seedBtn.addEventListener('click', () => {
                if (!IS_ADMIN) {
                    promptAdminLogin('Vui lòng đăng nhập Quản trị viên để nạp 5 sinh viên mẫu!');
                    return;
                }
                const form = document.createElement('form');
                form.method = 'POST';
                form.action = '/seed';
                document.body.appendChild(form);
                form.submit();
            });
        }

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
        } else if (status === 'logged_in') {
            showToast('Đăng nhập Quản trị viên thành công!', 'success');
            window.history.replaceState({}, document.title, window.location.pathname);
        } else if (status === 'logged_out') {
            showToast('Đã đăng xuất khỏi hệ thống!', 'info');
            window.history.replaceState({}, document.title, window.location.pathname);
        } else if (status === 'unauthorized') {
            showToast('Từ chối truy cập (403): Yêu cầu quyền Quản trị viên!', 'danger');
            window.history.replaceState({}, document.title, window.location.pathname);
        }

        // Initial render
        renderStudents();
    </script>
</body>
</html>`;

        res.send(html);
    } catch (e) {
        writeLog('ERROR', 'DASHBOARD_ERROR', { error: e.message });
        res.status(500).send("Lỗi kết nối CSDL: " + e.message);
    }
});

// Route: Đăng nhập quản trị viên
app.post('/api/login', (req, res) => {
    const clientIp = getClientIp(req);
    const { username, password } = req.body || {};

    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
        const token = createAuthToken(username);
        res.setHeader('Set-Cookie', `qlsv_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`);
        writeLog('INFO', 'AUTH_SUCCESS', {
            user: username,
            ip: clientIp,
            message: 'Admin authenticated successfully'
        });
        return res.json({ success: true, message: 'Đăng nhập thành công!', user: username, token });
    } else {
        writeLog('WARN', 'AUTH_FAILED', {
            user: username || 'anonymous',
            ip: clientIp,
            message: 'Failed login attempt with incorrect credentials'
        });
        return res.status(401).json({ success: false, error: 'Tên đăng nhập hoặc mật khẩu không chính xác!' });
    }
});

// Route: Đăng xuất
app.all(['/api/logout', '/logout'], (req, res) => {
    const clientIp = getClientIp(req);
    const user = getAuthenticatedUser(req);
    res.setHeader('Set-Cookie', 'qlsv_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
    writeLog('INFO', 'AUTH_LOGOUT', {
        user: user?.username || 'unknown',
        ip: clientIp,
        message: 'Admin logged out'
    });
    if (req.method === 'GET') {
        return res.redirect('/?status=logged_out');
    }
    return res.json({ success: true, message: 'Đã đăng xuất thành công!' });
});

// Route: Kiểm tra trạng thái đăng nhập
app.get('/api/auth-status', (req, res) => {
    const user = getAuthenticatedUser(req);
    res.json({
        authenticated: !!user,
        user: user ? user.username : null,
        role: user ? 'admin' : 'guest'
    });
});

// Route: Thêm sinh viên mới (Yêu cầu quyền Admin)
app.post('/add', requireAdminAuth, async (req, res) => {
    const clientIp = getClientIp(req);
    try {
        const { student_code, full_name, class_name, score } = req.body;
        if (!student_code || !full_name || !class_name || score === undefined) {
            return res.status(400).send("Vui lòng điền đầy đủ thông tin.");
        }
        await pool.query(
            'INSERT INTO students (student_code, full_name, class_name, score) VALUES (?, ?, ?, ?)', 
            [student_code.trim(), full_name.trim(), class_name.trim(), parseFloat(score)]
        );
        writeLog('INFO', 'STUDENT_ADDED', {
            student_code: student_code.trim(),
            full_name: full_name.trim(),
            class_name: class_name.trim(),
            score: parseFloat(score),
            user: req.user.username,
            ip: clientIp
        });
        res.redirect('/?status=added');
    } catch (e) {
        writeLog('ERROR', 'STUDENT_ADD_FAILED', { error: e.message, ip: clientIp });
        res.status(500).send("Lỗi thêm sinh viên: " + e.message);
    }
});

// Route: Cập nhật thông tin sinh viên (Yêu cầu quyền Admin)
app.post('/edit/:id', requireAdminAuth, async (req, res) => {
    const clientIp = getClientIp(req);
    try {
        const { student_code, full_name, class_name, score } = req.body;
        const id = req.params.id;
        await pool.query(
            'UPDATE students SET student_code = ?, full_name = ?, class_name = ?, score = ? WHERE id = ?',
            [student_code.trim(), full_name.trim(), class_name.trim(), parseFloat(score), id]
        );
        writeLog('INFO', 'STUDENT_UPDATED', {
            student_id: id,
            student_code: student_code.trim(),
            full_name: full_name.trim(),
            class_name: class_name.trim(),
            score: parseFloat(score),
            user: req.user.username,
            ip: clientIp
        });
        res.redirect('/?status=updated');
    } catch (e) {
        writeLog('ERROR', 'STUDENT_UPDATE_FAILED', { student_id: req.params.id, error: e.message, ip: clientIp });
        res.status(500).send("Lỗi cập nhật sinh viên: " + e.message);
    }
});

// Route: Xóa sinh viên (Yêu cầu quyền Admin)
app.post('/delete/:id', requireAdminAuth, async (req, res) => {
    const clientIp = getClientIp(req);
    try {
        const id = req.params.id;
        await pool.query('DELETE FROM students WHERE id = ?', [id]);
        writeLog('INFO', 'STUDENT_DELETED', {
            student_id: id,
            user: req.user.username,
            ip: clientIp
        });
        res.redirect('/?status=deleted');
    } catch (e) {
        writeLog('ERROR', 'STUDENT_DELETE_FAILED', { student_id: req.params.id, error: e.message, ip: clientIp });
        res.status(500).send("Lỗi xóa sinh viên: " + e.message);
    }
});

// Route: Tạo dữ liệu mẫu (Yêu cầu quyền Admin)
app.post('/seed', requireAdminAuth, async (req, res) => {
    const clientIp = getClientIp(req);
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
        writeLog('INFO', 'SAMPLE_DATA_SEEDED', {
            count: sampleStudents.length,
            user: req.user.username,
            ip: clientIp
        });
        res.redirect('/?status=seeded');
    } catch (e) {
        writeLog('ERROR', 'SAMPLE_DATA_SEED_FAILED', { error: e.message, ip: clientIp });
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
    res.json({
        status: 'ok',
        uptime: process.uptime(),
        auth_enabled: true,
        timestamp: new Date().toISOString()
    });
});

const port = process.env.PORT || 3000;
app.listen(port, () => writeLog('INFO', 'SERVER_STARTED', { port, message: `Server running on port ${port}` }));

