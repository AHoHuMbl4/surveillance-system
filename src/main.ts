// main.ts - Frontend для системы авторизации

import { invoke } from '@tauri-apps/api/tauri';

// Типы данных
interface LoginRequest {
    login: string;
    password: string;
}

interface LoginResponse {
    success: boolean;
    user?: User;
    message: string;
}

interface User {
    login: string;
    role: 'Admin' | 'Operator';
}

interface SystemStatus {
    is_authenticated: boolean;
    current_user?: string;
    user_role?: string;
    config_loaded: boolean;
    apartments_count: number;
    cameras_count: number;
}

interface Camera {
    id: number;
    camera_name: string;
    apartment_name: string;
    rtsp_link: string;
    enabled: boolean;
}

interface Apartment {
    id: number;
    apartment_name: string;
    apartment_number: string;
}

// Глобальные переменные
let currentUser: User | null = null;

// DOM элементы
const loginCard = document.getElementById('loginCard') as HTMLElement;
const mainScreen = document.getElementById('mainScreen') as HTMLElement;
const loginForm = document.getElementById('loginForm') as HTMLFormElement;
const errorMessage = document.getElementById('errorMessage') as HTMLElement;
const successMessage = document.getElementById('successMessage') as HTMLElement;
const loginBtn = document.getElementById('loginBtn') as HTMLButtonElement;

// Инициализация
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Приложение загружено');
    
    // Проверяем, авторизован ли пользователь
    await checkCurrentAuth();
    
    // Настраиваем обработчики событий
    setupEventListeners();
});

// Проверка текущей авторизации
async function checkCurrentAuth() {
    try {
        const isAuth = await invoke<boolean>('check_authentication');
        if (isAuth) {
            const user = await invoke<User>('get_current_user_info');
            if (user) {
                currentUser = user;
                showMainScreen();
                await loadSystemStatus();
            }
        }
    } catch (error) {
        console.error('Ошибка проверки авторизации:', error);
    }
}

// Настройка обработчиков событий
function setupEventListeners() {
    // Форма входа
    loginForm.addEventListener('submit', handleLogin);
    
    // Кнопка выхода
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }
    
    // Тестирование Tauri команд
    window.greet = async (name: string) => {
        try {
            const result = await invoke<string>('greet', { name });
            console.log('Тест greet:', result);
            return result;
        } catch (error) {
            console.error('Ошибка greet:', error);
        }
    };
}

// Обработка входа в систему
async function handleLogin(event: Event) {
    event.preventDefault();
    
    const formData = new FormData(loginForm);
    const loginRequest: LoginRequest = {
        login: formData.get('username') as string,
        password: formData.get('password') as string,
    };
    
    // Показываем индикатор загрузки
    setLoading(true);
    hideMessages();
    
    try {
        console.log('Попытка входа:', loginRequest.login);
        
        const response = await invoke<LoginResponse>('login', { request: loginRequest });
        
        if (response.success && response.user) {
            currentUser = response.user;
            showSuccess('Вход выполнен успешно!');
            
            // Небольшая задержка для показа сообщения
            setTimeout(() => {
                showMainScreen();
                loadSystemStatus();
            }, 1000);
        } else {
            showError(response.message || 'Ошибка авторизации');
        }
    } catch (error) {
        console.error('Ошибка входа:', error);
        showError('Ошибка соединения с сервером');
    } finally {
        setLoading(false);
    }
}

// Обработка выхода из системы
async function handleLogout() {
    try {
        await invoke('logout');
        currentUser = null;
        showLoginScreen();
        console.log('Выход выполнен');
    } catch (error) {
        console.error('Ошибка выхода:', error);
    }
}

// Показать экран входа
function showLoginScreen() {
    loginCard.classList.remove('hidden');
    mainScreen.classList.remove('active');
    
    // Очищаем форму
    loginForm.reset();
    hideMessages();
}

// Показать главный экран
function showMainScreen() {
    loginCard.classList.add('hidden');
    mainScreen.classList.add('active');
    
    // Обновляем информацию о пользователе
    updateUserInfo();
}

// Обновление информации о пользователе
function updateUserInfo() {
    if (!currentUser) return;
    
    const userAvatar = document.getElementById('userAvatar');
    const userName = document.getElementById('userName');
    const userRole = document.getElementById('userRole');
    
    if (userAvatar) {
        userAvatar.textContent = currentUser.login.charAt(0).toUpperCase();
    }
    
    if (userName) {
        userName.textContent = currentUser.login;
    }
    
    if (userRole) {
        const roleText = currentUser.role === 'Admin' ? 'Администратор' : 'Оператор';
        userRole.textContent = roleText;
    }
}

// Загрузка статуса системы
async function loadSystemStatus() {
    try {
        const status = await invoke<SystemStatus>('get_system_status');
        updateStatusDisplay(status);
    } catch (error) {
        console.error('Ошибка загрузки статуса:', error);
    }
}

// Обновление отображения статуса
function updateStatusDisplay(status: SystemStatus) {
    const apartmentsCount = document.getElementById('apartmentsCount');
    const camerasCount = document.getElementById('camerasCount');
    const connectionStatus = document.getElementById('connectionStatus');
    
    if (apartmentsCount) {
        apartmentsCount.textContent = status.apartments_count.toString();
    }
    
    if (camerasCount) {
        camerasCount.textContent = status.cameras_count.toString();
    }
    
    if (connectionStatus) {
        connectionStatus.textContent = status.config_loaded ? '✅' : '❌';
    }
}

// Загрузка данных системы
async function loadSystemData() {
    try {
        console.log('Загрузка конфигурации...');
        
        const config = await invoke('load_config');
        console.log('Конфигурация загружена:', config);
        
        const apartments = await invoke<Apartment[]>('get_apartments');
        console.log('Квартиры:', apartments);
        
        const cameras = await invoke<Camera[]>('get_cameras');
        console.log('Камеры:', cameras);
        
        // Обновляем статус
        await loadSystemStatus();
        
        alert('Данные системы загружены! Проверьте консоль для деталей.');
    } catch (error) {
        console.error('Ошибка загрузки данных:', error);
        alert('Ошибка загрузки данных: ' + error);
    }
}

// Вспомогательные функции для UI
function setLoading(loading: boolean) {
    if (loading) {
        loginBtn.disabled = true;
        loginBtn.innerHTML = '<span class="loading"></span>Вход...';
    } else {
        loginBtn.disabled = false;
        loginBtn.textContent = 'Войти в систему';
    }
}

function showError(message: string) {
    errorMessage.textContent = message;
    errorMessage.style.display = 'block';
    successMessage.style.display = 'none';
}

function showSuccess(message: string) {
    successMessage.textContent = message;
    successMessage.style.display = 'block';
    errorMessage.style.display = 'none';
}

function hideMessages() {
    errorMessage.style.display = 'none';
    successMessage.style.display = 'none';
}

// Экспорт функций для глобального доступа
declare global {
    interface Window {
        greet: (name: string) => Promise<string | undefined>;
        loadSystemData: () => Promise<void>;
    }
}

window.loadSystemData = loadSystemData;

console.log('✅ Frontend инициализирован');
