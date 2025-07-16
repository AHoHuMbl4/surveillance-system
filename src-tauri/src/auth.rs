// auth.rs - Система авторизации

use serde::{Deserialize, Serialize};
use bcrypt::{hash, verify, DEFAULT_COST};
use std::collections::HashMap;

/// Роли пользователей в системе
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum UserRole {
    Admin,
    Operator,
}

/// Структура пользователя
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct User {
    pub login: String,
    pub password_hash: String,
    pub role: UserRole,
}

/// Запрос на авторизацию
#[derive(Debug, Deserialize)]
pub struct LoginRequest {
    pub login: String,
    pub password: String,
}

/// Ответ на авторизацию
#[derive(Debug, Serialize)]
pub struct LoginResponse {
    pub success: bool,
    pub user: Option<User>,
    pub message: String,
}

/// Менеджер авторизации
pub struct AuthManager {
    users: HashMap<String, User>,
}

impl AuthManager {
    /// Создание нового менеджера авторизации
    pub fn new() -> Self {
        let mut manager = Self {
            users: HashMap::new(),
        };
        
        // Добавляем тестовых пользователей
        manager.add_default_users();
        manager
    }

    /// Добавление пользователей по умолчанию
    fn add_default_users(&mut self) {
        // Администратор
        if let Ok(admin_hash) = hash("admin123", DEFAULT_COST) {
            let admin = User {
                login: "admin".to_string(),
                password_hash: admin_hash,
                role: UserRole::Admin,
            };
            self.users.insert("admin".to_string(), admin);
        }

        // Оператор
        if let Ok(operator_hash) = hash("operator123", DEFAULT_COST) {
            let operator = User {
                login: "operator1".to_string(),
                password_hash: operator_hash,
                role: UserRole::Operator,
            };
            self.users.insert("operator1".to_string(), operator);
        }
    }

    /// Добавление нового пользователя
    pub fn add_user(&mut self, login: String, password: String, role: UserRole) -> Result<(), String> {
        if self.users.contains_key(&login) {
            return Err("Пользователь уже существует".to_string());
        }

        let password_hash = hash(&password, DEFAULT_COST)
            .map_err(|_| "Ошибка хеширования пароля")?;

        let user = User {
            login: login.clone(),
            password_hash,
            role,
        };

        self.users.insert(login, user);
        Ok(())
    }

    /// Проверка учётных данных
    pub fn authenticate(&self, request: &LoginRequest) -> LoginResponse {
        match self.users.get(&request.login) {
            Some(user) => {
                match verify(&request.password, &user.password_hash) {
                    Ok(true) => LoginResponse {
                        success: true,
                        user: Some(user.clone()),
                        message: "Авторизация успешна".to_string(),
                    },
                    Ok(false) => LoginResponse {
                        success: false,
                        user: None,
                        message: "Неверный пароль".to_string(),
                    },
                    Err(_) => LoginResponse {
                        success: false,
                        user: None,
                        message: "Ошибка проверки пароля".to_string(),
                    },
                }
            }
            None => LoginResponse {
                success: false,
                user: None,
                message: "Пользователь не найден".to_string(),
            },
        }
    }

    /// Получение пользователя по логину
    pub fn get_user(&self, login: &str) -> Option<&User> {
        self.users.get(login)
    }

    /// Проверка прав администратора
    pub fn is_admin(&self, login: &str) -> bool {
        self.users
            .get(login)
            .map(|user| user.role == UserRole::Admin)
            .unwrap_or(false)
    }

    /// Получение списка всех пользователей (только для админа)
    pub fn get_all_users(&self) -> Vec<&User> {
        self.users.values().collect()
    }

    /// Удаление пользователя (только для админа)
    pub fn remove_user(&mut self, login: &str) -> Result<(), String> {
        if login == "admin" {
            return Err("Нельзя удалить основного администратора".to_string());
        }

        match self.users.remove(login) {
            Some(_) => Ok(()),
            None => Err("Пользователь не найден".to_string()),
        }
    }

    /// Изменение пароля пользователя
    pub fn change_password(&mut self, login: &str, old_password: &str, new_password: &str) -> Result<(), String> {
        let user = self.users.get(login)
            .ok_or("Пользователь не найден")?;

        // Проверяем старый пароль
        if !verify(old_password, &user.password_hash).unwrap_or(false) {
            return Err("Неверный текущий пароль".to_string());
        }

        // Хешируем новый пароль
        let new_hash = hash(new_password, DEFAULT_COST)
            .map_err(|_| "Ошибка хеширования нового пароля")?;

        // Обновляем пароль
        if let Some(user) = self.users.get_mut(login) {
            user.password_hash = new_hash;
            Ok(())
        } else {
            Err("Пользователь не найден".to_string())
        }
    }
}

impl Default for AuthManager {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_authentication() {
        let auth_manager = AuthManager::new();
        
        // Тест успешной авторизации
        let request = LoginRequest {
            login: "admin".to_string(),
            password: "admin123".to_string(),
        };
        
        let response = auth_manager.authenticate(&request);
        assert!(response.success);
        assert!(response.user.is_some());
        
        // Тест неверного пароля
        let request = LoginRequest {
            login: "admin".to_string(),
            password: "wrong_password".to_string(),
        };
        
        let response = auth_manager.authenticate(&request);
        assert!(!response.success);
        assert!(response.user.is_none());
    }

    #[test]
    fn test_user_roles() {
        let auth_manager = AuthManager::new();
        
        assert!(auth_manager.is_admin("admin"));
        assert!(!auth_manager.is_admin("operator1"));
    }
}
