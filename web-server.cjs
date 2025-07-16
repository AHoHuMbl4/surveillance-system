// web-server.cjs - Простой веб-сервер для тестирования без Tauri (CommonJS)

const express = require('express');
const path = require('path');
const app = express();
const PORT = 3000;

// Статические файлы
app.use(express.static('src'));
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
    console.log('🚪 Выход пользователя:', currentUser?.login);
    currentUser = null;
    isAuthenticated = false;
    res.json({ success: true });
});

app.get('/api/current-user', (req, res) => {
    res.json(currentUser);
});

app.get('/api/check-auth', (req, res) => {
    res.json(isAuthenticated);
});

app.get('/api/system-status', (req, res) => {
    const status = {
        is_authenticated: isAuthenticated,
        current_user: currentUser?.login,
        user_role: currentUser?.role,
        config_loaded: true,
        apartments_count: testConfig.apartments.length,
        cameras_count: testConfig.cameras.length
    };
    console.log('📊 Статус системы:', status);
    res.json(status);
});

app.get('/api/apartments', (req, res) => {
    console.log('🏠 Запрос квартир');
    res.json(testConfig.apartments);
});

app.get('/api/cameras', (req, res) => {
    console.log('📹 Запрос камер');
    res.json(testConfig.cameras);
});

app.get('/api/greet/:name', (req, res) => {
    const message = `Привет, ${req.params.name}! Система видеонаблюдения работает.`;
    console.log('👋 Приветствие:', message);
    res.json(message);
});

// Главная страница - перенаправляем на веб-версию
app.get('/', (req, res) => {
    const htmlPath = path.join(__dirname, 'src', 'index-web.html');
    console.log('🌐 Запрос главной страницы:', htmlPath);
    res.sendFile(htmlPath);
});

// Запуск сервера
app.listen(PORT, () => {
    console.log('🚀 Веб-сервер запущен на http://localhost:' + PORT);
    console.log('📂 Статические файлы из папки: src/');
    console.log('');
    console.log('👥 Тестовые аккаунты:');
    console.log('   Администратор: admin / admin123');
    console.log('   Оператор: operator1 / operator123');
    console.log('');
    console.log('🔗 Откройте браузер и перейдите на http://localhost:' + PORT);
});

// Обработка ошибок
app.use((err, req, res, next) => {
    console.error('❌ Ошибка сервера:', err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
});

// 404 для несуществующих маршрутов
app.use((req, res) => {
    console.log('❓ 404:', req.url);
    res.status(404).json({ error: 'Маршрут не найден' });
});
