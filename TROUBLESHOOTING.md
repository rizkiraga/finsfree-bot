# 🔍 TROUBLESHOOTING - Finsfree Bot

Gunakan panduan ini jika Anda mengalami masalah operasional pada bot di VPS.

---

## 1. Bot Tidak Bisa Connect (Connection Error)

**Gejala:** Bot tidak merespons perintah `/ping` atau log menunjukkan `Polling error`.

- **Penyebab A:** Token bot salah atau kedaluwarsa.
  - **Solusi:** Cek `.env` dan pastikan `TELEGRAM_BOT_TOKEN` sesuai dengan yang diberikan oleh @BotFather.
- **Penyebab B:** Koneksi internet server bermasalah atau diblokir Firewall.
  - **Solusi:** Pastikan UFW mengizinkan traffic outgoing. Cek koneksi dengan `ping google.com`.
- **Penyebab C:** Token sedang digunakan di tempat lain (Conflict).
  - **Solusi:** Pastikan bot tidak sedang menyala di laptop lokal saat sedang running di VPS.

---

## 2. Konten Tidak Terkirim ke Grup

**Gejala:** Log sukses, tapi pesan tidak muncul di grup Telegram.

- **Penyebab A:** ID Grup salah.
  - **Solusi:** Cek `TELEGRAM_GROUP_ID` di `.env`. Pastikan diawali dengan tanda minus (contoh: `-10012345678`).
- **Penyebab B:** Bot bukan Admin di grup.
  - **Solusi:** Tambahkan bot ke grup dan beri izin sebagai Administrator agar bisa mengirim pesan.
- **Penyebab C:** Bot kena Rate Limit Telegram.
  - **Solusi:** Tunggu 1-5 menit. Bot akan mencoba lagi secara otomatis (Retry Mechanism).

---

## 3. Error OpenAI Rate Limit (429)

**Gejala:** Muncul error `OpenAI Rate Limit Exceeded` di log atau DM Admin.

- **Solusi:**
  1. Cek quota/billing di [platform.openai.com](https://platform.openai.com).
  2. Bot sudah memiliki fitur _Retry with Backoff_, jadi jika ini masalah sementara, bot akan pulih sendiri dalam 60 detik.
  3. Jika sering terjadi, pertimbangkan upgrade Tier API OpenAI.

---

## 4. Bot Crash Loop (Restart Berulang Kali)

**Gejala:** PM2 menunjukkan status `errored` atau `restarting` terus-menerus.

- **Solusi:** Inspect log untuk melihat error spesifik:

  ```bash
  pm2 logs telegram-bot --lines 50
  ```

  - Jika error `SyntaxError`: Ada kesalahan ketik di kode (biasanya setelah update manual). Gunakan `./scripts/rollback.sh`.
  - Jika error `EADDRINUSE`: Ada proses lain yang menggunakan resource bot. Matikan semua dengan `pm2 delete all` lalu start lagi.

---

## 5. Error 409 Conflict (ETELEGRAM)

**Gejala:** Log menunjukkan `409 Conflict: terminated by other getUpdates request`.

- **Penyebab:** Ada lebih dari satu instance bot yang berjalan menggunakan token yang sama secara bersamaan. Telegram hanya mengizinkan satu koneksi per token.
- **Solusi:**
  1. **Matikan Bot di Lokal**: Pastikan bot tidak sedang menyala di laptop/komputer Anda.
  2. **Bersihkan PM2**: Jalankan `pm2 delete all` di VPS, lalu pastikan tidak ada proses node yang tertinggal dengan `pkill node` (Hati-hati jika ada aplikasi node lain).
  3. **Start Ulang**: Jalankan kembali dengan `pm2 start ecosystem.config.js --env production`.

---

## 6. Error 'No such file or directory' Saat Jalankan Script

**Gejala:** Saat menjalankan `./scripts/setup-vps.sh`, muncul error "No such file or directory" padahal file ada.

- **Penyebab A:** Kesalahan path di shebang (baris pertama script).
  - **Solusi:** Pastikan baris pertama adalah `#!/bin/bash` (bukan `#!/bash`). Saya sudah memperbaikinya di file terbaru.
- **Penyebab B:** Masalah Line Endings (Windows CRLF vs Linux LF).
  - **Solusi:** Jika Anda membuat file di Windows lalu upload ke Linux, jalankan perintah ini di VPS untuk memperbaikinya:
  ```bash
  sed -i 's/\r$//' scripts/setup-vps.sh
  ```

---

## 7. Cara Restart Darurat

Jika bot macet total dan tidak merespons perintah admin:

1.  **Hard Restart PM2:**
    ```bash
    pm2 restart telegram-bot --update-env
    ```
2.  **Hapus & Start Ulang (Clean Start):**
    ```bash
    pm2 delete telegram-bot
    pm2 start ecosystem.config.js --env production
    ```
3.  **Cek Resource Server:**
    ```bash
    free -m   # Cek RAM (Jika sisa < 100MB, bot mungkin terhenti)
    df -h     # Cek Disk (Jika disk penuh, bot tidak bisa menulis log)
    ```

---

_Finsfree Bot - Troubleshooting & Recovery Guide_
