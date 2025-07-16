/**
 * RTSP Stream Manager - Управление реальными видеопотоками через FFmpeg
 * Интеграция для замены mock видео в системе видеонаблюдения
 */

const { spawn } = require('child_process');
const EventEmitter = require('events');
const path = require('path');
const fs = require('fs');

class RTSPStreamManager extends EventEmitter {
    constructor() {
        super();
        this.activeStreams = new Map(); // Активные FFmpeg процессы
        this.streamBuffer = new Map(); // Буферы для каждого потока
        this.connectionAttempts = new Map(); // Счетчики попыток подключения
        this.reconnectTimers = new Map(); // Таймеры переподключения
        
        // Настройки
        this.config = {
            maxRetries: 5,
            retryInterval: 30000, // 30 секунд
            connectionTimeout: 10000, // 10 секунд
            bufferSize: 1024 * 1024, // 1MB буфер
            outputDir: './stream_output',
            ffmpegPath: 'ffmpeg' // Путь к FFmpeg
        };
        
        this.ensureOutputDirectory();
    }

    /**
     * Создание директории для выходных потоков
     */
    ensureOutputDirectory() {
        if (!fs.existsSync(this.config.outputDir)) {
            fs.mkdirSync(this.config.outputDir, { recursive: true });
        }
    }

    /**
     * Запуск RTSP потока с двойным качеством
     * @param {Object} camera - Объект камеры из конфигурации
     * @param {string} quality - 'low' (480p) или 'high' (1080p)
     */
    async startStream(camera, quality = 'low') {
        const streamId = `${camera.id}_${quality}`;
        
        try {
            // Остановка существующего потока если есть
            if (this.activeStreams.has(streamId)) {
                await this.stopStream(streamId);
            }

            // Выбор RTSP URL в зависимости от качества
            const rtspUrl = quality === 'high' ? camera.rtsp_hd_link : camera.rtsp_link;
            
            if (!rtspUrl) {
                throw new Error(`RTSP URL не найден для камеры ${camera.camera_name} (${quality})`);
            }

            // Настройки FFmpeg для разных качеств
            const ffmpegArgs = this.buildFFmpegArgs(rtspUrl, streamId, quality);
            
            console.log(`🎥 Запуск потока ${camera.camera_name} (${quality})`);
            console.log(`📡 RTSP: ${rtspUrl}`);

            // Запуск FFmpeg процесса
            const ffmpegProcess = spawn(this.config.ffmpegPath, ffmpegArgs);
            
            // Сохранение процесса
            this.activeStreams.set(streamId, {
                process: ffmpegProcess,
                camera: camera,
                quality: quality,
                startTime: Date.now(),
                status: 'connecting'
            });

            // Настройка обработчиков событий
            this.setupFFmpegHandlers(streamId, ffmpegProcess, camera);

            // Таймаут подключения
            const connectionTimer = setTimeout(() => {
                if (this.activeStreams.get(streamId)?.status === 'connecting') {
                    console.log(`⏰ Таймаут подключения для ${camera.camera_name}`);
                    this.handleStreamError(streamId, new Error('Connection timeout'));
                }
            }, this.config.connectionTimeout);

            // Сохранение таймера
            this.activeStreams.get(streamId).connectionTimer = connectionTimer;

            return streamId;

        } catch (error) {
            console.error(`❌ Ошибка запуска потока ${camera.camera_name}:`, error.message);
            this.emit('streamError', { camera, error: error.message });
            throw error;
        }
    }

