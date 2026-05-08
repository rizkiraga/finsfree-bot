# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Gambaran Proyek

**Finsfree Bot** adalah Telegram bot otomatis untuk distribusi konten edukasi keuangan, promosi produk, analisis teknikal, dan alert berita trading. Ditulis dalam Node.js 20 LTS, dikelola PM2 di VPS Ubuntu 22.04. Bot mendukung **multi-grup** — satu instance dapat mengelola beberapa Telegram group dengan konfigurasi brand, jadwal, dan topik yang berbeda.

---

## Commands NPM

```bash
npm start        # Jalankan bot
npm run dev      # Development dengan auto-reload (nodemon)
npm run lint     # Cek kode dengan ESLint
```

---

## Commands PM2 (Produksi)

```bash
pm2 start ecosystem.config.js   # Start
pm2 reload ecosystem.config.js  # Reload zero-downtime
pm2 logs finsfree-bot           # Live logs
pm2 status                      # Cek status
pm2 save                        # Simpan state PM2
```

---

## Environment Variables

```env
TELEGRAM_BOT_TOKEN=      # Wajib — dari @BotFather
OPENAI_API_KEY=          # Wajib
TELEGRAM_GROUP_ID=       # Wajib HANYA jika tidak pakai groups.json (legacy mode)
TWELVE_DATA_API_KEY=     # Opsional — untuk fitur analisis teknikal OHLCV
ADMIN_USER_IDS=          # Comma-separated Telegram user IDs
NODE_ENV=production
LOG_LEVEL=info
```

---

## Arsitektur Multi-Grup

Ini adalah fitur terpenting yang harus dipahami. Bot beroperasi dalam dua mode:

**Mode Multi-Grup (diutamakan):** Baca konfigurasi dari `data/groups.json`. Setiap grup memiliki `id` (slug), `groupId` (Telegram chat ID), `brand` (persona AI, kata terlarang, focus areas), `topics`, `schedule` (cron per tipe konten), dan `postDailyLimit`.

**Mode Legacy (fallback):** Jika `data/groups.json` tidak ada, bot membaca `TELEGRAM_GROUP_ID` dari `.env` dan membangun satu grup sintetis dengan konfigurasi default Finsfree.

`src/config/groupsLoader.js` meng-handle kedua mode ini dengan cache in-memory (`cachedGroups`). Gunakan `getAllGroups()` dan `getGroupById()` — jangan akses `groups.json` langsung.

---

## Alur Aplikasi

```
src/index.js
  ├─ src/config.js              → load & validasi .env
  ├─ src/openai.js              → verifikasi koneksi OpenAI
  ├─ src/scheduler.js           → engine utama multi-grup
  │   ├─ config/groupsLoader.js → load semua grup
  │   ├─ Per-grup: groupStates Map
  │   │   ├─ content/generator.js        → generate konten marketing via AI
  │   │   ├─ content/analysisGenerator.js → generate analisis teknikal via AI
  │   │   ├─ services/marketData.js      → fetch OHLCV dari Twelve Data API
  │   │   ├─ content/topics.js           → pilih topik & tracking cooldown
  │   │   ├─ bot.js                      → kirim ke Telegram
  │   │   └─ utils/contentLog.js         → catat riwayat per grup
  │   └─ Global: news sync, daily/weekly/monthly report jobs
  └─ src/admin.js               → setup Telegram command handlers
      ├─ admin/auth.js           → verifikasi admin + rate limiting
      ├─ admin/commands.js       → implementasi command (multi-grup aware)
      └─ admin/preview.js        → pending posts (2-langkah: preview → post)
```

---

## Scheduler: State Per-Grup

`scheduler.js` memaintain `groupStates` — sebuah `Map` dengan key = group slug. Setiap entri berisi:
- `scheduleConfig`: copy dari `groupConfig.schedule` (bisa dimodifikasi via `/settime`)
- `pauseUntil`: timestamp pause (persisted ke `data/scheduler-state-{groupId}.json`)
- `consecutiveFailures`: counter error berturut-turut (reset ke 0 setelah sukses)
- `jobs`: `Map` berisi semua `node-cron` job untuk grup tersebut

