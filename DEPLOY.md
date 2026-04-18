# KTP System — VPS Deployment Workflow

> [!CAUTION]
> **DILARANG KERAS MENGHAPUS VOLUME DATABASE ATAU CONTAINER DATABASE!**
> Data peserta adalah prioritas nomor satu. Jangan pernah menjalankan `docker compose down` jika tidak benar-benar diperlukan. Gunakan `--no-deps --build api` untuk hanya mengupdate aplikasi. JANGAN jalankan `docker system prune` secara sembarangan.

Deploy aplikasi KTP System dari lokal ke VPS.

## Prerequisites

- **VPS IP:** `187.127.111.221`
- **VPS Dir:** `/opt/ktp-system`
- **Local Dir:** `D:\project\agungsiste`

---

## Quick Deploy

### 1. Buat Archive
```bash
cd D:\project\agungsiste
tar --exclude='node_modules' --exclude='.git' --exclude='dist' --exclude='attached_assets' --exclude='artifacts\*.traineddata' -cvzf ..\ktp-deploy.tar.gz .
```

### 2. Upload ke VPS
```bash
scp D:\project\ktp-deploy.tar.gz root@187.127.111.221:/root/
```

### 3. Extract & Rebuild di VPS (SAFE MODE)
```bash
# .env dan uploads tetap aman dari deployment sebelumnya
ssh root@187.127.111.221 "cd /root && rm -rf ktp_old && mv /opt/ktp-system ktp_old 2>/dev/null; mkdir -p /opt/ktp-system && tar -xzf ktp-deploy.tar.gz -C /opt/ktp-system && cp ktp_old/.env /opt/ktp-system/.env 2>/dev/null; cd /opt/ktp-system && docker compose up -d --no-deps --build api telegram-bot report-bot dashboard db-migrate"
```

### 4. Cleanup
```bash
ssh root@187.127.111.221 "rm -rf /root/ktp_old /root/ktp-deploy.tar.gz && docker image prune -f && docker builder prune -f"
del D:\project\ktp-deploy.tar.gz
```

### 5. Verify
```bash
ssh root@187.127.111.221 "cd /opt/ktp-system && docker compose ps"
```

---

## ZERO DATA LOSS POLICY

1. **Database Persistence**: Volume `pgdata` dan `ktp_uploads` HARUS selalu dipertahankan.
2. **No Cleanup Spree**: Jangan jalankan `docker system prune` atau `docker compose down -v` tanpa backup.
3. **Backup First**: Sebelum perubahan struktur database:
   `docker compose exec postgres pg_dump -U ktpuser ktpdb > /root/backup_$(date +%F).sql`

## Important Notes

- **Preserved Files:** `.env` akan dipertahankan dari deployment sebelumnya.
- **Container Database:** `postgres` TIDAK ikut di-rebuild, hanya app containers.

## Troubleshooting

### Restart hanya API (SAFE)
```bash
ssh root@187.127.111.221 "cd /opt/ktp-system && docker compose restart api"
```

### Check Logs
```bash
ssh root@187.127.111.221 "cd /opt/ktp-system && docker compose logs api --tail 100"
ssh root@187.127.111.221 "cd /opt/ktp-system && docker compose logs telegram-bot --tail 100"
```

### Forced Rebuild (DANGER)
```bash
# Pikir 1000x sebelum menjalankan ini
# docker compose down -v
```