    /**
     * Построение аргументов для FFmpeg
     */
    buildFFmpegArgs(rtspUrl, streamId, quality) {
        const outputPath = path.join(this.config.outputDir, `${streamId}.m3u8`);
        
        const baseArgs = [
            '-y', // Перезаписывать выходные файлы
            '-fflags', '+genpts', // Генерировать PTS
            '-thread_queue_size', '512',
            '-analyzeduration', '5000000',
            '-probesize', '5000000',
            '-i', rtspUrl
        ];

        // Настройки в зависимости от качества
        const qualityArgs = quality === 'high' ? [
            // Высокое качество (1080p)
            '-c:v', 'libx264',
            '-preset', 'ultrafast',
            '-tune', 'zerolatency',
            '-s', '1920x1080',
            '-r', '25',
            '-b:v', '4M',
            '-maxrate', '4M',
            '-bufsize', '8M'
        ] : [
            // Низкое качество (480p)
            '-c:v', 'libx264',
            '-preset', 'ultrafast',
            '-tune', 'zerolatency',
            '-s', '640x480',
            '-r', '15',
            '-b:v', '1M',
            '-maxrate', '1M',
            '-bufsize', '2M'
        ];

        const hlsArgs = [
            // HLS настройки
            '-f', 'hls',
            '-hls_time', '2',
            '-hls_list_size', '3',
            '-hls_flags', 'delete_segments+independent_segments',
            '-hls_segment_filename', path.join(this.config.outputDir, `${streamId}_%03d.ts`),
            outputPath
        ];

        return [...baseArgs, ...qualityArgs, ...hlsArgs];
    }

    /**
     * Настройка обработчиков событий FFmpeg
     */
    setupFFmpegHandlers(streamId, ffmpegProcess, camera) {
        const streamData = this.activeStreams.get(streamId);

        // Обработка stdout
        ffmpegProcess.stdout.on('data', (data) => {
            // FFmpeg пишет в stderr, но на всякий случай
        });

        // Обработка stderr (основной вывод FFmpeg)
        ffmpegProcess.stderr.on('data', (data) => {
            const output = data.toString();
            
            // Поиск индикаторов успешного подключения
            if (output.includes('fps=') || output.includes('bitrate=')) {
                if (streamData.status === 'connecting') {
                    console.log(`✅ Поток подключен: ${camera.camera_name}`);
                    streamData.status = 'streaming';
                    
                    // Очистка таймера подключения
                    if (streamData.connectionTimer) {
                        clearTimeout(streamData.connectionTimer);
                        delete streamData.connectionTimer;
                    }
                    
                    this.emit('streamConnected', { streamId, camera });
                    this.resetConnectionAttempts(streamId);
                }
            }

            // Обработка ошибок
            if (output.includes('Connection failed') || 
                output.includes('No route to host') ||
                output.includes('Connection refused')) {
                this.handleStreamError(streamId, new Error('Connection failed'));
            }
        });

        // Обработка завершения процесса
        ffmpegProcess.on('close', (code, signal) => {
            console.log(`🔄 FFmpeg завершен для ${camera.camera_name}, код: ${code}, сигнал: ${signal}`);
            
            if (streamData.status === 'streaming' && code !== 0 && !signal) {
                // Неожиданное завершение - попытка переподключения
                this.handleStreamError(streamId, new Error(`FFmpeg exited with code ${code}`));
            } else {
                // Нормальное завершение
                this.cleanupStream(streamId);
            }
        });

        // Обработка ошибок процесса
        ffmpegProcess.on('error', (error) => {
            console.error(`❌ Ошибка FFmpeg процесса ${camera.camera_name}:`, error.message);
            this.handleStreamError(streamId, error);
        });
    }

    /**
     * Обработка ошибок потока
     */
    async handleStreamError(streamId, error) {
        const streamData = this.activeStreams.get(streamId);
        if (!streamData) return;

        console.error(`⚠️ Ошибка потока ${streamData.camera.camera_name}:`, error.message);
        
        // Увеличение счетчика попыток
        const attempts = (this.connectionAttempts.get(streamId) || 0) + 1;
        this.connectionAttempts.set(streamId, attempts);

        // Уведомление об ошибке
        this.emit('streamError', { 
            streamId, 
            camera: streamData.camera, 
            error: error.message, 
            attempts 
        });

        // Очистка текущего потока
        this.cleanupStream(streamId);

        // Попытка переподключения
        if (attempts < this.config.maxRetries) {
            console.log(`🔄 Попытка переподключения ${attempts}/${this.config.maxRetries} через ${this.config.retryInterval/1000}с`);
            
            const reconnectTimer = setTimeout(async () => {
                try {
                    await this.startStream(streamData.camera, streamData.quality);
                } catch (retryError) {
                    console.error(`❌ Ошибка переподключения:`, retryError.message);
                }
                this.reconnectTimers.delete(streamId);
            }, this.config.retryInterval);

            this.reconnectTimers.set(streamId, reconnectTimer);
        } else {
            console.error(`💀 Максимальное количество попыток исчерпано для ${streamData.camera.camera_name}`);
            this.emit('streamFailed', { streamId, camera: streamData.camera });
        }
    }

