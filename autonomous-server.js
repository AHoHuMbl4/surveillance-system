/**
 * Autonomous Surveillance Server - Полностью автономная система видеонаблюдения
 * ИСПРАВЛЕНА ПРОБЛЕМА С АУТЕНТИФИКАЦИЕЙ
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import url from 'url';
import crypto from 'crypto';
import AutonomousRTSPManager from './autonomous-rtsp-manager.js';

class AutonomousSurveillanceServer {
    constructor() {
        this.streamManager = new AutonomousRTSPManager();
        this.sessions = new Map();
        this.currentConfig = null;
        this.currentApartmentIndex = 0;
        this.cycleTimer = null;
        this.cycleInterval = 15000;
        this.isRTSPEnabled = false;
        this.isAudioEnabled = false;
        this.activeAudioCamera = null;
        
        // Информация о системе
        this.systemInfo = {
            platform: process.platform,
            nodeVersion: process.version,
            autonomous: true,
            externalDependencies: [],
            supportedFormats: ['mjpeg', 'http-stream', 'demo'],
            maxCameras: 250,
            version: '2.0.0-autonomous'
        };
        
        // Загрузка конфигурации
        this.loadConfig();
        
        // Настройка обработчиков событий stream manager
        this.setupStreamManagerEvents();
        
        // Создание HTTP сервера
        this.server = http.createServer((req, res) => this.handleRequest(req, res));
        
        console.log('🚀 Autonomous Surveillance Server инициализирован');
        console.log(`📱 Платформа: ${this.systemInfo.platform}`);
        console.log(`⚡ Node.js: ${this.systemInfo.nodeVersion}`);
        console.log(`🎯 Режим: Полностью автономный (без внешних зависимостей)`);
    }

    /**
     * Настройка обработчиков событий stream manager
     */
    setupStreamManagerEvents() {
        this.streamManager.on('streamConnected', ({ streamId, camera, type }) => {
            console.log(`✅ Автономный ${type || 'видео'} поток подключен: ${camera.camera_name} (${streamId})`);
        });

        this.streamManager.on('streamError', ({ streamId, camera, error, attempts }) => {
            console.log(`⚠️ Ошибка автономного потока ${camera.camera_name}: ${error.message} (попытка ${attempts})`);
        });

        this.streamManager.on('streamFailed', ({ streamId, camera }) => {
            console.log(`💀 Автономный поток окончательно недоступен: ${camera.camera_name} (${streamId})`);
        });

        this.streamManager.on('audioStarted', ({ streamId, camera }) => {
            this.activeAudioCamera = camera.id;
            console.log(`🔊 Автономное аудио активировано: ${camera.camera_name}`);
        });

        this.streamManager.on('audioStopped', ({ streamId, camera }) => {
            if (this.activeAudioCamera === camera.id) {
                this.activeAudioCamera = null;
            }
            console.log(`🔇 Автономное аудио деактивировано: ${camera.camera_name}`);
        });

        this.streamManager.on('audioError', ({ streamId, camera, error }) => {
            console.error(`💥 Ошибка автономного аудио потока ${camera.camera_name}:`, error.message);
        });
    }

    /**
     * Загрузка конфигурации
     */
    loadConfig() {
        try {
            const configPath = './config.json';
            if (fs.existsSync(configPath)) {
                const configData = fs.readFileSync(configPath, 'utf8');
                this.currentConfig = JSON.parse(configData);
                
                // Валидация и дополнение конфигурации для автономного режима
                this.validateAutonomousConfig();
                
                console.log(`✅ Конфигурация загружена: ${this.currentConfig.apartments.length} квартир, ${this.currentConfig.cameras.length} камер`);
            } else {
                console.log('⚠️ Файл конфигурации не найден, создание автономной демо конфигурации...');
                this.createAutonomousDemoConfig();
            }
        } catch (error) {
            console.error('❌ Ошибка загрузки конфигурации:', error);
            this.createAutonomousDemoConfig();
        }
    }

    /**
     * Валидация конфигурации для автономного режима
     */
    validateAutonomousConfig() {
        // Добавляем настройки автономного режима
        if (!this.currentConfig.autonomous_settings) {
            this.currentConfig.autonomous_settings = {
                demo_mode: true,
                generate_demo_streams: true,
                supported_formats: ['mjpeg', 'http-stream'],
                max_demo_fps: 30,
                demo_quality_low: '640x480',
                demo_quality_high: '1920x1080',
                enable_audio_simulation: true
            };
        }

        // Обновляем пароли пользователей для автономного режима
        this.currentConfig.users.forEach(user => {
            // Простые пароли для демонстрации
            if (user.login === 'admin') {
                user.password_hash = this.hashPassword('admin123');
            } else if (user.login === 'operator') {
                user.password_hash = this.hashPassword('operator123');
            }
        });

        // Обновляем камеры для автономного режима
        this.currentConfig.cameras.forEach(camera => {
            if (!camera.autonomous_mode) {
                camera.autonomous_mode = {
                    demo_enabled: true,
                    stream_type: 'mjpeg',
                    fallback_to_demo: true
                };
            }
        });

        // Глобальные настройки аудио
        if (!this.currentConfig.audio_settings) {
            this.currentConfig.audio_settings = {
                autonomous_mode: true,
                demo_audio: true,
                exclusive_mode: true,
                supported_codecs: ['demo', 'wav', 'mp3'],
                default_volume: 0.7
            };
        }
    }

    /**
     * Создание демо конфигурации для автономного режима
     */
    createAutonomousDemoConfig() {
        this.currentConfig = {
            system: {
                version: this.systemInfo.version,
                autonomous: true,
                platform: this.systemInfo.platform,
                external_dependencies: []
            },
            users: [
                {
                    login: "admin",
                    password_hash: this.hashPassword("admin123"),
                    role: "admin"
                },
                {
                    login: "operator",
                    password_hash: this.hashPassword("operator123"),
                    role: "operator"
                }
            ],
            apartments: [
                {
                    id: 1,
                    apartment_name: "Демо квартира 1"
                },
                {
                    id: 2,
                    apartment_name: "Демо квартира 2"
                }
            ],
            cameras: [
                {
                    id: 1,
                    camera_name: "Автономная камера 1",
                    rtsp_link: "demo://autonomous/camera1",
                    rtsp_link_high: "demo://autonomous/camera1/hd",
                    apartment_id: 1,
                    position_x: 0,
                    position_y: 0,
                    audio_enabled: true,
                    autonomous_mode: {
                        demo_enabled: true,
                        stream_type: 'mjpeg',
                        fallback_to_demo: true
                    }
                },
                {
                    id: 2,
                    camera_name: "Автономная камера 2",
                    rtsp_link: "demo://autonomous/camera2",
                    rtsp_link_high: "demo://autonomous/camera2/hd",
                    apartment_id: 1,
                    position_x: 1,
                    position_y: 0,
                    audio_enabled: true,
                    autonomous_mode: {
                        demo_enabled: true,
                        stream_type: 'mjpeg',
                        fallback_to_demo: true
                    }
                },
                {
                    id: 3,
                    camera_name: "Автономная камера 3",
                    rtsp_link: "demo://autonomous/camera3",
                    rtsp_link_high: "demo://autonomous/camera3/hd",
                    apartment_id: 2,
                    position_x: 0,
                    position_y: 0,
                    audio_enabled: true,
                    autonomous_mode: {
                        demo_enabled: true,
                        stream_type: 'mjpeg',
                        fallback_to_demo: true
                    }
                }
            ],
            autonomous_settings: {
                demo_mode: true,
                generate_demo_streams: true,
                supported_formats: ['mjpeg', 'http-stream'],
                max_demo_fps: 30,
                demo_quality_low: '640x480',
                demo_quality_high: '1920x1080',
                enable_audio_simulation: true
            },
            audio_settings: {
                autonomous_mode: true,
                demo_audio: true,
                exclusive_mode: true,
                supported_codecs: ['demo', 'wav', 'mp3'],
                default_volume: 0.7
            },
            settings: {
                rotation_interval: 15,
                connection_timeout: 10,
                max_retry_attempts: 5,
                enable_audio_by_default: false,
                autonomous_mode: true
            }
        };

        // Сохранение демо конфигурации
        try {
            fs.writeFileSync('./config.json', JSON.stringify(this.currentConfig, null, 2));
            console.log('✅ Автономная демо конфигурация создана и сохранена');
        } catch (error) {
            console.error('❌ Ошибка сохранения автономной демо конфигурации:', error);
        }
    }

    /**
     * Улучшенное хеширование пароля для автономного режима
     */
    hashPassword(password) {
        // Используем простое, но надежное хеширование для демонстрации
        const salt = 'autonomous_surveillance_salt_2024';
        return crypto.createHash('sha256').update(password + salt).digest('hex');
    }

    /**
     * Проверка пароля
     */
    verifyPassword(password, hash) {
        const computedHash = this.hashPassword(password);
        console.log(`🔐 Проверка пароля:`);
        console.log(`  Введенный пароль: "${password}"`);
        console.log(`  Вычисленный хеш: ${computedHash}`);
        console.log(`  Ожидаемый хеш: ${hash}`);
        console.log(`  Совпадение: ${computedHash === hash}`);
        return computedHash === hash;
    }

    /**
     * Обработка HTTP запросов
     */
    async handleRequest(req, res) {
        const parsedUrl = url.parse(req.url, true);
        const pathname = parsedUrl.pathname;
        const method = req.method;

        // CORS заголовки
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

        if (method === 'OPTIONS') {
            res.writeHead(200);
            res.end();
            return;
        }

        try {
            // Маршрутизация
            if (pathname === '/') {
                await this.serveStaticFile(res, './index.html', 'text/html');
            } else if (pathname.startsWith('/api/')) {
                await this.handleAPIRequest(req, res, pathname, method);
            } else if (pathname.startsWith('/autonomous_stream/')) {
                await this.handleAutonomousStreamRequest(req, res, pathname);
            } else if (pathname.startsWith('/audio_demo/')) {
                await this.handleAudioDemoRequest(req, res, pathname);
            } else {
                this.send404(res);
            }
        } catch (error) {
            console.error('❌ Ошибка обработки запроса:', error);
            this.sendError(res, 500, 'Внутренняя ошибка сервера');
        }
    }

    /**
     * Обработка запросов автономных потоков
     */
    async handleAutonomousStreamRequest(req, res, pathname) {
        try {
            // Извлечение ID потока из URL
            const streamId = pathname.replace('/autonomous_stream/', '');
            const streamUrl = this.streamManager.getStreamUrl(streamId.split('_')[0], streamId.split('_')[1]);
            
            if (!streamUrl) {
                this.send404(res);
                return;
            }

            // Переадресация на прокси поток
            const proxyUrl = streamUrl.replace('http://localhost:', 'http://127.0.0.1:');
            
            // Простое проксирование
            const proxyReq = http.request(proxyUrl, (proxyRes) => {
                res.writeHead(proxyRes.statusCode, proxyRes.headers);
                proxyRes.pipe(res);
            });

            proxyReq.on('error', (error) => {
                console.error('❌ Ошибка проксирования автономного потока:', error);
                this.send404(res);
            });

            proxyReq.end();

        } catch (error) {
            console.error('❌ Ошибка обработки автономного потока:', error);
            this.send404(res);
        }
    }

    /**
     * Обработка демо аудио запросов
     */
    async handleAudioDemoRequest(req, res, pathname) {
        try {
            const streamId = pathname.replace('/audio_demo/', '');
            
            // Генерация простого демо аудио потока
            res.writeHead(200, {
                'Content-Type': 'audio/mpeg',
                'Cache-Control': 'no-cache',
                'Access-Control-Allow-Origin': '*'
            });

            // Простая генерация "тишины" как демо аудио
            const silenceBuffer = Buffer.alloc(1024, 0);
            
            let audioFrames = 0;
            const maxFrames = 100; // Ограничение демо аудио
            
            const audioInterval = setInterval(() => {
                if (res.destroyed || audioFrames >= maxFrames) {
                    clearInterval(audioInterval);
                    return;
                }
                
                res.write(silenceBuffer);
                audioFrames++;
            }, 100); // 10 кадров в секунду

            res.on('close', () => {
                clearInterval(audioInterval);
            });

        } catch (error) {
            console.error('❌ Ошибка демо аудио:', error);
            this.send404(res);
        }
    }

    /**
     * Обработка API запросов
     */
    async handleAPIRequest(req, res, pathname, method) {
        // Получение данных POST запроса
        let body = '';
        if (method === 'POST') {
            body = await this.getRequestBody(req);
        }

        switch (pathname) {
            case '/api/login':
                if (method === 'POST') {
                    await this.handleLogin(res, JSON.parse(body));
                }
                break;
                
            case '/api/apartments':
                if (method === 'GET') {
                    await this.handleGetApartments(res);
                }
                break;
                
            case '/api/cameras':
                if (method === 'GET') {
                    await this.handleGetCameras(res);
                }
                break;
                
            case '/api/rtsp/toggle':
                if (method === 'POST') {
                    await this.handleRTSPToggle(res);
                }
                break;
                
            case '/api/rtsp/status':
                if (method === 'GET') {
                    await this.handleRTSPStatus(res);
                }
                break;

            case '/api/audio/toggle':
                if (method === 'POST') {
                    await this.handleAudioToggle(res, JSON.parse(body));
                }
                break;

            case '/api/audio/status':
                if (method === 'GET') {
                    await this.handleAudioStatus(res);
                }
                break;
                
            case '/api/stream/start':
                if (method === 'POST') {
                    await this.handleStreamStart(res, JSON.parse(body));
                }
                break;
                
            case '/api/stream/stop':
                if (method === 'POST') {
                    await this.handleStreamStop(res, JSON.parse(body));
                }
                break;

            case '/api/system/info':
                if (method === 'GET') {
                    await this.handleSystemInfo(res);
                }
                break;
                
            default:
                this.send404(res);
        }
    }

    /**
     * Получение информации о системе
     */
    async handleSystemInfo(res) {
        const streamStatus = this.streamManager.getStreamStatus();
        
        const systemInfo = {
            ...this.systemInfo,
            uptime: process.uptime(),
            memoryUsage: process.memoryUsage(),
            cpuArchitecture: process.arch,
            streamStatus: streamStatus,
            configLoaded: !!this.currentConfig,
            totalCameras: this.currentConfig?.cameras.length || 0,
            totalApartments: this.currentConfig?.apartments.length || 0
        };

        this.sendJSON(res, systemInfo);
    }

    /**
     * ИСПРАВЛЕННАЯ обработка входа в автономном режиме
     */
    async handleLogin(res, data) {
        try {
            const { login, password } = data;
            
            console.log(`🔐 Попытка входа: логин="${login}", пароль="${password}"`);
            
            if (!login || !password) {
                console.log('❌ Не указаны логин или пароль');
                return this.sendError(res, 400, 'Логин и пароль обязательны');
            }

            const user = this.currentConfig.users.find(u => u.login === login);
            if (!user) {
                console.log(`❌ Пользователь не найден: ${login}`);
                return this.sendError(res, 401, 'Неверный логин или пароль');
            }

            console.log(`🔍 Найден пользователь: ${user.login}, роль: ${user.role}`);
            console.log(`🔍 Хеш пароля в базе: ${user.password_hash}`);

            // Проверка пароля в автономном режиме
            const isValidPassword = this.verifyPassword(password, user.password_hash);
            
            if (!isValidPassword) {
                console.log(`❌ Неверный пароль для пользователя: ${login}`);
                return this.sendError(res, 401, 'Неверный логин или пароль');
            }

            console.log(`✅ Успешная аутентификация пользователя: ${login}`);

            // Создание сессии
            const sessionToken = this.generateSessionToken();
            this.sessions.set(sessionToken, {
                user: user,
                loginTime: Date.now(),
                permissions: this.getUserPermissions(user.role),
                autonomous: true
            });

            console.log(`🎫 Создана сессия: ${sessionToken}`);

            this.sendJSON(res, {
                success: true,
                token: sessionToken,
                user: {
                    login: user.login,
                    role: user.role
                },
                permissions: this.getUserPermissions(user.role),
                autonomous: true,
                platform: this.systemInfo.platform
            });

        } catch (error) {
            console.error('❌ Ошибка автономной аутентификации:', error);
            this.sendError(res, 500, 'Ошибка аутентификации');
        }
    }

    /**
     * Обработка переключения RTSP в автономном режиме
     */
    async handleRTSPToggle(res) {
        try {
            this.isRTSPEnabled = !this.isRTSPEnabled;
            
            if (!this.isRTSPEnabled) {
                await this.streamManager.stopAllStreams();
                this.activeAudioCamera = null;
            }
            
            this.sendJSON(res, {
                success: true,
                enabled: this.isRTSPEnabled,
                autonomous: true,
                message: this.isRTSPEnabled ? 'Автономный RTSP включен' : 'Автономный RTSP выключен'
            });
        } catch (error) {
            console.error('❌ Ошибка переключения автономного RTSP:', error);
            this.sendError(res, 500, error.message);
        }
    }

    /**
     * Получение статуса RTSP в автономном режиме
     */
    async handleRTSPStatus(res) {
        try {
            const systemInfo = await this.streamManager.checkSystemAvailability();
            const streamStatus = this.streamManager.getStreamStatus();
            
            const status = {
                enabled: this.isRTSPEnabled,
                autonomous: true,
                systemAvailable: systemInfo.available,
                platform: systemInfo.platform,
                features: systemInfo.features,
                activeStreams: streamStatus.totalStreams,
                audioStreams: streamStatus.audioStreams,
                currentAudioStream: streamStatus.currentAudioStream,
                streams: streamStatus.streams,
                audioEnabled: this.isAudioEnabled,
                activeAudioCamera: this.activeAudioCamera,
                maxConnections: streamStatus.maxConnections
            };

            this.sendJSON(res, status);
        } catch (error) {
            console.error('❌ Ошибка получения автономного статуса RTSP:', error);
            this.sendError(res, 500, error.message);
        }
    }

    /**
     * Запуск автономного потока
     */
    async handleStreamStart(res, data) {
        try {
            const { cameraId, quality = 'low', includeAudio = false } = data;
            
            const camera = this.currentConfig.cameras.find(c => c.id === parseInt(cameraId));
            if (!camera) {
                return this.sendError(res, 404, 'Камера не найдена');
            }

            const streamId = await this.streamManager.startStream(camera, quality, includeAudio);
            const streamUrl = this.streamManager.getStreamUrl(cameraId, quality);
            
            this.sendJSON(res, {
                success: true,
                streamId: streamId,
                streamUrl: streamUrl,
                camera: camera.camera_name,
                quality: quality,
                audioIncluded: includeAudio,
                autonomous: true,
                autonomousStreamUrl: `/autonomous_stream/${streamId}`
            });

        } catch (error) {
            console.error('❌ Ошибка запуска автономного потока:', error);
            this.sendError(res, 500, error.message);
        }
    }

    /**
     * Переключение аудио в автономном режиме
     */
    async handleAudioToggle(res, data) {
        try {
            const { cameraId, quality = 'low' } = data;
            
            if (!cameraId) {
                return this.sendError(res, 400, 'Не указан ID камеры');
            }

            const camera = this.currentConfig.cameras.find(c => c.id === parseInt(cameraId));
            if (!camera) {
                return this.sendError(res, 404, 'Камера не найдена');
            }

            const isAudioActive = await this.streamManager.toggleAudio(cameraId, quality);
            
            this.sendJSON(res, {
                success: true,
                audioActive: isAudioActive,
                camera: camera.camera_name,
                autonomous: true,
                demoAudio: true,
                message: isAudioActive ? 'Демо аудио включено' : 'Демо аудио выключено'
            });

        } catch (error) {
            console.error('❌ Ошибка переключения автономного аудио:', error);
            this.sendError(res, 500, error.message);
        }
    }

    /**
     * Получение разрешений пользователя
     */
    getUserPermissions(role) {
        const permissions = {
            canViewCameras: true,
            canControlAudio: false,
            canChangeSettings: false,
            canManageUsers: false,
            autonomous: true
        };

        if (role === 'admin') {
            permissions.canControlAudio = true;
            permissions.canChangeSettings = true;
            permissions.canManageUsers = true;
        } else if (role === 'operator') {
            permissions.canControlAudio = true;
        }

        return permissions;
    }

    /**
     * Генерация токена сессии
     */
    generateSessionToken() {
        return crypto.randomBytes(32).toString('hex');
    }

    /**
     * Вспомогательные методы
     */
    async handleGetApartments(res) {
        this.sendJSON(res, this.currentConfig.apartments);
    }

    async handleGetCameras(res) {
        this.sendJSON(res, this.currentConfig.cameras);
    }

    async handleAudioStatus(res) {
        const streamStatus = this.streamManager.getStreamStatus();
        const audioStatus = {
            enabled: this.isAudioEnabled,
            autonomous: true,
            demo: true,
            currentAudioCamera: this.activeAudioCamera,
            exclusiveMode: true,
            activeStreams: streamStatus.audioStreams,
            cameras: this.currentConfig.cameras.map(camera => ({
                id: camera.id,
                name: camera.camera_name,
                audioEnabled: camera.audio_enabled,
                isCurrentlyActive: this.activeAudioCamera === camera.id
            }))
        };

        this.sendJSON(res, audioStatus);
    }

    async handleStreamStop(res, data) {
        try {
            const { streamId } = data;
            await this.streamManager.stopStream(streamId);
            
            this.sendJSON(res, {
                success: true,
                autonomous: true,
                message: 'Автономный поток остановлен'
            });
        } catch (error) {
            console.error('❌ Ошибка остановки автономного потока:', error);
            this.sendError(res, 500, error.message);
        }
    }

    /**
     * Получение данных POST запроса
     */
    getRequestBody(req) {
        return new Promise((resolve, reject) => {
            let body = '';
            req.on('data', chunk => {
                body += chunk.toString();
            });
            req.on('end', () => {
                resolve(body);
            });
            req.on('error', reject);
        });
    }

    /**
     * Подача статических файлов
     */
    async serveStaticFile(res, filePath, contentType) {
        try {
            if (fs.existsSync(filePath)) {
                const fileContent = fs.readFileSync(filePath);
                res.writeHead(200, { 'Content-Type': contentType });
                res.end(fileContent);
            } else {
                this.send404(res);
            }
        } catch (error) {
            console.error('❌ Ошибка подачи файла:', error);
            this.send404(res);
        }
    }

    /**
     * Отправка JSON ответа
     */
    sendJSON(res, data) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
    }

    /**
     * Отправка ошибки
     */
    sendError(res, statusCode, message) {
        res.writeHead(statusCode, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: message, autonomous: true }));
    }

    /**
     * Отправка 404
     */
    send404(res) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found - Autonomous Mode');
    }

    /**
     * Запуск автономного сервера
     */
    async start(port = 3000) {
        // Проверка готовности автономной системы
        const systemInfo = await this.streamManager.checkSystemAvailability();
        
        console.log(`✅ Автономная система готова:`);
        console.log(`📱 Платформа: ${systemInfo.platform}`);
        console.log(`⚡ Node.js: ${systemInfo.nodeVersion}`);
        console.log(`🎯 Возможности: ${Object.keys(systemInfo.features).filter(f => systemInfo.features[f]).join(', ')}`);
        console.log(`🔐 Демо пароли: admin/admin123, operator/operator123`);

        this.server.listen(port, () => {
            console.log(`🌐 Автономный сервер запущен на порту ${port}`);
            console.log(`🔗 Откройте браузер: http://localhost:${port}`);
            console.log(`👤 Логин: admin, Пароль: admin123`);
            console.log(`🎥 RTSP поддержка: автономная (без внешних зависимостей)`);
            console.log(`🔊 Аудио поддержка: демо режим`);
            console.log(`💾 Внешние зависимости: отсутствуют`);
            console.log(`🚀 Готов к работе на любой платформе!`);
        });
    }

    /**
     * Остановка автономного сервера
     */
    async stop() {
        console.log('🛑 Остановка автономного сервера...');
        
        // Остановка всех потоков
        await this.streamManager.stopAllStreams();
        
        // Закрытие HTTP сервера
        this.server.close(() => {
            console.log('✅ Автономный сервер остановлен');
        });
    }
}

// Запуск автономного сервера
const server = new AutonomousSurveillanceServer();

// Обработка сигналов завершения
process.on('SIGINT', async () => {
    console.log('\n🛑 Получен сигнал SIGINT, остановка автономного сервера...');
    await server.stop();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n🛑 Получен сигнал SIGTERM, остановка автономного сервера...');
    await server.stop();
    process.exit(0);
});

// Запуск
server.start(3000).catch(error => {
    console.error('💥 Ошибка запуска автономного сервера:', error);
    process.exit(1);
});

export default AutonomousSurveillanceServer;
