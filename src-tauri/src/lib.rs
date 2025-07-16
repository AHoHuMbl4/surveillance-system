// lib.rs - Основная библиотека модулей

use serde::{Deserialize, Serialize};

// Публичные модули
pub mod auth;
pub mod config;
pub mod error;

// Переэкспорт основных типов для удобства
pub use auth::{AuthManager, User, UserRole, LoginRequest, LoginResponse};
pub use config::{Config, Camera, Apartment, Settings, ConfigManager};
pub use error::{SurveillanceError, Result};

// Основные структуры данных для всей системы
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemState {
    pub current_user: Option<User>,
    pub config: Option<Config>,
    pub is_authenticated: bool,
}

impl SystemState {
    pub fn new() -> Self {
        Self {
            current_user: None,
            config: None,
            is_authenticated: false,
        }
    }

    pub fn authenticate(&mut self, user: User) {
        self.current_user = Some(user);
        self.is_authenticated = true;
    }

    pub fn logout(&mut self) {
        self.current_user = None;
        self.is_authenticated = false;
    }
}

impl Default for SystemState {
    fn default() -> Self {
        Self::new()
    }
}

// Глобальное состояние приложения
use std::sync::Mutex;
use once_cell::sync::Lazy;

pub static SYSTEM_STATE: Lazy<Mutex<SystemState>> = Lazy::new(|| {
    Mutex::new(SystemState::new())
});

// Вспомогательные функции
pub fn get_current_user() -> Option<User> {
    SYSTEM_STATE.lock().unwrap().current_user.clone()
}

pub fn is_authenticated() -> bool {
    SYSTEM_STATE.lock().unwrap().is_authenticated
}

pub fn has_admin_role() -> bool {
    if let Some(user) = get_current_user() {
        matches!(user.role, UserRole::Admin)
    } else {
        false
    }
}