    /**
     * Остановка потока
     */
    async stopStream(streamId) {
        const streamData = this.activeStreams.get(streamId);
        if (!streamData) return;

        console.log(`🛑 Остановка потока ${streamData.camera.camera_name}`);

        // Остановка процесса FFmpeg
        if (streamData.process && !streamData.process.killed) {
            streamData.process.kill('SIGTERM');
            
            // Принудительное завершение через 5 секунд
            setTimeout(() => {
                if (!streamData.process.killed) {
                    streamData.process.kill('SIGKILL');
                }
            }, 5000);
        }

        this.cleanupStream(streamId);
    }

    /**
     * Очистка ресурсов потока
     */
    cleanupStream(streamId) {
        const streamData = this.activeStreams.get(streamId);
        
        // Очистка таймеров
        if (streamData?.connectionTimer) {
            clearTimeout(streamData.connectionTimer);
        }
        
        const reconnectTimer = this.reconnectTimers.get(streamId);
        if (reconnectTimer) {
            clearTimeout(reconnectTimer);
            this.reconnectTimers.delete(streamId);
        }

        // Удаление из активных потоков
        this.activeStreams.delete(streamId);

        // Очистка выходных файлов
        this.cleanupStreamFiles(streamId);
    }

    /**
     * Очистка файлов потока
     */
    cleanupStreamFiles(streamId) {
        try {
            const outputDir = this.config.outputDir;
            const files = fs.readdirSync(outputDir);
            
            files.forEach(file => {
                if (file.startsWith(streamId)) {
                    const filePath = path.join(outputDir, file);
                    fs.unlinkSync(filePath);
                }
            });
        } catch (error) {
            console.error(`Ошибка очистки файлов для ${streamId}:`, error.message);
        }
    }

    /**
     * Сброс счетчика попыток подключения
     */
    resetConnectionAttempts(streamId) {
        this.connectionAttempts.delete(streamId);
    }

    /**
     * Получение URL для воспроизведения
     */
    getStreamUrl(streamId) {
        return `/stream_output/${streamId}.m3u8`;
    }

    /**
     * Получение статуса потока
     */
    getStreamStatus(streamId) {
        const streamData = this.activeStreams.get(streamId);
        if (!streamData) return 'stopped';
        
        return streamData.status;
    }

    /**
     * Получение информации о всех активных потоках
     */
    getActiveStreams() {
        const streams = {};
        
        this.activeStreams.forEach((data, streamId) => {
            streams[streamId] = {
                camera: data.camera,
                quality: data.quality,
                status: data.status,
                uptime: Date.now() - data.startTime,
                attempts: this.connectionAttempts.get(streamId) || 0
            };
        });

        return streams;
    }

    /**
     * Остановка всех потоков
     */
    async stopAllStreams() {
        console.log('🛑 Остановка всех RTSP потоков...');
        
        const stopPromises = Array.from(this.activeStreams.keys()).map(streamId => 
            this.stopStream(streamId)
        );

        await Promise.all(stopPromises);
        
        // Очистка всех таймеров
        this.reconnectTimers.forEach(timer => clearTimeout(timer));
        this.reconnectTimers.clear();
        this.connectionAttempts.clear();
        
        console.log('✅ Все потоки остановлены');
    }

    /**
     * Проверка доступности FFmpeg
     */
    static async checkFFmpegAvailability() {
        return new Promise((resolve) => {
            const ffmpeg = spawn('ffmpeg', ['-version']);
            
            ffmpeg.on('close', (code) => {
                resolve(code === 0);
            });
            
            ffmpeg.on('error', () => {
                resolve(false);
            });
        });
    }
}

module.exports = RTSPStreamManager;
