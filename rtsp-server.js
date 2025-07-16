/**
 * RTSP Integration Server - Расширенная версия с управлением аудио
 * Система видеонаблюдения с полной поддержкой звука
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import url from 'url';
import bcrypt from 'bcrypt';
import RTSPStreamManager from './rtsp-stream-manager.js';

class RTSPServer {
    constructor() {
        this.streamManager = new RTSPStreamManager();
        this.sessions = new Map();
        this.currentConfig = null;
        this.currentApartmentIndex = 0;
        this.cycleTimer = null;
        this.cycleInterval = 15000; // 15 секунд по умолчанию
        this.isRTSPEnabled = false; // Флаг включения RTSP режима
        this.isAudioEnabled = false; // Флаг включения аудио
        this.activeAudioCamera = null; // ID камеры с активным аудио
        
        // Загрузка конфигурации
        this.loadConfig();
        
        // Настройка обработчиков событий stream manager
        this.setupStreamManagerEvents();
        
        // Создание HTTP сервера
        this.server = http.createServer((req, res) => this.handleRequest(req, res));
        
        console.log('🚀 RTSP Server инициализирован с поддержкой аудио');
    }

    /**
     * Настройка обработчиков событий stream manager
     */
    setupStreamManagerEvents() {
        this.streamManager.on('streamConnected', ({ streamId, camera, type }) => {
            console.log(`✅ ${type === 'video' ? 'Видео' : 'Аудио'} поток подключен: ${camera.camera_name} (${streamId})`);
        });

        this.streamManager.on('streamError', ({ streamId, camera, error, attempts }) => {
            console.log(`⚠️ Ошибка потока ${camera.camera_name}: ${error.message} (попытка ${attempts})`);
        });

        this.streamManager.on('streamFailed', ({ streamId, camera }) => {
            console.log(`💀 Поток окончательно недоступен: ${camera.camera_name} (${streamId})`);
        });

        this.streamManager.on('audioStarted', ({ streamId, camera }) => {
            this.activeAudioCamera = camera.id;
            console.log(`🔊 Аудио активировано: ${camera.camera_name}`);
        });

        this.streamManager.on('audioStopped', ({ streamId, camera }) => {
            if (this.activeAudioCamera === camera.id) {
                this.activeAudioCamera = null;
            }
            console.log(`🔇 Аудио деактивировано: ${camera.camera_name}`);
        });

        this.streamManager.on('audioError', ({ streamId, camera, error }) => {
            console.error(`💥 Ошибка аудио потока ${camera.camera_name}:`, error.message);
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
                
                // Валидация конфигурации для аудио
                this.validateAudioConfig();
                
                console.log(`✅ Конфигурация загружена: ${this.currentConfig.apartments.length} квартир, ${this.currentConfig.cameras.length} камер`);
            } else {
                console.log('⚠️ Файл конфигурации не найден, создание демо конфигурации...');
                this.createDemoConfig();
            }
        } catch (error) {
            console.error('❌ Ошибка загрузки конфигурации:', error);
            this.createDemoConfig();
        }
    }

    /**
     * Валидация конфигурации для поддержки аудио
     */
    validateAudioConfig() {
        // Добавляем поддержку аудио к существующим камерам
        this.currentConfig.cameras.forEach(camera => {
            if (!camera.hasOwnProperty('audio_enabled')) {
                camera.audio_enabled = true; // По умолчанию аудио включено
            }
            if (!camera.hasOwnProperty('audio_codec')) {
                camera.audio_codec = 'aac'; // По умолчанию AAC
            }
        });

        // Добавляем глобальные настройки аудио
        if (!this.currentConfig.audio_settings) {
            this.currentConfig.audio_settings = {
                default_volume: 0.7,
                exclusive_mode: true, // Только одна камера с аудио одновременно
                supported_codecs: ['aac', 'pcm_mulaw', 'pcm_alaw'],
                sample_rate: 44100,
                bitrate: 128000
            };
        }
    }

    /**
     * Создание демо конфигурации с поддержкой аудио
     */
    createDemoConfig() {
        this.currentConfig = {
            users: [
                {
                    login: "admin",
                    password_hash: "$2b$10$dummy.hash.for.admin123.password", // admin123
                    role: "admin"
                },
                {
                    login: "operator",
                    password_hash: "$2b$10$dummy.hash.for.operator123.password", // operator123
                    role: "operator"
                }
            ],
            apartments: [
                {
                    id: 1,
                    apartment_name: "Тестовая квартира"
                }
            ],
            cameras: [
                {
                    id: 1,
                    camera_name: "Демо камера (BigBuckBunny)",
                    rtsp_link: "rtsp://wowzaec2demo.streamlock.net/vod-multitrack/_definst_/mp4:BigBuckBunny_115k.mp4/playlist.m3u8",
                    rtsp_link_high: "rtsp://wowzaec2demo.streamlock.net/vod-multitrack/_definst_/mp4:BigBuckBunny_175k.mp4/playlist.m3u8",
                    apartment_id: 1,
                    position_x: 0,
                    position_y: 0,
                    audio_enabled: true,
                    audio_codec: "aac"
                }
            ],
            audio_settings: {
                default_volume: 0.7,
                exclusive_mode: true,
                supported_codecs: ['aac', 'pcm_mulaw', 'pcm_alaw'],
                sample_rate: 44100,
                bitrate: 128000
            },
            settings: {
                rotation_interval: 15,
                connection_timeout: 10,
                max_retry_attempts: 5,
                enable_audio_by_default: false
            }
        };

        // Сохранение демо конфигурации
        try {
            fs.writeFileSync('./config.json', JSON.stringify(this.currentConfig, null, 2));
            console.log('✅ Демо конфигурация создана и сохранена');
        } catch (error) {
            console.error('❌ Ошибка сохранения демо конфигурации:', error);
        }
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
            } else if (pathname.startsWith('/stream_output/')) {
                await this.serveStreamFile(res, pathname);
            } else if (pathname.startsWith('/audio_output/')) {
                await this.serveAudioFile(res, pathname);
            } else {
                this.send404(res);
            }
        } catch (error) {
            console.error('❌ Ошибка обработки запроса:', error);
            this.sendError(res, 500, 'Внутренняя ошибка сервера');
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

            case '/api/stream/quality':
                if (method === 'POST') {
                    await this.handleStreamQuality(res, JSON.parse(body));
                }
                break;
                
            default:
                this.send404(res);
        }
    }

    /**
     * Обработка переключения аудио
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

            if (!camera.audio_enabled) {
                return this.sendError(res, 400, 'Аудио не поддерживается этой камерой');
            }

            const isAudioActive = await this.streamManager.toggleAudio(cameraId, quality);
            
            this.sendJSON(res, {
                success: true,
                audioActive: isAudioActive,
                camera: camera.camera_name,
                message: isAudioActive ? 'Аудио включено' : 'Аудио выключено'
            });

        } catch (error) {
            console.error('❌ Ошибка переключения аудио:', error);
            this.sendError(res, 500, error.message);
        }
    }

    /**
     * Получение статуса аудио системы
     */
    async handleAudioStatus(res) {
        try {
            const streamStatus = this.streamManager.getStreamStatus();
            const audioStatus = {
                enabled: this.isAudioEnabled,
                currentAudioCamera: this.activeAudioCamera,
                exclusiveMode: this.currentConfig.audio_settings.exclusive_mode,
                supportedCodecs: this.currentConfig.audio_settings.supported_codecs,
                activeStreams: streamStatus.audioStreams,
                cameras: this.currentConfig.cameras.map(camera => ({
                    id: camera.id,
                    name: camera.camera_name,
                    audioEnabled: camera.audio_enabled,
                    audioCodec: camera.audio_codec,
                    isCurrentlyActive: this.activeAudioCamera === camera.id
                }))
            };

            this.sendJSON(res, audioStatus);
        } catch (error) {
            console.error('❌ Ошибка получения статуса аудио:', error);
            this.sendError(res, 500, error.message);
        }
    }

    /**
     * Обработка переключения качества потока
     */
    async handleStreamQuality(res, data) {
        try {
            const { cameraId, quality } = data;
            
            if (!cameraId || !quality) {
                return this.sendError(res, 400, 'Не указаны необходимые параметры');
            }

            const camera = this.currentConfig.cameras.find(c => c.id === parseInt(cameraId));
            if (!camera) {
                return this.sendError(res, 404, 'Камера не найдена');
            }

            // Остановка текущего потока
            const currentStreamId = `${cameraId}_${quality === 'high' ? 'low' : 'high'}`;
            await this.streamManager.stopStream(currentStreamId);

            // Запуск нового потока с новым качеством
            const includeAudio = this.activeAudioCamera === parseInt(cameraId);
            await this.streamManager.startStream(camera, quality, includeAudio);

            this.sendJSON(res, {
                success: true,
                camera: camera.camera_name,
                quality: quality,
                message: `Качество изменено на ${quality}`
            });

        } catch (error) {
            console.error('❌ Ошибка изменения качества:', error);
            this.sendError(res, 500, error.message);
        }
    }

    /**
     * Обработка статуса RTSP (расширенная версия)
     */
    async handleRTSPStatus(res) {
        try {
            const ffmpegAvailable = await this.streamManager.checkFFmpegAvailability();
            const streamStatus = this.streamManager.getStreamStatus();
            
            const status = {
                enabled: this.isRTSPEnabled,
                ffmpegAvailable: ffmpegAvailable,
                activeStreams: streamStatus.totalStreams,
                audioStreams: streamStatus.audioStreams,
                currentAudioStream: streamStatus.currentAudioStream,
                streams: streamStatus.streams,
                audioEnabled: this.isAudioEnabled,
                activeAudioCamera: this.activeAudioCamera
            };

            this.sendJSON(res, status);
        } catch (error) {
            console.error('❌ Ошибка получения статуса RTSP:', error);
            this.sendError(res, 500, error.message);
        }
    }

    /**
     * Обработка запуска потока (расширенная версия)
     */
    async handleStreamStart(res, data) {
        try {
            const { cameraId, quality = 'low', includeAudio = false } = data;
            
            const camera = this.currentConfig.cameras.find(c => c.id === parseInt(cameraId));
            if (!camera) {
                return this.sendError(res, 404, 'Камера не найдена');
            }

            // Проверка поддержки аудио
            if (includeAudio && !camera.audio_enabled) {
                return this.sendError(res, 400, 'Аудио не поддерживается этой камерой');
            }

            const streamId = await this.streamManager.startStream(camera, quality, includeAudio);
            
            this.sendJSON(res, {
                success: true,
                streamId: streamId,
                camera: camera.camera_name,
                quality: quality,
                audioIncluded: includeAudio
            });

        } catch (error) {
            console.error('❌ Ошибка запуска потока:', error);
            this.sendError(res, 500, error.message);
        }
    }

    /**
     * Подача аудио файлов
     */
    async serveAudioFile(res, pathname) {
        try {
            const filePath = path.join('.', pathname);
            
            if (!fs.existsSync(filePath)) {
                return this.send404(res);
            }

            const ext = path.extname(filePath);
            let contentType = 'application/octet-stream';
            
            if (ext === '.m3u8') {
                contentType = 'application/vnd.apple.mpegurl';
            } else if (ext === '.ts') {
                contentType = 'video/mp2t';
            }

            res.setHeader('Content-Type', contentType);
            res.setHeader('Cache-Control', 'no-cache');
            
            const fileStream = fs.createReadStream(filePath);
            fileStream.pipe(res);
            
        } catch (error) {
            console.error('❌ Ошибка подачи аудио файла:', error);
            this.send404(res);
        }
    }

    /**
     * Обработка входа (расширенная версия)
     */
    async handleLogin(res, data) {
        try {
            const { login, password } = data;
            
            if (!login || !password) {
                return this.sendError(res, 400, 'Логин и пароль обязательны');
            }

            const user = this.currentConfig.users.find(u => u.login === login);
            if (!user) {
                return this.sendError(res, 401, 'Неверный логин или пароль');
            }

            // Временно упрощенная проверка для отладки
            const isValidPassword = password === 'admin123' || password === 'operator123';
            // В продакшене: const isValidPassword = await bcrypt.compare(password, user.password_hash);
            
            if (!isValidPassword) {
                return this.sendError(res, 401, 'Неверный логин или пароль');
            }

            // Создание сессии
            const sessionToken = this.generateSessionToken();
            this.sessions.set(sessionToken, {
                user: user,
                loginTime: Date.now(),
                permissions: this.getUserPermissions(user.role)
            });

            this.sendJSON(res, {
                success: true,
                token: sessionToken,
                user: {
                    login: user.login,
                    role: user.role
                },
                permissions: this.getUserPermissions(user.role)
            });

        } catch (error) {
            console.error('❌ Ошибка аутентификации:', error);
            this.sendError(res, 500, 'Ошибка аутентификации');
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
            canManageUsers: false
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
        return Math.random().toString(36).substring(2, 15) + 
               Math.random().toString(36).substring(2, 15) + 
               Date.now().toString(36);
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
     * Подача потоковых файлов
     */
    async serveStreamFile(res, pathname) {
        try {
            const filePath = path.join('.', pathname);
            
            if (!fs.existsSync(filePath)) {
                return this.send404(res);
            }

            const ext = path.extname(filePath);
            let contentType = 'application/octet-stream';
            
            if (ext === '.m3u8') {
                contentType = 'application/vnd.apple.mpegurl';
            } else if (ext === '.ts') {
                contentType = 'video/mp2t';
            }

            res.setHeader('Content-Type', contentType);
            res.setHeader('Cache-Control', 'no-cache');
            
            const fileStream = fs.createReadStream(filePath);
            fileStream.pipe(res);
            
        } catch (error) {
            console.error('❌ Ошибка подачи потокового файла:', error);
            this.send404(res);
        }
    }

    /**
     * Вспомогательные методы для обработки других API endpoints
     */
    async handleGetApartments(res) {
        this.sendJSON(res, this.currentConfig.apartments);
    }

    async handleGetCameras(res) {
        this.sendJSON(res, this.currentConfig.cameras);
    }

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
                message: this.isRTSPEnabled ? 'RTSP включен' : 'RTSP выключен'
            });
        } catch (error) {
            console.error('❌ Ошибка переключения RTSP:', error);
            this.sendError(res, 500, error.message);
        }
    }

    async handleStreamStop(res, data) {
        try {
            const { streamId } = data;
            await this.streamManager.stopStream(streamId);
            
            this.sendJSON(res, {
                success: true,
                message: 'Поток остановлен'
            });
        } catch (error) {
            console.error('❌ Ошибка остановки потока:', error);
            this.sendError(res, 500, error.message);
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
        res.end(JSON.stringify({ error: message }));
    }

    /**
     * Отправка 404
     */
    send404(res) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
    }

    /**
     * Запуск сервера
     */
    async start(port = 3000) {
        // Проверка готовности системы
        const ffmpegAvailable = await this.streamManager.checkFFmpegAvailability();
        if (!ffmpegAvailable) {
            console.log('⚠️ ВНИМАНИЕ: FFmpeg недоступен. Установите FFmpeg для работы с RTSP потоками.');
            console.log('💡 Для openSUSE: sudo zypper install --from packman ffmpeg ffmpeg-4');
        }

        this.server.listen(port, () => {
            console.log(`🌐 Сервер запущен на порту ${port}`);
            console.log(`🔗 Откройте браузер: http://localhost:${port}`);
            console.log(`👤 Логин: admin, Пароль: admin123`);
            if (ffmpegAvailable) {
                console.log(`🎥 RTSP поддержка: активна`);
                console.log(`🔊 Аудио поддержка: активна`);
            }
        });
    }

    /**
     * Остановка сервера
     */
    async stop() {
        console.log('🛑 Остановка сервера...');
        
        // Остановка всех потоков
        await this.streamManager.stopAllStreams();
        
        // Закрытие HTTP сервера
        this.server.close(() => {
            console.log('✅ Сервер остановлен');
        });
    }
}

// Запуск сервера
const server = new RTSPServer();

// Обработка сигналов завершения
process.on('SIGINT', async () => {
    console.log('\n🛑 Получен сигнал SIGINT, остановка сервера...');
    await server.stop();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n🛑 Получен сигнал SIGTERM, остановка сервера...');
    await server.stop();
    process.exit(0);
});

// Запуск
server.start(3000).catch(error => {
    console.error('💥 Ошибка запуска сервера:', error);
    process.exit(1);
});

export default RTSPServer;
