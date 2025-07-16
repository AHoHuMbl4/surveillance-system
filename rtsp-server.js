/**
 * RTSP Integration Server - ES Modules версия
 * Для совместимости с package.json "type": "module"
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import url from 'url';
import bcrypt from 'bcrypt';
import RTSPStreamManager from './rtsp-stream-manager.js';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class RTSPIntegrationServer {
    constructor() {
        this.streamManager = new RTSPStreamManager();
        this.sessions = new Map();
        this.currentConfig = null;
        this.currentApartmentIndex = 0;
        this.cycleTimer = null;
        this.cycleInterval = 15000; // 15 секунд по умолчанию
        this.isRTSPEnabled = false; // Флаг включения RTSP режима
        
        // Загрузка конфигурации
        this.loadConfig();
        
        // Настройка обработчиков событий stream manager
        this.setupStreamManagerEvents();
        
        // Создание HTTP сервера
        this.server = http.createServer((req, res) => this.handleRequest(req, res));
        
        console.log('🚀 RTSP Integration Server инициализирован');
    }

    /**
     * Настройка обработчиков событий stream manager
     */
    setupStreamManagerEvents() {
        this.streamManager.on('streamConnected', ({ streamId, camera }) => {
            console.log(`✅ Поток подключен: ${camera.camera_name} (${streamId})`);
        });

        this.streamManager.on('streamError', ({ streamId, camera, error, attempts }) => {
            console.log(`⚠️ Ошибка потока ${camera.camera_name}: ${error} (попытка ${attempts})`);
        });

        this.streamManager.on('streamFailed', ({ streamId, camera }) => {
            console.log(`💀 Поток ${camera.camera_name} окончательно недоступен`);
        });
    }

    /**
     * Загрузка конфигурации
     */
    loadConfig() {
        try {
            const configPath = path.join(__dirname, 'config.json');
            if (fs.existsSync(configPath)) {
                const configData = fs.readFileSync(configPath, 'utf8');
                this.currentConfig = JSON.parse(configData);
                console.log('📖 Конфигурация загружена');
            } else {
                console.log('⚠️ Файл конфигурации не найден, используется mock режим');
                this.currentConfig = this.generateMockConfig();
            }
        } catch (error) {
            console.error('❌ Ошибка загрузки конфигурации:', error.message);
            this.currentConfig = this.generateMockConfig();
        }
    }

    /**
     * Генерация mock конфигурации
     */
    generateMockConfig() {
        return {
            users: [
                {
                    login: "admin",
                    password_hash: "$2b$10$CwTycUXWue0Thq9StjUM0uJ8E5zQ0B9H.VQ8S8IUo2z2N7fFG7/mC", // admin123
                    role: "admin"
                }
            ],
            apartments: [
                { id: 1, apartment_name: "Тестовая квартира", apartment_number: "TEST-1" }
            ],
            cameras: [
                {
                    id: 1,
                    camera_name: "Тестовая камера",
                    apartment_name: "Тестовая квартира",
                    rtsp_link: "rtsp://demo:demo@ipvmdemo.dyndns.org:554/onvif-media/media.amp?profile=profile_1_h264",
                    rtsp_hd_link: "rtsp://demo:demo@ipvmdemo.dyndns.org:554/onvif-media/media.amp?profile=profile_2_h264",
                    enabled: true
                }
            ],
            settings: {
                rotation_interval: 15,
                connection_timeout: 10
            }
        };
    }

    /**
     * Основной обработчик HTTP запросов
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
            // Роутинг
            if (pathname === '/') {
                await this.serveFile(path.join(__dirname, 'index.html'), res);
            } else if (pathname === '/api/login') {
                await this.handleLogin(req, res);
            } else if (pathname === '/api/apartments') {
                await this.handleApartments(req, res);
            } else if (pathname === '/api/cameras') {
                await this.handleCameras(req, res);
            } else if (pathname === '/api/rtsp/toggle') {
                await this.handleRTSPToggle(req, res);
            } else if (pathname === '/api/rtsp/status') {
                await this.handleRTSPStatus(req, res);
            } else if (pathname === '/api/rtsp/streams') {
                await this.handleStreamStatus(req, res);
            } else if (pathname.startsWith('/stream_output/')) {
                await this.serveStreamFile(pathname, res);
            } else if (pathname.startsWith('/api/stream/start')) {
                await this.handleStreamStart(req, res);
            } else if (pathname.startsWith('/api/stream/stop')) {
                await this.handleStreamStop(req, res);
            } else if (fs.existsSync(path.join(__dirname, pathname.slice(1)))) {
                await this.serveFile(path.join(__dirname, pathname.slice(1)), res);
            } else {
                this.send404(res);
            }
        } catch (error) {
            console.error('❌ Ошибка обработки запроса:', error);
            this.sendError(res, 500, 'Внутренняя ошибка сервера');
        }
    }

    /**
     * Обработка переключения RTSP режима
     */
    async handleRTSPToggle(req, res) {
        if (req.method !== 'POST') {
            this.sendError(res, 405, 'Метод не поддерживается');
            return;
        }

        try {
            // Проверка доступности FFmpeg
            const ffmpegAvailable = await RTSPStreamManager.checkFFmpegAvailability();
            if (!ffmpegAvailable) {
                this.sendJSON(res, {
                    success: false,
                    error: 'FFmpeg не установлен или недоступен'
                });
                return;
            }

            this.isRTSPEnabled = !this.isRTSPEnabled;

            if (this.isRTSPEnabled) {
                console.log('🎥 RTSP режим включен');
                await this.startCurrentApartmentStreams();
            } else {
                console.log('🛑 RTSP режим выключен');
                await this.streamManager.stopAllStreams();
            }

            this.sendJSON(res, {
                success: true,
                rtspEnabled: this.isRTSPEnabled,
                message: this.isRTSPEnabled ? 'RTSP режим включен' : 'RTSP режим выключен'
            });

        } catch (error) {
            console.error('❌ Ошибка переключения RTSP:', error);
            this.sendJSON(res, {
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Обработка статуса RTSP
     */
    async handleRTSPStatus(req, res) {
        const activeStreams = this.streamManager.getActiveStreams();
        const ffmpegAvailable = await RTSPStreamManager.checkFFmpegAvailability();

        this.sendJSON(res, {
            rtspEnabled: this.isRTSPEnabled,
            ffmpegAvailable: ffmpegAvailable,
            activeStreamCount: Object.keys(activeStreams).length,
            activeStreams: activeStreams
        });
    }

    /**
     * Обработка статуса потоков
     */
    async handleStreamStatus(req, res) {
        const activeStreams = this.streamManager.getActiveStreams();
        this.sendJSON(res, activeStreams);
    }

    /**
     * Запуск потоков для текущей квартиры
     */
    async startCurrentApartmentStreams() {
        if (!this.isRTSPEnabled || !this.currentConfig) return;

        const apartments = this.currentConfig.apartments;
        if (!apartments || apartments.length === 0) return;

        const currentApartment = apartments[this.currentApartmentIndex];
        const apartmentCameras = this.currentConfig.cameras.filter(
            camera => camera.apartment_name === currentApartment.apartment_name && camera.enabled
        );

        console.log(`🏠 Запуск потоков для квартиры: ${currentApartment.apartment_name}`);

        // Остановка всех текущих потоков
        await this.streamManager.stopAllStreams();

        // Запуск потоков для камер текущей квартиры (низкое качество для сетки)
        const startPromises = apartmentCameras.map(async (camera) => {
            try {
                await this.streamManager.startStream(camera, 'low');
            } catch (error) {
                console.error(`❌ Не удалось запустить поток для камеры ${camera.camera_name}:`, error.message);
            }
        });

        await Promise.all(startPromises);
    }

    /**
     * Обработка запуска конкретного потока
     */
    async handleStreamStart(req, res) {
        if (req.method !== 'POST') {
            this.sendError(res, 405, 'Метод не поддерживается');
            return;
        }

        try {
            const body = await this.parseJSON(req);
            const { cameraId, quality = 'low' } = body;

            const camera = this.currentConfig.cameras.find(c => c.id === cameraId);
            if (!camera) {
                this.sendJSON(res, {
                    success: false,
                    error: 'Камера не найдена'
                });
                return;
            }

            const streamId = await this.streamManager.startStream(camera, quality);
            
            this.sendJSON(res, {
                success: true,
                streamId: streamId,
                streamUrl: this.streamManager.getStreamUrl(streamId)
            });

        } catch (error) {
            console.error('❌ Ошибка запуска потока:', error);
            this.sendJSON(res, {
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Обработка остановки потока
     */
    async handleStreamStop(req, res) {
        if (req.method !== 'POST') {
            this.sendError(res, 405, 'Метод не поддерживается');
            return;
        }

        try {
            const body = await this.parseJSON(req);
            const { streamId } = body;

            await this.streamManager.stopStream(streamId);
            
            this.sendJSON(res, {
                success: true,
                message: 'Поток остановлен'
            });

        } catch (error) {
            console.error('❌ Ошибка остановки потока:', error);
            this.sendJSON(res, {
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Обслуживание файлов потоков
     */
    async serveStreamFile(pathname, res) {
        const filePath = path.join(__dirname, pathname);
        
        try {
            if (fs.existsSync(filePath)) {
                const ext = path.extname(filePath);
                let contentType = 'application/octet-stream';
                
                if (ext === '.m3u8') {
                    contentType = 'application/vnd.apple.mpegurl';
                } else if (ext === '.ts') {
                    contentType = 'video/mp2t';
                }
                
                res.setHeader('Content-Type', contentType);
                res.setHeader('Cache-Control', 'no-cache');
                
                const stream = fs.createReadStream(filePath);
                stream.pipe(res);
            } else {
                this.send404(res);
            }
        } catch (error) {
            console.error('❌ Ошибка обслуживания файла потока:', error);
            this.send404(res);
        }
    }

    /**
     * Обработка квартир с учетом RTSP
     */
    async handleApartments(req, res) {
        if (req.method === 'GET') {
            // Добавление информации о текущих потоках
            const apartments = this.currentConfig.apartments.map(apt => {
                const cameras = this.currentConfig.cameras.filter(
                    cam => cam.apartment_name === apt.apartment_name
                );
                
                // Добавление URL потоков для камер
                const camerasWithStreams = cameras.map(camera => {
                    const streamId = `${camera.id}_low`;
                    const status = this.streamManager.getStreamStatus(streamId);
                    
                    return {
                        ...camera,
                        streamUrl: this.isRTSPEnabled && status === 'streaming' 
                            ? this.streamManager.getStreamUrl(streamId) 
                            : null,
                        streamStatus: status
                    };
                });

                return {
                    ...apt,
                    cameras: camerasWithStreams,
                    isActive: this.currentApartmentIndex === this.currentConfig.apartments.indexOf(apt)
                };
            });

            this.sendJSON(res, { 
                apartments,
                rtspEnabled: this.isRTSPEnabled,
                currentIndex: this.currentApartmentIndex
            });
        }
    }

    /**
     * Обработка камер
     */
    async handleCameras(req, res) {
        if (req.method === 'GET') {
            const cameras = this.currentConfig.cameras.map(camera => {
                const streamIdLow = `${camera.id}_low`;
                const streamIdHigh = `${camera.id}_high`;
                
                return {
                    ...camera,
                    streams: {
                        low: {
                            url: this.isRTSPEnabled ? this.streamManager.getStreamUrl(streamIdLow) : null,
                            status: this.streamManager.getStreamStatus(streamIdLow)
                        },
                        high: {
                            url: this.isRTSPEnabled ? this.streamManager.getStreamUrl(streamIdHigh) : null,
                            status: this.streamManager.getStreamStatus(streamIdHigh)
                        }
                    }
                };
            });

            this.sendJSON(res, cameras);
        }
    }

    /**
     * Остальные методы остаются как в оригинальном simple-server.cjs
     */
    async handleLogin(req, res) {
        if (req.method !== 'POST') {
            this.sendError(res, 405, 'Метод не поддерживается');
            return;
        }

        try {
            const body = await this.parseJSON(req);
            const { login, password } = body;

            const user = this.currentConfig.users.find(u => u.login === login);
            if (!user) {
                this.sendJSON(res, { success: false, error: 'Неверные учетные данные' });
                return;
            }

            const passwordMatch = await bcrypt.compare(password, user.password_hash);
            if (!passwordMatch) {
                this.sendJSON(res, { success: false, error: 'Неверные учетные данные' });
                return;
            }

            const sessionId = this.generateSessionId();
            this.sessions.set(sessionId, {
                login: user.login,
                role: user.role,
                loginTime: new Date()
            });

            this.sendJSON(res, {
                success: true,
                sessionId: sessionId,
                role: user.role
            });

        } catch (error) {
            console.error('❌ Ошибка авторизации:', error);
            this.sendJSON(res, { success: false, error: 'Ошибка сервера' });
        }
    }

    // Утилитарные методы
    generateSessionId() {
        return Math.random().toString(36).substring(2, 15) + 
               Math.random().toString(36).substring(2, 15);
    }

    async parseJSON(req) {
        return new Promise((resolve, reject) => {
            let body = '';
            req.on('data', chunk => body += chunk.toString());
            req.on('end', () => {
                try {
                    resolve(JSON.parse(body));
                } catch (error) {
                    reject(error);
                }
            });
        });
    }

    sendJSON(res, data) {
        res.setHeader('Content-Type', 'application/json');
        res.writeHead(200);
        res.end(JSON.stringify(data));
    }

    sendError(res, status, message) {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: message }));
    }

    send404(res) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('404 - Страница не найдена');
    }

    async serveFile(filePath, res) {
        try {
            if (fs.existsSync(filePath)) {
                const ext = path.extname(filePath);
                const contentTypes = {
                    '.html': 'text/html; charset=utf-8',
                    '.css': 'text/css',
                    '.js': 'application/javascript',
                    '.json': 'application/json',
                    '.png': 'image/png',
                    '.jpg': 'image/jpeg',
                    '.gif': 'image/gif',
                    '.ico': 'image/x-icon'
                };
                
                res.setHeader('Content-Type', contentTypes[ext] || 'text/plain');
                const stream = fs.createReadStream(filePath);
                stream.pipe(res);
            } else {
                this.send404(res);
            }
        } catch (error) {
            console.error('❌ Ошибка обслуживания файла:', error);
            this.send404(res);
        }
    }

    /**
     * Запуск сервера
     */
    listen(port = 3000) {
        this.server.listen(port, () => {
            console.log(`🌐 RTSP Integration Server запущен на порту ${port}`);
            console.log(`📱 Откройте http://localhost:${port} в браузере`);
            console.log(`🎥 RTSP режим: ${this.isRTSPEnabled ? 'включен' : 'выключен'}`);
        });
    }

    /**
     * Корректное завершение работы
     */
    async shutdown() {
        console.log('🛑 Завершение работы сервера...');
        
        if (this.cycleTimer) {
            clearInterval(this.cycleTimer);
        }
        
        await this.streamManager.stopAllStreams();
        
        this.server.close(() => {
            console.log('✅ Сервер остановлен');
            process.exit(0);
        });
    }
}

// Запуск сервера
const server = new RTSPIntegrationServer();
server.listen(3000);

// Корректное завершение при сигналах
process.on('SIGINT', () => server.shutdown());
process.on('SIGTERM', () => server.shutdown());
