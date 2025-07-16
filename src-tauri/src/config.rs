// config.rs - Управление конфигурацией

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use crate::error::{SurveillanceError, Result};

/// Структура камеры
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Camera {
    pub id: u32,
    pub camera_name: String,
    pub apartment_name: String,
    pub rtsp_link: String,
    pub enabled: bool,
}

/// Структура квартиры
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Apartment {
    pub id: u32,
    pub apartment_name: String,
    pub apartment_number: String,
}

/// Настройки системы
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    pub rotation_interval: u32,      // Интервал переключения групп в секундах
    pub connection_timeout: u32,     // Таймаут подключения в секундах
    pub retry_interval: u32,         // Интервал повтора подключения в секундах
    pub max_retry_attempts: u32,     // Максимальное количество попыток переподключения
    pub low_quality_resolution: String,  // Разрешение для сетки (480p)
    pub high_quality_resolution: String, // Разрешение для полного экрана (1080p)
    pub grid_size: u32,              // Размер сетки (например, 16 для 4x4)
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            rotation_interval: 15,
            connection_timeout: 10,
            retry_interval: 30,
            max_retry_attempts: 5,
            low_quality_resolution: "640x480".to_string(),
            high_quality_resolution: "1920x1080".to_string(),
            grid_size: 16,
        }
    }
}

/// Основная структура конфигурации
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    pub users: Vec<crate::auth::User>,
    pub apartments: Vec<Apartment>,
    pub cameras: Vec<Camera>,
    pub settings: Settings,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            users: Vec::new(),
            apartments: Self::default_apartments(),
            cameras: Self::default_cameras(),
            settings: Settings::default(),
        }
    }
}

impl Config {
    /// Создание новой пустой конфигурации
    pub fn new() -> Self {
        Self::default()
    }

    /// Создание тестовой конфигурации
    pub fn new_test() -> Self {
        Self {
            users: Vec::new(), // Пользователи создаются в AuthManager
            apartments: Self::default_apartments(),
            cameras: Self::default_cameras(),
            settings: Settings::default(),
        }
    }

    /// Квартиры по умолчанию для тестирования
    fn default_apartments() -> Vec<Apartment> {
        vec![
            Apartment {
                id: 1,
                apartment_name: "Квартира на Пушкина".to_string(),
                apartment_number: "12А".to_string(),
            },
            Apartment {
                id: 2,
                apartment_name: "Квартира на Ленина".to_string(),
                apartment_number: "34Б".to_string(),
            },
            Apartment {
                id: 3,
                apartment_name: "Квартира на Советской".to_string(),
                apartment_number: "56В".to_string(),
            },
        ]
    }

    /// Камеры по умолчанию для тестирования
    fn default_cameras() -> Vec<Camera> {
        vec![
            Camera {
                id: 1,
                camera_name: "Прихожая".to_string(),
                apartment_name: "Квартира на Пушкина".to_string(),
                rtsp_link: "rtsp://192.168.1.100:554/stream1".to_string(),
                enabled: true,
            },
            Camera {
                id: 2,
                camera_name: "Гостиная".to_string(),
                apartment_name: "Квартира на Пушкина".to_string(),
                rtsp_link: "rtsp://192.168.1.101:554/stream1".to_string(),
                enabled: true,
            },
            Camera {
                id: 3,
                camera_name: "Кухня".to_string(),
                apartment_name: "Квартира на Пушкина".to_string(),
                rtsp_link: "rtsp://192.168.1.102:554/stream1".to_string(),
                enabled: true,
            },
            Camera {
                id: 4,
                camera_name: "Спальня".to_string(),
                apartment_name: "Квартира на Ленина".to_string(),
                rtsp_link: "rtsp://192.168.1.200:554/stream1".to_string(),
                enabled: true,
            },
            Camera {
                id: 5,
                camera_name: "Балкон".to_string(),
                apartment_name: "Квартира на Ленина".to_string(),
                rtsp_link: "rtsp://192.168.1.201:554/stream1".to_string(),
                enabled: true,
            },
        ]
    }

    /// Получение камер по названию квартиры
    pub fn get_cameras_by_apartment(&self, apartment_name: &str) -> Vec<&Camera> {
        self.cameras
            .iter()
            .filter(|camera| camera.apartment_name == apartment_name && camera.enabled)
            .collect()
    }

