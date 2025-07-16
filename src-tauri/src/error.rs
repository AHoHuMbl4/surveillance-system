// error.rs - Централизованная обработка ошибок

use serde::{Deserialize, Serialize};
use thiserror::Error;

/// Основные типы ошибок в системе видеонаблюдения
#[derive(Error, Debug, Serialize, Deserialize)]
pub enum SurveillanceError {
    #[error("Ошибка авторизации: {message}")]
    AuthError { message: String },

    #[error("Ошибка конфигурации: {message}")]
    ConfigError { message: String },

    #[error("Ошибка RTSP соединения: {message}")]
    RtspError { message: String },

    #[error("Сетевая ошибка: {message}")]
    NetworkError { message: String },

    #[error("Ошибка файловой системы: {message}")]
    FileSystemError { message: String },

    #[error("Ошибка парсинга JSON: {message}")]
    JsonError { message: String },

    #[error("Недостаточно прав доступа")]
    PermissionDenied,

    #[error("Пользователь не найден")]
    UserNotFound,

    #[error("Неверный пароль")]
    InvalidCredentials,

    #[error("Камера недоступна: {camera_id}")]
    CameraUnavailable { camera_id: u32 },

    #[error("Таймаут соединения")]
    ConnectionTimeout,

    #[error("Внутренняя ошибка: {message}")]
    InternalError { message: String },
}

impl SurveillanceError {
    /// Создание ошибки авторизации
    pub fn auth_error(message: &str) -> Self {
        Self::AuthError {
            message: message.to_string(),
        }
    }

    /// Создание ошибки конфигурации
    pub fn config_error(message: &str) -> Self {
        Self::ConfigError {
            message: message.to_string(),
        }
    }

    /// Создание ошибки RTSP
    pub fn rtsp_error(message: &str) -> Self {
        Self::RtspError {
            message: message.to_string(),
        }
    }

    /// Создание сетевой ошибки
    pub fn network_error(message: &str) -> Self {
        Self::NetworkError {
            message: message.to_string(),
        }
    }

    /// Создание ошибки файловой системы
    pub fn filesystem_error(message: &str) -> Self {
        Self::FileSystemError {
            message: message.to_string(),
        }
    }

    /// Создание ошибки JSON
    pub fn json_error(message: &str) -> Self {
        Self::JsonError {
            message: message.to_string(),
        }
    }

    /// Создание внутренней ошибки
    pub fn internal_error(message: &str) -> Self {
        Self::InternalError {
            message: message.to_string(),
        }
    }

    /// Получение кода ошибки для API
    pub fn error_code(&self) -> u32 {
        match self {
            Self::AuthError { .. } => 1001,
            Self::ConfigError { .. } => 1002,
            Self::RtspError { .. } => 1003,
            Self::NetworkError { .. } => 1004,
            Self::FileSystemError { .. } => 1005,
            Self::JsonError { .. } => 1006,
            Self::PermissionDenied => 1007,
            Self::UserNotFound => 1008,
            Self::InvalidCredentials => 1009,
            Self::CameraUnavailable { .. } => 1010,
            Self::ConnectionTimeout => 1011,
            Self::InternalError { .. } => 9999,
        }
    }

    /// Проверка, является ли ошибка критической
    pub fn is_critical(&self) -> bool {
        matches!(
            self,
            Self::InternalError { .. } | Self::FileSystemError { .. }
        )
    }

    /// Получение уровня важности ошибки
    pub fn severity(&self) -> ErrorSeverity {
        match self {
            Self::AuthError { .. } => ErrorSeverity::Warning,
            Self::ConfigError { .. } => ErrorSeverity::Error,
            Self::RtspError { .. } => ErrorSeverity::Warning,
            Self::NetworkError { .. } => ErrorSeverity::Warning,
            Self::FileSystemError { .. } => ErrorSeverity::Critical,
            Self::JsonError { .. } => ErrorSeverity::Error,
            Self::PermissionDenied => ErrorSeverity::Warning,
            Self::UserNotFound => ErrorSeverity::Info,
            Self::InvalidCredentials => ErrorSeverity::Warning,
            Self::CameraUnavailable { .. } => ErrorSeverity::Info,
            Self::ConnectionTimeout => ErrorSeverity::Warning,
            Self::InternalError { .. } => ErrorSeverity::Critical,
        }
    }
}

/// Уровни важности ошибок
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ErrorSeverity {
    Info,
    Warning,
    Error,
    Critical,
}

/// Результат операции в системе
pub type Result<T> = std::result::Result<T, SurveillanceError>;

/// Структура для логирования ошибок
#[derive(Debug, Serialize, Deserialize)]
pub struct ErrorLog {
    pub timestamp: chrono::DateTime<chrono::Utc>,
    pub error: SurveillanceError,
    pub context: String,
    pub user: Option<String>,
}

impl ErrorLog {
    pub fn new(error: SurveillanceError, context: &str, user: Option<String>) -> Self {
        Self {
            timestamp: chrono::Utc::now(),
            error,
            context: context.to_string(),
            user,
        }
    }
}

/// Конвертация из стандартных ошибок
impl From<std::io::Error> for SurveillanceError {
    fn from(error: std::io::Error) -> Self {
        Self::filesystem_error(&error.to_string())
    }
}

impl From<serde_json::Error> for SurveillanceError {
    fn from(error: serde_json::Error) -> Self {
        Self::json_error(&error.to_string())
    }
}

impl From<reqwest::Error> for SurveillanceError {
    fn from(error: reqwest::Error) -> Self {
        Self::network_error(&error.to_string())
    }
}

/// Макрос для быстрого создания ошибок
#[macro_export]
macro_rules! surveillance_error {
    (auth, $msg:expr) => {
        $crate::error::SurveillanceError::auth_error($msg)
    };
    (config, $msg:expr) => {
        $crate::error::SurveillanceError::config_error($msg)
    };
    (rtsp, $msg:expr) => {
        $crate::error::SurveillanceError::rtsp_error($msg)
    };
    (network, $msg:expr) => {
        $crate::error::SurveillanceError::network_error($msg)
    };
    (internal, $msg:expr) => {
        $crate::error::SurveillanceError::internal_error($msg)
    };
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_error_codes() {
        let auth_error = SurveillanceError::auth_error("test");
        assert_eq!(auth_error.error_code(), 1001);
        
        let config_error = SurveillanceError::config_error("test");
        assert_eq!(config_error.error_code(), 1002);
    }

    #[test]
    fn test_error_severity() {
        let auth_error = SurveillanceError::auth_error("test");
        assert!(matches!(auth_error.severity(), ErrorSeverity::Warning));
        
        let internal_error = SurveillanceError::internal_error("test");
        assert!(matches!(internal_error.severity(), ErrorSeverity::Critical));
        assert!(internal_error.is_critical());
    }
}
