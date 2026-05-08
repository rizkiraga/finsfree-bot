# 🚀 QUICK START - Finsfree Bot

Ikuti 3 langkah sederhana ini untuk menjalankan bot di VPS.

### 1. Upload & Persiapan

Upload seluruh folder project ke VPS (kecuali `node_modules`).

```bash
cd finsfree-bot
npm install --production
```

### 2. Isi Konfigurasi (.env)

Buat file `.env` dan isi dengan API Key Anda.

```bash
nano .env
```

Isi minimal:

- `TELEGRAM_BOT_TOKEN=...`
- `TELEGRAM_GROUP_ID=...`
- `OPENAI_API_KEY=...`
- `ADMIN_USER_IDS=...`

### 3. Jalankan Bot

Gunakan PM2 untuk menjalankan bot secara permanen.

```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

---

### Perintah Berguna:

- **Cek Status**: `pm2 status`
- **Lihat Log**: `pm2 logs finsfree-bot`
- **Restart**: `pm2 restart finsfree-bot`
- **Stop**: `pm2 stop finsfree-bot`
