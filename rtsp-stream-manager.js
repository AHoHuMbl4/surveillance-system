/**
 * RTSP Stream Manager - Управление реальными видеопотоками через FFmpeg с поддержкой аудио
 * Финальная версия для системы видеонаблюдения
 */

import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class RTSPStreamManager extends EventEmitter {
    constructor() {
        super();
        this.activeStreams = new Map(); // Активные FFmpeg процессы
        this.streamBuffer = new Map(); // Буферы для каждого потока
        this.connectionAttempts = new Map(); // Счетчики попыток подключения
        this.reconnectTimers = new Map(); // Таймеры переподключения
        this.audioStreams = new Map(); // Аудио потоки
        this.currentAudioStream = null; // Текущий активный аудио поток (эксклюзивный)
        
        // Настройки
        this.config = {
            maxRetries: 5,
            retryInterval: 30000, // 30 секунд
            connectionTimeout: 15000, // 15 секунд
            bufferSize: 1024 * 1024, // 1MB буфер
            outputDir: './stream_output',
            audioOutputDir: './audio_output',
            ffmpegPath: 'ffmpeg', // Путь к FFmpeg
            audioCodecs: ['aac', 'pcm_mulaw', 'pcm_alaw'], // Поддерживаемые аудио кодеки
            videoCodecs: ['h264', 'h265', 'mjpeg'] // Поддерживаемые видео кодеки
        };
        
        this.ensureOutputDirectories();
        console.log('🎥 RTSP Stream Manager инициализирован с поддержкой аудио');
    }

    /**
     * Создание директорий для выходных потоков
     */
    ensureOutputDirectories() {
        [this.config.outputDir, this.config.audioOutputDir].forEach(dir => {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
                console.log(`📁 Создана директория: ${dir}`);
            }
        });
    }

    /**
     * Проверка доступности FFmpeg
     */
    async checkFFmpegAvailability() {
        return new Promise((resolve) => {
            const process = spawn(this.config.ffmpegPath, ['-version']);
            
            process.on('close', (code) => {
                if (code === 0) {
                    console.log('✅ FFmpeg доступен');
                    resolve(true);
                } else {
                    console.log('❌ FFmpeg недоступен');
                    resolve(false);
                }
            });

            process.on('error', () => {
                console.log('❌ FFmpeg не найден в системе');
                resolve(false);
            });
        });
    }

    /**
     * Запуск RTSP потока с поддержкой видео и аудио
     * @param {Object} camera - Объект камеры из конфигурации
     * @param {string} quality - 'low' (480p) или 'high' (1080p)
     * @param {boolean} includeAudio - Включать ли аудио поток
     */
    async startStream(camera, quality = 'low', includeAudio = false) {
        const streamId = `${camera.id}_${quality}`;
        
        try {
            // Остановка существующего потока если есть
            if (this.activeStreams.has(streamId)) {
                await this.stopStream(streamId);
            }

            // Анализ RTSP URL для определения поддерживаемых кодеков
            await this.analyzeRTSPStream(camera.rtsp_link);

            // Выбор RTSP URL в зависимости от качества
            const rtspUrl = quality === 'high' ? 
                (camera.rtsp_link_high || camera.rtsp_link) : 
                camera.rtsp_link;

            console.log(`🎬 Запуск ${quality} потока для ${camera.camera_name}...`);

            // Создание объекта потока
            const streamData = {
                id: streamId,
                camera: camera,
                quality: quality,
                rtspUrl: rtspUrl,
                status: 'connecting',
                process: null,
                audioProcess: null,
                startTime: Date.now(),
                includeAudio: includeAudio
            };

            // Запуск видео потока
            const videoProcess = await this.startVideoProcess(streamData);
            streamData.process = videoProcess;

            // Запуск аудио потока если требуется
            if (includeAudio) {
                const audioProcess = await this.startAudioProcess(streamData);
                streamData.audioProcess = audioProcess;
            }

            this.activeStreams.set(streamId, streamData);
            this.connectionAttempts.set(streamId, 0);

            // Настройка обработчиков событий
            this.setupFFmpegHandlers(streamId, videoProcess, camera);
            
            if (streamData.audioProcess) {
                this.setupAudioHandlers(streamId, streamData.audioProcess, camera);
            }

            return streamId;

        } catch (error) {
            console.error(`❌ Ошибка запуска потока ${camera.camera_name}:`, error.message);
            this.handleStreamError(streamId, camera, error);
            throw error;
        }
    }

    /**
     * Анализ RTSP потока для определения поддерживаемых кодеков
     */
    async analyzeRTSPStream(rtspUrl) {
        return new Promise((resolve, reject) => {
            const analyzeArgs = [
                '-i', rtspUrl,
                '-t', '1',
                '-f', 'null',
                '-'
            ];

            const analyzeProcess = spawn(this.config.ffmpegPath, analyzeArgs);
            let stderr = '';

            analyzeProcess.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            analyzeProcess.on('close', (code) => {
                // Анализ вывода для определения кодеков
                const hasVideo = stderr.includes('Video:');
                const hasAudio = stderr.includes('Audio:');
                const videoCodec = this.extractCodec(stderr, 'Video');
                const audioCodec = this.extractCodec(stderr, 'Audio');

                console.log(`🔍 Анализ потока: видео=${hasVideo}(${videoCodec}), аудио=${hasAudio}(${audioCodec})`);
                resolve({ hasVideo, hasAudio, videoCodec, audioCodec });
            });

            analyzeProcess.on('error', (error) => {
                console.warn(`⚠️ Не удалось проанализировать поток: ${error.message}`);
                resolve({ hasVideo: true, hasAudio: false }); // Предполагаем базовую поддержку
            });

            // Таймаут для анализа
            setTimeout(() => {
                analyzeProcess.kill('SIGTERM');
                resolve({ hasVideo: true, hasAudio: false });
            }, 5000);
        });
    }

    /**
     * Извлечение информации о кодеке из вывода FFmpeg
     */
    extractCodec(stderr, streamType) {
        const regex = new RegExp(`${streamType}:\\s*([^\\s,]+)`, 'i');
        const match = stderr.match(regex);
        return match ? match[1].toLowerCase() : 'unknown';
    }

    /**
     * Запуск видео процесса FFmpeg
     */
    async startVideoProcess(streamData) {
        const outputPath = path.join(this.config.outputDir, `${streamData.id}.m3u8`);
        const ffmpegArgs = this.buildVideoFFmpegArgs(streamData.rtspUrl, outputPath, streamData.quality);
        
        console.log(`🚀 Запуск видео FFmpeg: ${this.config.ffmpegPath} ${ffmpegArgs.join(' ')}`);
        
        const process = spawn(this.config.ffmpegPath, ffmpegArgs);
        
        return process;
    }

    /**
     * Запуск аудио процесса FFmpeg
     */
    async startAudioProcess(streamData) {
        // Остановка предыдущего аудио потока (эксклюзивность)
        if (this.currentAudioStream && this.currentAudioStream !== streamData.id) {
            await this.stopAudioStream(this.currentAudioStream);
        }

        const audioOutputPath = path.join(this.config.audioOutputDir, `${streamData.id}_audio.m3u8`);
        const audioArgs = this.buildAudioFFmpegArgs(streamData.rtspUrl, audioOutputPath);
        
        console.log(`🔊 Запуск аудио FFmpeg: ${this.config.ffmpegPath} ${audioArgs.join(' ')}`);
        
        const audioProcess = spawn(this.config.ffmpegPath, audioArgs);
        this.currentAudioStream = streamData.id;
        this.audioStreams.set(streamData.id, audioProcess);
        
        return audioProcess;
    }

    /**
     * Построение аргументов для аудио FFmpeg
     */
    buildAudioFFmpegArgs(rtspUrl, outputPath) {
        return [
            '-i', rtspUrl,
            '-timeout', '10000000',
            '-fflags', '+genpts',
            '-avoid_negative_ts', 'make_zero',
            
            // Только аудио
            '-vn',
            '-c:a', 'aac',
            '-ar', '44100',
            '-ac', '2',
            '-b:a', '128k',
            
            // HLS настройки для аудио
            '-f', 'hls',
            '-hls_time', '2',
            '-hls_list_size', '3',
            '-hls_flags', 'delete_segments+independent_segments',
            '-hls_segment_filename', path.join(this.config.audioOutputDir, `${path.basename(outputPath, '.m3u8')}_audio_%03d.ts`),
            outputPath
        ];
    }

    /**
     * Построение аргументов FFmpeg для видео
     */
    buildVideoFFmpegArgs(rtspUrl, outputPath, quality) {
        const streamId = path.basename(outputPath, '.m3u8');
        
        const baseArgs = [
            '-i', rtspUrl,
            '-timeout', '10000000',
            '-fflags', '+genpts',
            '-avoid_negative_ts', 'make_zero',
            '-reconnect', '1',
            '-reconnect_streamed', '1',
            '-reconnect_delay_max', '2'
        ];

        const qualityArgs = quality === 'high' ? [
            // Высокое качество (1080p)
            '-c:v', 'libx264',
            '-preset', 'ultrafast',
            '-tune', 'zerolatency',
            '-s', '1920x1080',
            '-r', '25',
            '-b:v', '4M',
            '-maxrate', '4M',
            '-bufsize', '8M',
            // Убираем аудио из видео потока
            '-an'
        ] : [
            // Низкое качество (480p)
            '-c:v', 'libx264',
            '-preset', 'ultrafast',
            '-tune', 'zerolatency',
            '-s', '640x480',
            '-r', '15',
            '-b:v', '1M',
            '-maxrate', '1M',
            '-bufsize', '2M',
            // Убираем аудио из видео потока
            '-an'
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
     * Настройка обработчиков событий FFmpeg для видео
     */
    setupFFmpegHandlers(streamId, ffmpegProcess, camera) {
        const streamData = this.activeStreams.get(streamId);

        ffmpegProcess.stderr.on('data', (data) => {
            const output = data.toString();
            
            // Поиск индикаторов успешного подключения
            if (output.includes('fps=') || output.includes('bitrate=')) {
                if (streamData.status === 'connecting') {
                    console.log(`✅ Видео поток подключен: ${camera.camera_name}`);
                    streamData.status = 'streaming';
                    this.emit('streamConnected', { streamId, camera, type: 'video' });
                }
            }

            // Обработка ошибок
            if (output.includes('Connection refused') || 
                output.includes('Connection timed out') ||
                output.includes('No route to host')) {
                this.handleStreamError(streamId, camera, new Error(output));
            }
        });

        ffmpegProcess.on('error', (error) => {
            console.error(`💥 FFmpeg процесс ошибка:`, error);
            this.handleStreamError(streamId, camera, error);
        });

        ffmpegProcess.on('close', (code) => {
            console.log(`🔌 FFmpeg процесс завершен (код ${code}): ${camera.camera_name}`);
            if (code !== 0 && streamData.status === 'streaming') {
                this.handleStreamError(streamId, camera, new Error(`FFmpeg завершен с кодом ${code}`));
            }
        });
    }

    /**
     * Настройка обработчиков событий для аудио процесса
     */
    setupAudioHandlers(streamId, audioProcess, camera) {
        audioProcess.stderr.on('data', (data) => {
            const output = data.toString();
            
            if (output.includes('fps=') || output.includes('size=')) {
                console.log(`🔊 Аудио поток активен: ${camera.camera_name}`);
                this.emit('audioStreamConnected', { streamId, camera });
            }
        });

        audioProcess.on('error', (error) => {
            console.error(`💥 Аудио процесс ошибка:`, error);
            this.emit('audioStreamError', { streamId, camera, error });
        });

        audioProcess.on('close', (code) => {
            console.log(`🔇 Аудио процесс завершен (код ${code}): ${camera.camera_name}`);
            this.audioStreams.delete(streamId);
            if (this.currentAudioStream === streamId) {
                this.currentAudioStream = null;
            }
        });
    }

    /**
     * Управление аудио - включение/выключение для конкретной камеры
     */
    async toggleAudio(cameraId, quality = 'low') {
        const streamId = `${cameraId}_${quality}`;
        const streamData = this.activeStreams.get(streamId);
        
        if (!streamData) {
            throw new Error(`Поток не найден: ${streamId}`);
        }

        // Если аудио уже активно для этой камеры - выключаем
        if (this.currentAudioStream === streamId) {
            await this.stopAudioStream(streamId);
            console.log(`🔇 Аудио выключено: ${streamData.camera.camera_name}`);
            this.emit('audioStopped', { streamId, camera: streamData.camera });
            return false;
        }

        // Включаем аудио для новой камеры
        try {
            const audioProcess = await this.startAudioProcess(streamData);
            streamData.audioProcess = audioProcess;
            this.setupAudioHandlers(streamId, audioProcess, streamData.camera);
            
            console.log(`🔊 Аудио включено: ${streamData.camera.camera_name}`);
            this.emit('audioStarted', { streamId, camera: streamData.camera });
            return true;
        } catch (error) {
            console.error(`❌ Ошибка включения аудио:`, error);
            this.emit('audioError', { streamId, camera: streamData.camera, error });
            return false;
        }
    }

    /**
     * Остановка аудио потока
     */
    async stopAudioStream(streamId) {
        const audioProcess = this.audioStreams.get(streamId);
        if (audioProcess) {
            audioProcess.kill('SIGTERM');
            this.audioStreams.delete(streamId);
        }

        if (this.currentAudioStream === streamId) {
            this.currentAudioStream = null;
        }

        // Очистка аудио файлов
        try {
            const audioFiles = fs.readdirSync(this.config.audioOutputDir)
                .filter(file => file.startsWith(streamId));
            
            audioFiles.forEach(file => {
                fs.unlinkSync(path.join(this.config.audioOutputDir, file));
            });
        } catch (error) {
            console.warn(`⚠️ Не удалось очистить аудио файлы:`, error.message);
        }
    }

    /**
     * Остановка потока
     */
    async stopStream(streamId) {
        const streamData = this.activeStreams.get(streamId);
        
        if (streamData) {
            console.log(`🛑 Остановка потока: ${streamData.camera.camera_name}`);
            
            // Остановка видео процесса
            if (streamData.process) {
                streamData.process.kill('SIGTERM');
            }

            // Остановка аудио процесса
            if (streamData.audioProcess) {
                await this.stopAudioStream(streamId);
            }

            this.activeStreams.delete(streamId);
            this.connectionAttempts.delete(streamId);
            
            // Очистка таймера переподключения
            if (this.reconnectTimers.has(streamId)) {
                clearTimeout(this.reconnectTimers.get(streamId));
                this.reconnectTimers.delete(streamId);
            }

            // Удаление выходных файлов
            this.cleanupStreamFiles(streamId);
        }
    }

    /**
     * Получение статуса всех потоков
     */
    getStreamStatus() {
        const streams = {};
        
        for (const [streamId, streamData] of this.activeStreams) {
            streams[streamId] = {
                camera: streamData.camera,
                quality: streamData.quality,
                status: streamData.status,
                uptime: Date.now() - streamData.startTime,
                hasAudio: !!streamData.audioProcess,
                isCurrentAudio: this.currentAudioStream === streamId
            };
        }

        return {
            totalStreams: this.activeStreams.size,
            audioStreams: this.audioStreams.size,
            currentAudioStream: this.currentAudioStream,
            streams: streams
        };
    }

    /**
     * Обработка ошибок потока
     */
    handleStreamError(streamId, camera, error) {
        const attempts = (this.connectionAttempts.get(streamId) || 0) + 1;
        this.connectionAttempts.set(streamId, attempts);

        console.warn(`⚠️ Ошибка потока ${camera.camera_name}: ${error.message} (попытка ${attempts}/${this.config.maxRetries})`);
        this.emit('streamError', { streamId, camera, error, attempts });

        if (attempts >= this.config.maxRetries) {
            console.error(`💀 Поток окончательно недоступен: ${camera.camera_name}`);
            this.emit('streamFailed', { streamId, camera });
            this.stopStream(streamId);
        } else {
            // Планирование переподключения
            const timer = setTimeout(() => {
                console.log(`🔄 Попытка переподключения ${attempts + 1}: ${camera.camera_name}`);
                this.startStream(camera, streamData?.quality || 'low');
            }, this.config.retryInterval);
            
            this.reconnectTimers.set(streamId, timer);
        }
    }

    /**
     * Очистка файлов потока
     */
    cleanupStreamFiles(streamId) {
        try {
            // Очистка видео файлов
            const videoFiles = fs.readdirSync(this.config.outputDir)
                .filter(file => file.startsWith(streamId));
            
            videoFiles.forEach(file => {
                fs.unlinkSync(path.join(this.config.outputDir, file));
            });

            // Очистка аудио файлов
            const audioFiles = fs.readdirSync(this.config.audioOutputDir)
                .filter(file => file.startsWith(streamId));
            
            audioFiles.forEach(file => {
                fs.unlinkSync(path.join(this.config.audioOutputDir, file));
            });

        } catch (error) {
            console.warn(`⚠️ Ошибка очистки файлов для ${streamId}:`, error.message);
        }
    }

    /**
     * Остановка всех потоков
     */
    async stopAllStreams() {
        console.log('🛑 Остановка всех потоков...');
        const stopPromises = Array.from(this.activeStreams.keys()).map(streamId => 
            this.stopStream(streamId)
        );
        
        await Promise.all(stopPromises);
        console.log('✅ Все потоки остановлены');
    }
}

export default RTSPStreamManager;
