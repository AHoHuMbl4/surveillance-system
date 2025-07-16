const bcrypt = require('bcrypt');

async function generateHash() {
    try {
        const hash = await bcrypt.hash('admin123', 10);
        console.log('Хеш для admin123:', hash);
        return hash;
    } catch (error) {
        console.error('Ошибка:', error);
    }
}

generateHash();