    /// Получение всех активных камер, сгруппированных по квартирам
    pub fn get_cameras_grouped_by_apartments(&self) -> HashMap<String, Vec<&Camera>> {
        let mut grouped = HashMap::new();
        
        for camera in &self.cameras {
            if camera.enabled {
                grouped
                    .entry(camera.apartment_name.clone())
                    .or_insert_with(Vec::new)
                    .push(camera);
            }
        }
        
        grouped
    }

    /// Добавление новой квартиры
    pub fn add_apartment(&mut self, apartment_name: String, apartment_number: String) -> Result<u32> {
        // Проверяем, не существует ли уже такая квартира
        if self.apartments.iter().any(|apt| apt.apartment_name == apartment_name) {
            return Err(SurveillanceError::config_error("Квартира с таким названием уже существует"));
        }

        let id = self.apartments.iter().map(|apt| apt.id).max().unwrap_or(0) + 1;
        
        let apartment = Apartment {
            id,
            apartment_name,
            apartment_number,
        };
        
        self.apartments.push(apartment);
        Ok(id)
    }

    /// Добавление новой камеры
    pub fn add_camera(&mut self, camera_name: String, apartment_name: String, rtsp_link: String) -> Result<u32> {
        // Проверяем, существует ли квартира
        if !self.apartments.iter().any(|apt| apt.apartment_name == apartment_name) {
            return Err(SurveillanceError::config_error("Квартира не найдена"));
        }

        let id = self.cameras.iter().map(|cam| cam.id).max().unwrap_or(0) + 1;
        
        let camera = Camera {
            id,
            camera_name,
            apartment_name,
            rtsp_link,
            enabled: true,
        };
        
        self.cameras.push(camera);
        Ok(id)
    }

    /// Удаление камеры
    pub fn remove_camera(&mut self, camera_id: u32) -> Result<()> {
        let initial_len = self.cameras.len();
        self.cameras.retain(|camera| camera.id != camera_id);
        
        if self.cameras.len() == initial_len {
            Err(SurveillanceError::config_error("Камера не найдена"))
        } else {
            Ok(())
        }
    }

    /// Обновление камеры
    pub fn update_camera(&mut self, camera_id: u32, camera_name: Option<String>, apartment_name: Option<String>, rtsp_link: Option<String>) -> Result<()> {
        let camera = self.cameras.iter_mut()
            .find(|cam| cam.id == camera_id)
            .ok_or_else(|| SurveillanceError::config_error("Камера не найдена"))?;

        if let Some(name) = camera_name {
            camera.camera_name = name;
        }
        
        if let Some(apartment) = apartment_name {
            // Проверяем, существует ли квартира
            if !self.apartments.iter().any(|apt| apt.apartment_name == apartment) {
                return Err(SurveillanceError::config_error("Квартира не найдена"));
            }
            camera.apartment_name = apartment;
        }
        
        if let Some(rtsp) = rtsp_link {
            camera.rtsp_link = rtsp;
        }

        Ok(())
    }

    /// Включение/выключение камеры
    pub fn toggle_camera(&mut self, camera_id: u32) -> Result<bool> {
        let camera = self.cameras.iter_mut()
            .find(|cam| cam.id == camera_id)
            .ok_or_else(|| SurveillanceError::config_error("Камера не найдена"))?;

        camera.enabled = !camera.enabled;
        Ok(camera.enabled)
    }

    /// Получение списка названий квартир
    pub fn get_apartment_names(&self) -> Vec<String> {
        self.apartments.iter().map(|apt| apt.apartment_name.clone()).collect()
    }

