import { useState, useEffect } from "react";
import Layout from "@/components/layout";
import {
  Settings,
  Building2,
  ScanLine,
  Database,
  Bell,
  CheckCircle2,
  Palette,
} from "lucide-react";

const STORAGE_KEY = "ktp_dashboard_settings";

type AppSettings = {
  orgName: string;
  defaultEventId: string;
  autoResetForm: boolean;
  showTotalOnSuccess: boolean;
  primaryColor: string;
};

const defaults: AppSettings = {
  orgName: "Panitia Nasional",
  defaultEventId: "",
  autoResetForm: false,
  showTotalOnSuccess: true,
  primaryColor: "blue",
};

function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...defaults, ...JSON.parse(raw) } : defaults;
  } catch {
    return defaults;
  }
}

function saveSettings(s: AppSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none ${
        checked ? "bg-blue-500" : "bg-slate-200"
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-4" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

function SectionHeader({
  icon: Icon,
  title,
  desc,
}: {
  icon: any;
  title: string;
  desc: string;
}) {
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

export default function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings>(loadSettings);
  const [saved, setSaved] = useState(false);

  const update = (key: keyof AppSettings, value: any) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const handleSave = () => {
    saveSettings(settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleReset = () => {
    setSettings(defaults);
    saveSettings(defaults);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <Layout>
      {/* Header */}
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

      <div className="grid grid-cols-2 gap-4">
        {/* Organisasi */}
        <div className="rounded-2xl bg-white border border-slate-100 px-6 py-5 shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
          <SectionHeader
            icon={Building2}
            title="Informasi Organisasi"
            desc="Nama dan identitas penyelenggara"
          />
          <div className="space-y-3">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400 mb-1.5">
                Nama Organisasi
              </label>
              <input
                type="text"
                value={settings.orgName}
                onChange={(e) => update("orgName", e.target.value)}
                placeholder="cth: Panitia Festival Nasional"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[13px] font-medium text-slate-700 placeholder:text-slate-300 focus:outline-none focus:border-blue-400 focus:bg-white transition-colors"
              />
            </div>
          </div>
        </div>

        {/* Scan settings */}
        <div className="rounded-2xl bg-white border border-slate-100 px-6 py-5 shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
          <SectionHeader
            icon={ScanLine}
            title="Pengaturan Scan"
            desc="Perilaku halaman scan KTP"
          />
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[13px] font-semibold text-slate-700">Reset Form Otomatis</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Form dikosongkan setelah berhasil mendaftar
                </p>
              </div>
              <Toggle
                checked={settings.autoResetForm}
                onChange={(v) => update("autoResetForm", v)}
              />
            </div>

            <div className="border-t border-slate-100" />

            <div className="flex items-center justify-between">
              <div>
                <p className="text-[13px] font-semibold text-slate-700">Tampilkan Total Event</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Tampilkan berapa event yang diikuti peserta saat sukses
                </p>
              </div>
              <Toggle
                checked={settings.showTotalOnSuccess}
                onChange={(v) => update("showTotalOnSuccess", v)}
              />
            </div>
          </div>
        </div>

        {/* Notifikasi */}
        <div className="rounded-2xl bg-white border border-slate-100 px-6 py-5 shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
          <SectionHeader
            icon={Bell}
            title="Notifikasi"
            desc="Preferensi alert dan notifikasi"
          />
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[13px] font-semibold text-slate-700">Alert Duplikat</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Tampilkan peringatan jika peserta sudah terdaftar
                </p>
              </div>
              <Toggle checked={true} onChange={() => {}} />
            </div>
          </div>
          <p className="mt-4 text-[11px] text-slate-300 font-medium italic">
            * Alert duplikat selalu aktif untuk keamanan data
          </p>
        </div>

        {/* Tampilan */}
        <div className="rounded-2xl bg-white border border-slate-100 px-6 py-5 shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
          <SectionHeader
            icon={Palette}
            title="Tampilan"
            desc="Warna dan tema antarmuka"
          />
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400 mb-2">
              Warna Aksen
            </label>
            <div className="flex gap-2">
              {[
                { key: "blue", bg: "bg-blue-500", ring: "ring-blue-400" },
                { key: "violet", bg: "bg-violet-500", ring: "ring-violet-400" },
                { key: "emerald", bg: "bg-emerald-500", ring: "ring-emerald-400" },
                { key: "rose", bg: "bg-rose-500", ring: "ring-rose-400" },
                { key: "amber", bg: "bg-amber-400", ring: "ring-amber-400" },
              ].map((c) => (
                <button
                  key={c.key}
                  onClick={() => update("primaryColor", c.key)}
                  className={`h-8 w-8 rounded-full ${c.bg} transition-all ${
                    settings.primaryColor === c.key ? `ring-2 ring-offset-2 ${c.ring}` : ""
                  }`}
                />
              ))}
            </div>
            <p className="mt-2 text-[11px] text-slate-300 italic">
              * Perubahan warna akan diterapkan di versi mendatang
            </p>
          </div>
        </div>

        {/* Data & info sistem */}
        <div className="col-span-2 rounded-2xl bg-white border border-slate-100 px-6 py-5 shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
          <SectionHeader
            icon={Database}
            title="Informasi Sistem"
            desc="Versi dan status aplikasi"
          />
          <div className="grid grid-cols-4 gap-4 mb-4">
            {[
              { label: "Versi", value: "1.0.0" },
              { label: "Stack", value: "React + Express + PostgreSQL" },
              { label: "AI Engine", value: "OpenAI GPT Vision" },
              { label: "Status", value: "✓ Aktif" },
            ].map((item) => (
              <div key={item.label} className="rounded-xl bg-slate-50 border border-slate-100 px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400 mb-1">
                  {item.label}
                </p>
                <p className="text-[13px] font-semibold text-slate-700">{item.value}</p>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between border-t border-slate-100 pt-4">
            <p className="text-[12px] text-slate-400">
              Reset semua pengaturan ke nilai default
            </p>
            <button
              onClick={handleReset}
              className="rounded-xl border border-slate-200 px-4 py-2 text-[12px] font-semibold text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-colors"
            >
              Reset ke Default
            </button>
          </div>
        </div>
      </div>
    </Layout>
  );
}
