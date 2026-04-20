import { useState, useEffect, ElementType } from "react";
import Layout from "@/components/layout";
import {
  Settings, CheckCircle2, LayoutDashboard,
  Calendar, Users, IdentificationBadge, Scan, Gift, MapTrifold,
  Download, AlertTriangle, FileSpreadsheet,
} from "@/lib/icons";
import { useSettings, defaultMenuLabels, type MenuLabels } from "@/lib/settings-context";

const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "");

function SectionHeader({ icon: Icon, title, desc }: { icon: any; title: string; desc: string }) {
  return (
    <div className="flex items-start gap-3 mb-4">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-100">
        <Icon className="h-4 w-4 text-slate-500" />
      </div>
      <div>
        <p className="text-[14px] font-bold text-slate-800">{title}</p>
        <p className="text-[12px] text-slate-400">{desc}</p>
      </div>
    </div>
  );
}

const menuItems: { key: keyof MenuLabels; Icon: ElementType; defaultLabel: string }[] = [
  { key: "dashboard",    Icon: LayoutDashboard,      defaultLabel: defaultMenuLabels.dashboard },
  { key: "pemetaan",     Icon: MapTrifold,           defaultLabel: defaultMenuLabels.pemetaan },
  { key: "events",       Icon: Calendar,             defaultLabel: defaultMenuLabels.events },
  { key: "prizes",       Icon: Gift,                 defaultLabel: defaultMenuLabels.prizes },
  { key: "participants", Icon: Users,                defaultLabel: defaultMenuLabels.participants },
  { key: "officers",     Icon: IdentificationBadge,  defaultLabel: defaultMenuLabels.officers },
  { key: "scan",         Icon: Scan,                 defaultLabel: defaultMenuLabels.scan },
  { key: "settings",     Icon: Settings,             defaultLabel: defaultMenuLabels.settings },
];

