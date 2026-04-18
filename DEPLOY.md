# Panduan Deploy ke VPS (Hostinger)

## Persyaratan VPS
- OS: Ubuntu 22.04 / 24.04 LTS
- RAM: minimal 4 GB (rekomendasi 8 GB)
- Storage: minimal 20 GB (rekomendasi 100 GB)
- Docker & Docker Compose terinstall

---

## 1. Install Docker di VPS

```bash
# Login ke VPS via SSH
ssh root@IP_VPS_ANDA

# Install Docker
curl -fsSL https://get.docker.com | sh

# Tambahkan user ke group docker (opsional, agar tidak perlu sudo)
usermod -aG docker $USER

# Verifikasi
docker --version
docker compose version
```

---

## 2. Upload Project ke VPS

**Opsi A — via Git (direkomendasikan):**
```bash
# Di VPS
git clone https://github.com/USERNAME/REPO.git /opt/ktp-system
cd /opt/ktp-system
```

**Opsi B — via SCP dari komputer lokal:**
```bash
# Di komputer lokal (Windows: gunakan WinSCP atau Git Bash)
scp -r /path/ke/project root@IP_VPS:/opt/ktp-system
```

---

## 3. Konfigurasi Environment Variables

```bash
cd /opt/ktp-system

# Salin template .env
cp .env.example .env

# Edit file .env dengan nilai yang sebenarnya
nano .env
```

Isi semua nilai di file `.env`:
```
DB_PASSWORD=password_database_kuat
SESSION_SECRET=secret_panjang_acak_minimal_32_karakter
GROQ_API_KEY=gsk_xxxx...
TELEGRAM_BOT_TOKEN=1234567890:AAxx...
TELEGRAM_REPORT_BOT_TOKEN=9876543210:AAxx...
REPORT_CHAT_ID=-1001234567890
```

Untuk generate SESSION_SECRET:
```bash
openssl rand -base64 32
```

---

## 4. Build dan Jalankan

```bash
cd /opt/ktp-system

# Build semua image (pertama kali butuh 5-15 menit)
docker compose build

# Jalankan semua service
docker compose up -d

# Cek status
docker compose ps
```

Jika berhasil, output `docker compose ps` akan menampilkan:
```
NAME              STATUS
ktp-postgres      running (healthy)
ktp-db-migrate    exited (0)        ← normal, langsung keluar setelah migrasi
ktp-api           running
ktp-telegram-bot  running
ktp-report-bot    running
ktp-dashboard     running
```

Dashboard bisa diakses di: `http://IP_VPS`

---

## 5. Akun Admin Default

Setelah pertama kali deploy, akun berikut tersedia:
- **Username:** `admin` / **Password:** `admin123`
- **Username:** `budi` / **Password:** `petugas123`

**Segera ganti password setelah login pertama.**

---

## 6. Perintah Berguna

```bash
# Lihat log semua service
docker compose logs -f

# Lihat log service tertentu
docker compose logs -f api
docker compose logs -f telegram-bot
docker compose logs -f report-bot

# Restart service tertentu
docker compose restart api

# Stop semua
docker compose down

# Stop dan hapus data (HATI-HATI: database terhapus)
docker compose down -v

# Update setelah perubahan kode
git pull
docker compose build
docker compose up -d
```

---

## 7. Setup Domain (Opsional)

Jika punya domain, install Nginx sebagai reverse proxy dengan SSL:

```bash
# Install Certbot untuk SSL gratis
apt install certbot python3-certbot-nginx -y

# Konfigurasi domain di /etc/nginx/sites-available/ktp
nano /etc/nginx/sites-available/ktp
```

Isi konfigurasi Nginx:
```nginx
server {
    server_name domain-anda.com;

    location / {
        proxy_pass http://localhost:80;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto https;
    }
}
```

```bash
# Aktifkan konfigurasi
ln -s /etc/nginx/sites-available/ktp /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

# Dapatkan SSL certificate
certbot --nginx -d domain-anda.com
```

---

## 8. Backup Database

```bash
# Backup manual
docker compose exec postgres pg_dump -U ktpuser ktpdb > backup_$(date +%Y%m%d).sql

# Restore
cat backup_20260418.sql | docker compose exec -T postgres psql -U ktpuser ktpdb
```

---

## Arsitektur Container

```
Internet (port 80)
       │
   [Nginx/Dashboard]   ← static React files
       │
       ├── /api/*  ──► [API Server :8080]  ──► [PostgreSQL :5432]
       │                     │
       │               [Python OCR + Tesseract]
       │
   [Telegram Bot]  ──────────────────────────► [PostgreSQL :5432]
   [Report Bot]    ──────────────────────────► [PostgreSQL :5432]
```
