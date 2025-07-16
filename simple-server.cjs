// simple-server.cjs - Простой HTTP сервер без Express.js

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = 3000;

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
        // Квартира на Пушкина (4 камеры)
        { id: 1, camera_name: "Прихожая", apartment_name: "Квартира на Пушкина", rtsp_link: "rtsp://192.168.1.100:554/stream1", enabled: true },
        { id: 2, camera_name: "Гостиная", apartment_name: "Квартира на Пушкина", rtsp_link: "rtsp://192.168.1.101:554/stream1", enabled: true },
        { id: 3, camera_name: "Кухня", apartment_name: "Квартира на Пушкина", rtsp_link: "rtsp://192.168.1.102:554/stream1", enabled: true },
        { id: 4, camera_name: "Спальня", apartment_name: "Квартира на Пушкина", rtsp_link: "rtsp://192.168.1.103:554/stream1", enabled: true },
        
        // Квартира на Ленина (3 камеры)
        { id: 5, camera_name: "Спальня", apartment_name: "Квартира на Ленина", rtsp_link: "rtsp://192.168.1.200:554/stream1", enabled: true },
        { id: 6, camera_name: "Балкон", apartment_name: "Квартира на Ленина", rtsp_link: "rtsp://192.168.1.201:554/stream1", enabled: true },
        { id: 7, camera_name: "Кухня", apartment_name: "Квартира на Ленина", rtsp_link: "rtsp://192.168.1.202:554/stream1", enabled: true },
        
        // Квартира на Советской (2 камеры)
        { id: 8, camera_name: "Гостиная", apartment_name: "Квартира на Советской", rtsp_link: "rtsp://192.168.1.300:554/stream1", enabled: true },
        { id: 9, camera_name: "Прихожая", apartment_name: "Квартира на Советской", rtsp_link: "rtsp://192.168.1.301:554/stream1", enabled: true }
    ]
};

// Функция для чтения тела POST запроса
function getPostData(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', () => {
            try {
                resolve(body ? JSON.parse(body) : {});
            } catch (error) {
                reject(error);
            }
        });
        req.on('error', reject);
    });
}

// Функция для отправки JSON ответа
function sendJSON(res, data, statusCode = 200) {
    res.writeHead(statusCode, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end(JSON.stringify(data));
}

// Функция для отправки файла
function sendFile(res, filePath, contentType = 'text/html') {
    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Файл не найден');
            return;
        }
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
    });
}

// Создание сервера
const server = http.createServer(async (req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;
    const method = req.method;

    console.log(`${method} ${pathname}`);

    // CORS headers для всех запросов
    if (method === 'OPTIONS') {
        res.writeHead(200, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
        });
        res.end();
        return;
    }

    try {
        // API роуты
        if (pathname === '/api/login' && method === 'POST') {
            const { login, password } = await getPostData(req);
            console.log('🔐 Попытка входа:', { login, password: '***' });
            
            const user = users[login];
            if (user && user.password === password) {
                currentUser = user;
                isAuthenticated = true;
                console.log('✅ Успешная авторизация:', login);
                sendJSON(res, {
                    success: true,
                    user: { login: user.login, role: user.role },
                    message: "Авторизация успешна"
                });
            } else {
                console.log('❌ Неудачная авторизация:', login);
                sendJSON(res, {
                    success: false,
                    user: null,
                    message: "Неверный логин или пароль"
                });
            }
            return;
        }

        if (pathname === '/api/logout' && method === 'POST') {
            console.log('🚪 Выход из системы:', currentUser?.login);
            currentUser = null;
            isAuthenticated = false;
            sendJSON(res, { success: true, message: "Выход выполнен" });
            return;
        }

        if (pathname === '/api/system-status' && method === 'GET') {
            sendJSON(res, {
                is_authenticated: isAuthenticated,
                current_user: currentUser?.login,
                user_role: currentUser?.role,
                config_loaded: true,
                apartments_count: testConfig.apartments.length,
                cameras_count: testConfig.cameras.length
            });
            return;
        }

        if (pathname === '/api/config' && method === 'GET') {
            if (!isAuthenticated) {
                sendJSON(res, { error: "Не авторизован" }, 401);
                return;
            }
            sendJSON(res, testConfig);
            return;
        }

        // Статические файлы
        if (pathname === '/' || pathname === '/index.html') {
            sendFile(res, path.join(__dirname, 'src', 'index-web.html'), 'text/html');
            return;
        }

        if (pathname === '/debug') {
            sendFile(res, path.join(__dirname, 'src', 'debug-client.html'), 'text/html');
            return;
        }

        // Обслуживание статических файлов из папки src
        if (pathname.startsWith('/')) {
            const filePath = path.join(__dirname, 'src', pathname.substring(1));
            
            // Безопасность: проверяем что файл внутри папки src
            if (!filePath.startsWith(path.join(__dirname, 'src'))) {
                sendJSON(res, { error: 'Доступ запрещен' }, 403);
                return;
            }

            // Определяем MIME тип
            const ext = path.extname(filePath).toLowerCase();
            let contentType = 'text/plain';
            switch (ext) {
                case '.html': contentType = 'text/html'; break;
                case '.css': contentType = 'text/css'; break;
                case '.js': contentType = 'application/javascript'; break;
                case '.json': contentType = 'application/json'; break;
                case '.png': contentType = 'image/png'; break;
                case '.jpg': case '.jpeg': contentType = 'image/jpeg'; break;
                case '.svg': contentType = 'image/svg+xml'; break;
            }

            sendFile(res, filePath, contentType);
            return;
        }

        // 404
        console.log('❓ 404 запрос:', pathname);
        sendJSON(res, { error: 'Страница не найдена' }, 404);

    } catch (error) {
        console.error('❌ Ошибка сервера:', error);
        sendJSON(res, { error: 'Внутренняя ошибка сервера' }, 500);
    }
});

// Запуск сервера
server.listen(PORT, () => {
    console.log(`🚀 Простой HTTP сервер запущен на http://localhost:${PORT}`);
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