export default function SettingsPage() {
  const { settings, updateSettings, saveSettings, resetSettings } = useSettings();
  const [saved, setSaved] = useState(false);
  const [ktpStats, setKtpStats] = useState<{ total: number; withPhoto: number; withoutPhoto: number } | null>(null);
  const [downloadingZip, setDownloadingZip] = useState(false);

  useEffect(() => {
    fetch(`${BASE_URL}/api/admin/backup/ktp-stats`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setKtpStats(d))
      .catch(() => null);
  }, []);

  const handleDownloadKtpZip = () => {
    setDownloadingZip(true);
    const a = document.createElement("a");
    a.href = `${BASE_URL}/api/admin/backup/ktp-zip`;
    a.download = `backup_foto_ktp_${new Date().toISOString().slice(0, 10)}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => setDownloadingZip(false), 3000);
  };

  const updateLabel = (key: keyof MenuLabels, value: string) => {
    updateSettings({ menuLabels: { ...settings.menuLabels, [key]: value } });
    setSaved(false);
  };

  const handleSave = () => {
    saveSettings();
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleReset = () => {
    resetSettings();
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <Layout>
      <div className="flex items-start justify-between mb-7">
        <div>
          <h1
            className="text-[26px] font-extrabold text-slate-900 leading-tight"
            style={{ letterSpacing: "-0.03em" }}
          >
            Pengaturan
          </h1>
          <p className="mt-1 text-sm text-slate-400 font-medium">
            Konfigurasi aplikasi dashboard
          </p>
        </div>

        <div className="flex items-center gap-2">
          {saved && (
            <div className="flex items-center gap-1.5 text-[12px] font-semibold text-emerald-600 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Tersimpan
            </div>
          )}
          <button
            onClick={handleSave}
            className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-[12px] font-bold text-white shadow-sm shadow-blue-200 hover:bg-blue-700 transition-colors"
          >
            <Settings className="h-3.5 w-3.5" />
            Simpan Perubahan
          </button>
        </div>
      </div>

      <div className="rounded-2xl bg-white border border-slate-100 px-6 py-5 shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
        <SectionHeader
          icon={LayoutDashboard}
          title="Nama Menu Navigasi"
          desc="Ubah label yang tampil di sidebar untuk setiap menu"
        />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {menuItems.map(({ key, Icon, defaultLabel }) => (
            <div key={key}>
              <label className="flex items-center gap-1.5 text-[11px] font-bold tracking-[0.08em] text-slate-400 mb-1.5">
                <Icon size={13} weight="bold" className="text-slate-300" />
                {defaultLabel}
              </label>
              <input
                type="text"
                value={settings.menuLabels[key]}
                onChange={(e) => updateLabel(key, e.target.value)}
                placeholder={defaultLabel}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[13px] font-medium text-slate-700 placeholder:text-slate-300 focus:outline-none focus:border-blue-400 focus:bg-white transition-colors"
              />
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between mt-5 pt-4 border-t border-slate-100">
          <p className="text-[11px] text-slate-300 italic">
            * Perubahan label langsung tampil di sidebar setelah disimpan
          </p>
          <button
            onClick={handleReset}
            className="rounded-xl border border-slate-200 px-4 py-2 text-[12px] font-semibold text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-colors"
          >
            Reset ke Default
          </button>
        </div>
      </div>

      {/* ── Backup & Migrasi ── */}
      <div className="rounded-2xl bg-white border border-slate-100 px-6 py-5 shadow-[0_1px_4px_rgba(0,0,0,0.06)] mt-5">
        <SectionHeader
          icon={Download}
          title="Backup & Ekspor Data"
          desc="Download semua data untuk keamanan atau keperluan migrasi ke VPS"
        />

        {/* Info box */}
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 mb-5">
          <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
          <div className="text-[12px] text-amber-700 leading-relaxed">
            <p className="font-bold mb-0.5">Penting untuk migrasi ke VPS Hostinger:</p>
            <p>Update kode website <span className="font-semibold">TIDAK</span> akan menghapus foto KTP atau data peserta — keduanya tersimpan terpisah dari kode. Namun saat pindah server, Anda perlu:</p>
            <ol className="list-decimal list-inside mt-1 space-y-0.5">
              <li>Download backup foto KTP di bawah ini</li>
              <li>Export database PostgreSQL dengan perintah <code className="bg-amber-100 px-1 rounded font-mono text-[11px]">pg_dump</code></li>
              <li>Upload kembali semua file foto KTP ke storage VPS</li>
            </ol>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* KTP Photo backup */}
          <div className="border border-slate-100 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-[13px] font-bold text-slate-800">Foto KTP Peserta</p>
                <p className="text-[11px] text-slate-400 mt-0.5">Semua foto KTP dalam format ZIP</p>
              </div>
              {ktpStats && (
                <div className="text-right">
                  <p className="text-[20px] font-extrabold text-slate-900" style={{ letterSpacing: "-0.03em" }}>{ktpStats.withPhoto.toLocaleString("id-ID")}</p>
                  <p className="text-[10px] text-slate-400">foto tersimpan</p>
                </div>
              )}
            </div>
            {ktpStats && ktpStats.withoutPhoto > 0 && (
              <p className="text-[11px] text-slate-400 mb-3">
                {ktpStats.withoutPhoto} peserta belum punya foto KTP
              </p>
            )}
            <button
              onClick={handleDownloadKtpZip}
              disabled={downloadingZip || !ktpStats || ktpStats.withPhoto === 0}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-blue-600 text-white text-[12px] font-bold hover:bg-blue-700 disabled:opacity-50 transition-colors active:scale-95"
            >
              <Download className="h-4 w-4" />
              {downloadingZip ? "Menyiapkan ZIP..." : `Download ZIP (${ktpStats?.withPhoto ?? 0} foto)`}
            </button>
          </div>

          {/* Data peserta info */}
          <div className="border border-slate-100 rounded-2xl p-4">
            <div className="mb-3">
              <p className="text-[13px] font-bold text-slate-800">Data Peserta (Excel)</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Export dari halaman Peserta → tombol Excel</p>
            </div>
            <div className="space-y-1.5 mb-3">
              {[
                "Buka halaman Peserta",
                "Klik tombol Excel di toolbar",
                "Pilih kolom yang diinginkan",
                "Klik Download Excel",
              ].map((step, i) => (
                <div key={i} className="flex items-center gap-2 text-[11px] text-slate-600">
                  <span className="shrink-0 h-4 w-4 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center text-[9px] font-bold">{i + 1}</span>
                  {step}
                </div>
              ))}
            </div>
            <a
              href="javascript:void(0)"
              onClick={() => window.location.assign(`${window.location.origin}${BASE_URL}/participants`)}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-600 text-white text-[12px] font-bold hover:bg-emerald-700 transition-colors active:scale-95"
            >
              <FileSpreadsheet className="h-4 w-4" />
              Pergi ke Halaman Peserta
            </a>
          </div>
        </div>
      </div>
    </Layout>
  );
}
