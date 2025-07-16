#!/bin/bash

# Автоматическое имя backup-ветки по дате
backup_branch="backup-$(date +%Y%m%d-%H%M%S)"

# Создание backup-ветки
git checkout -b "$backup_branch"
git push -u origin "$backup_branch"

# Возврат на main (или другую основную ветку)
git checkout main

# Обновление всех изменений
git add .

# Ввод комментария
read -p "Введите комментарий к коммиту: " comment

# Коммит и пуш
git commit -m "$comment"
git push

#  запуск node

node web-server.cjs
