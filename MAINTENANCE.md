# 🛠 MAINTENANCE SOP - Finsfree Bot

Dokumen ini berisi prosedur standar (SOP) untuk menjaga operasional Finsfree Bot tetap stabil dan aman di VPS.

---

## 📅 1. Update Topik Konten

Jika ingin memperbarui daftar topik edukasi, produk, atau tips:

1.  Buka file `src/content/topics.js`.
2.  Tambahkan atau ubah topik di dalam array yang sesuai.
3.  **Deploy ulang ke VPS:**

    ```bash
    # Di lokal, push ke Git
    git add src/content/topics.js
    git commit -m "Update topics"
    git push origin main

    # Di VPS (atau jalankan script deploy)
    ./scripts/deploy.sh
    ```

---

## 👥 2. Kelola Admin (Tambah/Hapus Admin ID)

Admin ID menentukan siapa yang bisa menggunakan perintah `/admin`, `/status`, dan menerima laporan mingguan.

1.  Buka file `.env` di VPS (Lokasi: Root folder project).
2.  Edit bagian `ADMIN_USER_IDS`:
    - Pisahkan dengan koma: `ADMIN_USER_IDS=12345678,98765432`
3.  **Restart Bot agar perubahan terbaca:**
    ```bash
    pm2 reload telegram-bot
    ```

---

## ⏸ 3. Pause Bot (Hari Libur Nasional)

Gunakan perintah internal bot (tanpa perlu SSH):

1.  Buka chat dengan bot.
2.  Kirim perintah `/admin`.
3.  Klik tombol **Pause 1h** (atau ketik `/pause 24` untuk pause selama 24 jam).
4.  Untuk melanjutkan manual: Klik **Resume** atau ketik `/resume`.

---

## 💾 4. Backup Manual

Sangat disarankan melakukan backup data log sebulan sekali.

1.  **Backup Database Log:**
    ```bash
    cp data/content-log.json data/backups/content-log-$(date +%F).json
    ```
2.  **Backup Config:**
    ```bash
    cp .env .env.backup
    ```

---

## ↩️ 5. Rollback (Jika Update Bermasalah)

Jika setelah update bot mengalami error, segera jalankan script rollback:

```bash
chmod +x scripts/rollback.sh
./scripts/rollback.sh
```

_Script ini akan mengembalikan kode ke commit sebelumnya dan me-reload PM2._

---

## 🔍 6. Monitoring Log via SSH

Untuk melihat apa yang sedang dilakukan bot secara real-time:

- **100 Baris terakhir:**
  ```bash
  pm2 logs telegram-bot --lines 100
  ```
- **Log error spesifik:**
  ```bash
  cat logs/app.log | grep "error"
  ```

---

## ✅ 7. Checklist Maintenance Bulanan

Lakukan pengecekan ini setiap awal bulan:

- [ ] **Data Cleanup**: Pastikan `data/` tidak terlalu besar (bersihkan backup lama).
- [ ] **Health Check**: Jalankan `/health` dan `/stats` di admin panel.
- [ ] **Security Update**: Jalankan script setup jika ada update OS (`sudo apt update && sudo apt upgrade`).
- [ ] **OpenAI Billing**: Cek sisa saldo di dashboard OpenAI.
- [ ] **Log Review**: Klik **Download Log Lengkap** dari laporan mingguan untuk review performa.

---

_Finsfree Bot - Operation & Stability Guide_
