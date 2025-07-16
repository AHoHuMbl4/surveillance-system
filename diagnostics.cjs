const express = require('express');
const bcrypt = require('bcrypt');
const path = require('path');
const fs = require('fs');

console.log('🔍 Запуск диагностики системы...\n');

// 1. Проверка зависимостей
console.log('📦 Проверка зависимостей:');
try {
    console.log('✅ express:', require('express/package.json').version);
    console.log('✅ bcrypt:', require('bcrypt/package.json').version);
    console.log('✅ path: встроенный модуль');
    console.log('✅ fs: встроенный модуль');
} catch (error) {
    console.log('❌ Ошибка зависимостей:', error.message);
}

// 2. Проверка файловой системы
console.log('\n📁 Проверка файлов:');
const requiredFiles = [
    'src/index-web.html',
    'src/styles.css',
    'package.json'
];

requiredFiles.forEach(file => {
    if (fs.existsSync(file)) {
        console.log(`✅ ${file} - найден`);
    } else {
        console.log(`❌ ${file} - НЕ НАЙДЕН`);
    }
});

// 3. Тестирование авторизации
console.log('\n🔐 Тестирование системы авторизации:');

// Тестовые данные пользователей
const testUsers = [
    { login: "admin", password: "admin123", role: "admin" },
    { login: "operator1", password: "operator123", role: "operator" }
];

async function testAuth() {
    try {
        // Создаем хеши паролей
        const users = [];
        for (const user of testUsers) {
            const hash = await bcrypt.hash(user.password, 10);
            users.push({
                login: user.login,
                password_hash: hash,
                role: user.role
            });
            console.log(`✅ Хеш для ${user.login}: ${hash.substring(0, 20)}...`);
        }

        // Тестируем проверку паролей
        for (const testUser of testUsers) {
            const storedUser = users.find(u => u.login === testUser.login);
            if (storedUser) {
                const isValid = await bcrypt.compare(testUser.password, storedUser.password_hash);
                console.log(`${isValid ? '✅' : '❌'} Проверка пароля для ${testUser.login}: ${isValid}`);
            }
        }

        return users;
    } catch (error) {
        console.log('❌ Ошибка тестирования авторизации:', error.message);
        return [];
    }
}

// 4. Создание тестового сервера
async function createTestServer() {
    console.log('\n🚀 Создание тестового сервера...');
    
    const app = express();
    app.use(express.json());
    app.use(express.static('src'));

    // Получаем пользователей из тестирования
    const users = await testAuth();
    
    // Тестовая конфигурация
    const testConfig = {
        apartments: [
            { id: 1, apartment_name: "Тестовая квартира 1", apartment_number: "101" },
            { id: 2, apartment_name: "Тестовая квартира 2", apartment_number: "102" }
        ],
        cameras: [
            { id: 1, camera_name: "Камера 1", apartment_name: "Тестовая квартира 1", rtsp_link: "rtsp://test1" },
            { id: 2, camera_name: "Камера 2", apartment_name: "Тестовая квартира 1", rtsp_link: "rtsp://test2" }
        ],
        settings: {
            rotation_interval: 15,
            connection_timeout: 10
        }
    };

    // Middleware для логирования
    app.use((req, res, next) => {
        console.log(`📨 ${new Date().toISOString()} - ${req.method} ${req.path}`);
        if (req.body && Object.keys(req.body).length > 0) {
            console.log('📦 Body:', JSON.stringify(req.body, null, 2));
        }
        next();
    });

    // API маршруты
    app.post('/api/login', async (req, res) => {
        console.log('🔐 Попытка входа:', req.body);
        
        try {
            const { username, password } = req.body;

            if (!username || !password) {
                console.log('❌ Отсутствуют логин или пароль');
                return res.status(400).json({ 
                    success: false, 
                    error: 'Логин и пароль обязательны' 
                });
            }

            const user = users.find(u => u.login === username);
            if (!user) {
                console.log('❌ Пользователь не найден:', username);
                return res.status(401).json({ 
                    success: false, 
                    error: 'Неверный логин или пароль' 
                });
            }

            const isPasswordValid = await bcrypt.compare(password, user.password_hash);
            if (!isPasswordValid) {
                console.log('❌ Неверный пароль для:', username);
                return res.status(401).json({ 
                    success: false, 
                    error: 'Неверный логин или пароль' 
                });
            }

            console.log('✅ Успешная авторизация:', username);
            res.json({ 
                success: true, 
                user: { login: user.login, role: user.role } 
            });

        } catch (error) {
            console.log('❌ Ошибка авторизации:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Внутренняя ошибка сервера' 
            });
        }
    });

    // Остальные API маршруты
    app.get('/api/config', (req, res) => {
        console.log('📋 Запрос конфигурации');
        res.json(testConfig);
    });

    app.get('/api/apartments', (req, res) => {
        res.json(testConfig.apartments);
    });

    app.get('/api/cameras', (req, res) => {
        res.json(testConfig.cameras);
    });

    app.get('/api/settings', (req, res) => {
        res.json(testConfig.settings);
    });

    // Главная страница
    app.get('/', (req, res) => {
        console.log('🏠 Запрос главной страницы');
        res.sendFile(path.join(__dirname, 'src', 'index-web.html'));
    });

    // Обработка ошибок
    app.use((error, req, res, next) => {
        console.log('❌ Ошибка сервера:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Внутренняя ошибка сервера' 
        });
    });

    return app;
}

// 5. Запуск сервера
async function startServer() {
    try {
        const app = await createTestServer();
        const PORT = 3000;
        
        app.listen(PORT, () => {
            console.log(`\n🎉 Диагностический сервер запущен!`);
            console.log(`🌐 URL: http://localhost:${PORT}`);
            console.log(`\n📋 Тестовые аккаунты:`);
            console.log(`👤 Администратор: admin / admin123`);
            console.log(`👤 Оператор: operator1 / operator123`);
            console.log(`\n🔍 Все запросы логируются в консоль`);
            console.log(`⏹️  Остановка: Ctrl+C`);
        });

    } catch (error) {
        console.log('❌ Ошибка запуска сервера:', error);
    }
}

// Запуск диагностики
startServer();
