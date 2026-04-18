# KTP System — Deploy ke VPS via GitHub
# Usage: .\deploy.ps1

Write-Host "=== Pull & rebuild dari GitHub..."
ssh root@187.127.111.221 "cd /opt/ktp-system; git pull origin main; docker compose up -d --no-deps --build api telegram-bot report-bot dashboard db-migrate"

Write-Host "=== Cleanup..."
ssh root@187.127.111.221 "docker image prune -f; docker builder prune -f"

Write-Host "=== Verifikasi..."
ssh root@187.127.111.221 "cd /opt/ktp-system; docker compose ps"

Write-Host ""
Write-Host "Deploy selesai! Dashboard: https://astinv.cloud"
