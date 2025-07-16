// web-server.cjs - Исправленный веб-сервер с правильным обслуживанием статических файлов

const express = require('express');
const path = require('path');
const app = express();
const PORT = 3000;

// Настройка MIME типов для TypeScript и других файлов
express.static.mime.define({
    'application/javascript': ['ts'],
    'text/css': ['css'],
    'text/html': ['html']
});

// Статические файлы с правильными MIME типами
app.use(express.static('src', {
    setHeaders: (res, path) => {
        if (path.endsWith('.ts')) {
            res.setHeader('Content-Type', 'application/javascript');
        } else if (path.endsWith('.css')) {
            res.setHeader('Content-Type', 'text/css');
        } else if (path.endsWith('.html')) {
            res.setHeader('Content-Type', 'text/html');
        }
    }
}));

app.use(express.json());

// Имитация Tauri API
let currentUser = null;
let isAuthenticated = false;

const users = {
    'admin': { login: 'admin', role: 'Admin', password: 'admin123' },
    'operator1': { login: 'operator1', role: 'Operator', password: 'operator123' }
};

const testConfig = {
    apartments: [
        { id: 1, apartment_name: "Квартира на Пушкина", apartment_number: "12А" },
        { id: 2, apartment_name: "Квартира на Ленина", apartment_number: "34Б" },
        { id: 3, apartment_name: "Квартира на Советской", apartment_number: "56В" }
    ],
    cameras: [
        { id: 1, camera_name: "Прихожая", apartment_name: "Квартира на Пушкина", rtsp_link: "rtsp://192.168.1.100:554/stream1", enabled: true },
        { id: 2, camera_name: "Гостиная", apartment_name: "Квартира на Пушкина", rtsp_link: "rtsp://192.168.1.101:554/stream1", enabled: true },
        { id: 3, camera_name: "Кухня", apartment_name: "Квартира на Пушкина", rtsp_link: "rtsp://192.168.1.102:554/stream1", enabled: true },
        { id: 4, camera_name: "Спальня", apartment_name: "Квартира на Ленина", rtsp_link: "rtsp://192.168.1.200:554/stream1", enabled: true },
        { id: 5, camera_name: "Балкон", apartment_name: "Квартира на Ленина", rtsp_link: "rtsp://192.168.1.201:554/stream1", enabled: true }
    ]
};

// API endpoints
app.post('/api/login', (req, res) => {
    console.log('🔐 Попытка входа:', req.body);
    const { login, password } = req.body;
    const user = users[login];
    
    if (user && user.password === password) {
        currentUser = user;
        isAuthenticated = true;
        console.log('✅ Успешная авторизация:', login);
        res.json({
            success: true,
            user: { login: user.login, role: user.role },
            message: "Авторизация успешна"
        });
    } else {
        console.log('❌ Неудачная авторизация:', login);
        res.json({
            success: false,
            user: null,
            message: "Неверный логин или пароль"
        });
    }
});

app.post('/api/logout', (req, res) => {
    console.log('🚪 Выход из системы:', currentUser?.login);
    currentUser = null;
    isAuthenticated = false;
    res.json({ success: true, message: "Выход выполнен" });
});

app.get('/api/system-status', (req, res) => {
    res.json({
        is_authenticated: isAuthenticated,
        current_user: currentUser?.login,
        user_role: currentUser?.role,
        config_loaded: true,
        apartments_count: testConfig.apartments.length,
        cameras_count: testConfig.cameras.length
    });
});

app.get('/api/config', (req, res) => {
    if (!isAuthenticated) {
        return res.status(401).json({ error: "Не авторизован" });
    }
    res.json(testConfig);
});

// Главная страница
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'src', 'index-web.html'));
});

// Отладочная страница
app.get('/debug', (req, res) => {
    res.sendFile(path.join(__dirname, 'src', 'debug-client.html'));
});

// 404 для всех остальных запросов
app.use('*', (req, res) => {
    console.log('❓ 404 запрос:', req.originalUrl);
    res.status(404).json({ error: 'Страница не найдена' });
});

// Запуск сервера
app.listen(PORT, () => {
    console.log(`🚀 Веб-сервер запущен на http://localhost:${PORT}`);
    console.log(`📄 Основной интерфейс: http://localhost:${PORT}/`);
    console.log(`🔍 Отладочный интерфейс: http://localhost:${PORT}/debug`);
    console.log(`\n👤 Тестовые аккаунты:`);
    console.log(`   Админ: admin / admin123`);
    console.log(`   Оператор: operator1 / operator123`);
});

process.on('SIGINT', () => {
    console.log('\n🛑 Сервер остановлен');
    process.exit(0);
});