`pauseUntil` adalah satu-satunya state yang di-persist ke disk. Error counter lainnya **reset saat restart**.

---

## Konten: Dua Pipeline Terpisah

**1. Konten Marketing** (`content/generator.js`): Edukasi, produk, tip, intro, newsletter, signal, risk management, psychology. Semua menggunakan `generateContentWithRetry()`. Topik diambil via `getNextTopic()` yang tracking cooldown 14 hari per grup di `data/content-log.json`.

**2. Analisis Teknikal** (`content/analysisGenerator.js` + `services/marketData.js`): Fetch data OHLCV dari Twelve Data API (symbol mapping: `XAUUSD` → `XAU/USD`), generate analisis objektif via AI. **Analisis bypass daily post limit** — dihitung terpisah. Membutuhkan `TWELVE_DATA_API_KEY`.

---

## Data Files

| File | Isi |
|---|---|
| `data/groups.json` | Konfigurasi semua grup (multi-grup mode) |
| `data/content-log.json` | Riwayat konten + cooldown topik per grup |
| `data/admin-log.json` | Audit log aksi admin (maks 1000 entri) |
| `data/scheduler-state-{groupId}.json` | Pause state per grup (persisted across restart) |
| `data/today-news.json` | Berita ekonomi hari ini dari Forex Factory |
| `data/weekly-highlights.json` | Input manual untuk newsletter mingguan |

---

## Laporan Otomatis

| Laporan | Jadwal | Fungsi |
|---|---|---|
| Harian | 22:00 WIB | Ringkasan sukses/error/skip per grup, 3 jadwal berikutnya |
| Mingguan | Senin 07:00 WIB | Executive report: distribusi konten, biaya token, stok topik |
| Bulanan | Tgl 1, 08:00 WIB | 30-hari rolling: reliability %, biaya, top errors, perbandingan bulan lalu |

Semua laporan dikirim ke semua `ADMIN_USER_IDS`.

---

## Fitur Keamanan & Keandalan

- **Error budget global:** Auto-pause SEMUA grup 24 jam jika error budget terlampaui (`utils/monitor.js`)
- **Consecutive failures:** Escalate ke admin jika 3 kali gagal berturut-turut per grup
- **Daily limit:** Per grup, default 3 post/hari (analisis tidak dihitung)
- **Topic cooldown:** 14 hari (signal: 1 hari) — di-track per grup di `content-log.json`
- **Rate limiting admin:** 10 commands/menit per user
- **Retry:** Exponential backoff (`utils/retry.js`) — 1s, 2s, 4s...
- **Preview + confirm:** Workflow dua langkah sebelum posting manual

---

## Brand Compliance

Prompt AI dirancang ketat untuk **menghindari**: garansi profit, taktik FOMO/urgensi, klaim menyesatkan, hard-sell. Daftar `forbiddenWords` dan `forbiddenPhrases` dikonfigurasi per brand di `groups.json` (atau default di `groupsLoader.js::buildLegacyGroup()`). Konten analisis teknikal menggunakan prompt berbeda — tone objektif, **dilarang memberikan sinyal trading langsung**.

---

## Admin Multi-Grup

`admin/commands.js` menyimpan session per-chat di `adminSessions` Map (`chatId → { selectedGroupId }`). Jika hanya ada 1 grup, auto-select. Jika 2+ grup, admin harus pilih grup dulu via inline keyboard sebelum menjalankan command apapun.

---

## Catatan Penting

- **Timezone:** Asia/Jakarta (WIB) — semua cron job pakai `{ timezone: tz }` dari group config
- **Bot mode:** Polling (bukan webhook)
- **Instance:** Single-instance fork mode (PM2), memory limit 200MB
- **Logger:** `src/logger.js` hanya re-export `src/utils/logger.js` (Winston + daily-rotate)
- **Topik konten hardcoded:** `src/content/topics.js` — perlu redeploy untuk ubah topik default
- **Schedule hotswap:** `/settime` command memanggil `stopScheduler()` + `startScheduler()` untuk apply perubahan cron tanpa restart