    /// Валидация конфигурации
    pub fn validate(&self) -> Result<()> {
        // Проверяем, что есть хотя бы одна квартира
        if self.apartments.is_empty() {
            return Err(SurveillanceError::config_error("Должна быть хотя бы одна квартира"));
        }

        // Проверяем, что есть хотя бы одна камера
        if self.cameras.is_empty() {
            return Err(SurveillanceError::config_error("Должна быть хотя бы одна камера"));
        }

        // Проверяем, что все камеры ссылаются на существующие квартиры
        let apartment_names: std::collections::HashSet<_> = self.apartments.iter().map(|apt| &apt.apartment_name).collect();
        
        for camera in &self.cameras {
            if !apartment_names.contains(&camera.apartment_name) {
                return Err(SurveillanceError::config_error(&format!("Камера '{}' ссылается на несуществующую квартиру '{}'", camera.camera_name, camera.apartment_name)));
            }
        }

        // Проверяем настройки
        if self.settings.rotation_interval == 0 {
            return Err(SurveillanceError::config_error("Интервал ротации должен быть больше 0"));
        }

        if self.settings.connection_timeout == 0 {
            return Err(SurveillanceError::config_error("Таймаут соединения должен быть больше 0"));
        }

        Ok(())
    }

    /// Сериализация в JSON
    pub fn to_json(&self) -> Result<String> {
        serde_json::to_string_pretty(self)
            .map_err(|e| SurveillanceError::json_error(&e.to_string()))
    }

    /// Десериализация из JSON
    pub fn from_json(json: &str) -> Result<Self> {
        serde_json::from_str(json)
            .map_err(|e| SurveillanceError::json_error(&e.to_string()))
    }
}

/// Менеджер конфигурации с поддержкой Nextcloud
pub struct ConfigManager {
    config: Config,
    nextcloud_url: Option<String>,
    nextcloud_user: Option<String>,
    nextcloud_password: Option<String>,
}

impl ConfigManager {
    /// Создание нового менеджера конфигурации
    pub fn new() -> Self {
        Self {
            config: Config::new_test(),
            nextcloud_url: None,
            nextcloud_user: None,
            nextcloud_password: None,
        }
    }

    /// Настройка подключения к Nextcloud
    pub fn setup_nextcloud(&mut self, url: String, user: String, password: String) {
        self.nextcloud_url = Some(url);
        self.nextcloud_user = Some(user);
        self.nextcloud_password = Some(password);
    }

    /// Получение текущей конфигурации
    pub fn get_config(&self) -> &Config {
        &self.config
    }

    /// Обновление конфигурации
    pub fn update_config(&mut self, config: Config) -> Result<()> {
        config.validate()?;
        self.config = config;
        Ok(())
    }

    /// Загрузка конфигурации из Nextcloud (заглушка)
    pub async fn load_from_nextcloud(&mut self) -> Result<()> {
        // TODO: Реализовать загрузку через WebDAV API
        log::info!("Загрузка конфигурации из Nextcloud...");
        
        // Пока используем тестовую конфигурацию
        self.config = Config::new_test();
        
        log::info!("Конфигурация загружена успешно");
        Ok(())
    }

    /// Сохранение конфигурации в Nextcloud (заглушка)
    pub async fn save_to_nextcloud(&self) -> Result<()> {
        // TODO: Реализовать сохранение через WebDAV API
        log::info!("Сохранение конфигурации в Nextcloud...");
        
        // Валидируем перед сохранением
        self.config.validate()?;
        
        log::info!("Конфигурация сохранена успешно");
        Ok(())
    }

    /// Сохранение конфигурации локально
    pub fn save_local(&self, path: &str) -> Result<()> {
        let json = self.config.to_json()?;
        std::fs::write(path, json)
            .map_err(|e| SurveillanceError::filesystem_error(&e.to_string()))?;
        Ok(())
    }

    /// Загрузка конфигурации из локального файла
    pub fn load_local(&mut self, path: &str) -> Result<()> {
        let json = std::fs::read_to_string(path)
            .map_err(|e| SurveillanceError::filesystem_error(&e.to_string()))?;
        
        self.config = Config::from_json(&json)?;
        self.config.validate()?;
        
        Ok(())
    }
}

impl Default for ConfigManager {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_config_validation() {
        let config = Config::new_test();
        assert!(config.validate().is_ok());
    }

    #[test]
    fn test_cameras_by_apartment() {
        let config = Config::new_test();
        let cameras = config.get_cameras_by_apartment("Квартира на Пушкина");
        assert!(!cameras.is_empty());
    }

    #[test]
    fn test_add_camera() {
        let mut config = Config::new_test();
        let result = config.add_camera(
            "Новая камера".to_string(),
            "Квартира на Пушкина".to_string(),
            "rtsp://test:554/stream".to_string(),
        );
        assert!(result.is_ok());
    }
}
