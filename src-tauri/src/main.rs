// main.rs - Интеграция системы авторизации с Tauri

#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use surveillance_system::{
    AuthManager, ConfigManager, LoginRequest, LoginResponse, 
    User, Config, Apartment, Camera, get_current_user, is_authenticated, has_admin_role, SYSTEM_STATE
};
use std::sync::Mutex;
use once_cell::sync::Lazy;

// Глобальные менеджеры
static AUTH_MANAGER: Lazy<Mutex<AuthManager>> = Lazy::new(|| {
    Mutex::new(AuthManager::new())
});

static CONFIG_MANAGER: Lazy<Mutex<ConfigManager>> = Lazy::new(|| {
    Mutex::new(ConfigManager::new())
});

// Tauri команды для авторизации
#[tauri::command]
fn login(request: LoginRequest) -> Result<LoginResponse, String> {
    log::info!("Попытка входа пользователя: {}", request.login);
    
    let auth_manager = AUTH_MANAGER.lock().map_err(|e| e.to_string())?;
    let response = auth_manager.authenticate(&request);
    
    if response.success {
        // Обновляем глобальное состояние
        if let Some(user) = &response.user {
            SYSTEM_STATE.lock().map_err(|e| e.to_string())?.authenticate(user.clone());
            log::info!("Пользователь {} успешно авторизован", user.login);
        }
    } else {
        log::warn!("Неудачная попытка входа для пользователя: {}", request.login);
    }
    
    Ok(response)
}

#[tauri::command]
fn logout() -> Result<(), String> {
    log::info!("Выход пользователя из системы");
    
    SYSTEM_STATE.lock().map_err(|e| e.to_string())?.logout();
    
    Ok(())
}

#[tauri::command]
fn get_current_user_info() -> Result<Option<User>, String> {
    Ok(get_current_user())
}

#[tauri::command]
fn check_authentication() -> Result<bool, String> {
    Ok(is_authenticated())
}

#[tauri::command]
fn check_admin_role() -> Result<bool, String> {
    Ok(has_admin_role())
}

// Tauri команды для конфигурации
#[tauri::command]
async fn load_config() -> Result<Config, String> {
    log::info!("Загрузка конфигурации");
    
    // Создаем временный ConfigManager для async операций
    let mut temp_config_manager = ConfigManager::new();
    temp_config_manager.load_from_nextcloud().await.map_err(|e| e.to_string())?;
    
    let config = temp_config_manager.get_config().clone();
    
    // Обновляем глобальный ConfigManager синхронно
    {
        let mut config_manager = CONFIG_MANAGER.lock().map_err(|e| e.to_string())?;
        config_manager.update_config(config.clone()).map_err(|e| e.to_string())?;
    }
    
    // Обновляем глобальное состояние
    SYSTEM_STATE.lock().map_err(|e| e.to_string())?.config = Some(config.clone());
    
    log::info!("Конфигурация загружена: {} квартир, {} камер", 
               config.apartments.len(), config.cameras.len());
    
    Ok(config)
}

#[tauri::command]
fn get_apartments() -> Result<Vec<Apartment>, String> {
    let config_manager = CONFIG_MANAGER.lock().map_err(|e| e.to_string())?;
    let config = config_manager.get_config();
    Ok(config.apartments.clone())
}

#[tauri::command]
fn get_cameras() -> Result<Vec<Camera>, String> {
    let config_manager = CONFIG_MANAGER.lock().map_err(|e| e.to_string())?;
    let config = config_manager.get_config();
    Ok(config.cameras.clone())
}

#[tauri::command]
fn get_cameras_by_apartment(apartment_name: String) -> Result<Vec<Camera>, String> {
    let config_manager = CONFIG_MANAGER.lock().map_err(|e| e.to_string())?;
    let config = config_manager.get_config();
    
    let cameras = config.get_cameras_by_apartment(&apartment_name)
        .into_iter()
        .cloned()
        .collect();
    
    Ok(cameras)
}

#[tauri::command]
fn add_camera(name: String, apartment: String, rtsp_link: String) -> Result<u32, String> {
    // Проверяем права администратора
    if !has_admin_role() {
        return Err("Недостаточно прав доступа".to_string());
    }
    
    log::info!("Добавление камеры: {} в квартиру {}", name, apartment);
    
    let camera_id = {
        let mut config_manager = CONFIG_MANAGER.lock().map_err(|e| e.to_string())?;
        
        // Получаем мутабельную ссылку на конфигурацию
        let config = config_manager.get_config().clone();
        let mut updated_config = config;
        
        let camera_id = updated_config.add_camera(name, apartment, rtsp_link)
            .map_err(|e| e.to_string())?;
        
        // Обновляем конфигурацию
        config_manager.update_config(updated_config).map_err(|e| e.to_string())?;
        
        camera_id
    };
    
    log::info!("Камера добавлена с ID: {}", camera_id);
    Ok(camera_id)
}

#[tauri::command]
fn add_apartment(name: String, number: String) -> Result<u32, String> {
    // Проверяем права администратора
    if !has_admin_role() {
        return Err("Недостаточно прав доступа".to_string());
    }
    
    log::info!("Добавление квартиры: {} ({})", name, number);
    
    let apartment_id = {
        let mut config_manager = CONFIG_MANAGER.lock().map_err(|e| e.to_string())?;
        
        let config = config_manager.get_config().clone();
        let mut updated_config = config;
        
        let apartment_id = updated_config.add_apartment(name, number)
            .map_err(|e| e.to_string())?;
        
        config_manager.update_config(updated_config).map_err(|e| e.to_string())?;
        
        apartment_id
    };
    
    log::info!("Квартира добавлена с ID: {}", apartment_id);
    Ok(apartment_id)
}

// Вспомогательная команда для проверки работы
#[tauri::command]
fn greet(name: &str) -> Result<String, String> {
    Ok(format!("Привет, {}! Система видеонаблюдения работает.", name))
}

// Команда для получения статуса системы
#[tauri::command]
fn get_system_status() -> Result<SystemStatus, String> {
    let is_auth = is_authenticated();
    let user = get_current_user();
    let config = SYSTEM_STATE.lock().map_err(|e| e.to_string())?.config.clone();
    
    Ok(SystemStatus {
        is_authenticated: is_auth,
        current_user: user.as_ref().map(|u| u.login.clone()),
        user_role: user.as_ref().map(|u| format!("{:?}", u.role)),
        config_loaded: config.is_some(),
        apartments_count: config.as_ref().map(|c| c.apartments.len()).unwrap_or(0),
        cameras_count: config.as_ref().map(|c| c.cameras.len()).unwrap_or(0),
    })
}

#[derive(serde::Serialize)]
struct SystemStatus {
    is_authenticated: bool,
    current_user: Option<String>,
    user_role: Option<String>,
    config_loaded: bool,
    apartments_count: usize,
    cameras_count: usize,
}

fn main() {
    // Инициализация логгера
    env_logger::init();
    
    log::info!("🚀 Запуск системы видеонаблюдения");
    
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            // Авторизация
            login,
            logout,
            get_current_user_info,
            check_authentication,
            check_admin_role,
            // Конфигурация
            load_config,
            get_apartments,
            get_cameras,
            get_cameras_by_apartment,
            add_camera,
            add_apartment,
            // Вспомогательные
            greet,
            get_system_status
        ])
        .setup(|app| {
            log::info!("Tauri приложение инициализировано");
            
            // Можно добавить инициализацию при запуске
            let _handle = app.handle();
            tauri::async_runtime::spawn(async move {
                log::info!("Фоновая инициализация завершена");
            });
            
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
