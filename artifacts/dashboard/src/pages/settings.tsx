import { useState } from "react";
import Layout from "@/components/layout";
import { Settings, CheckCircle2, LayoutDashboard } from "@/lib/icons";
import { useSettings, defaultMenuLabels, type MenuLabels } from "@/lib/settings-context";

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

const menuItems: { key: keyof MenuLabels; icon: string; defaultLabel: string }[] = [
  { key: "dashboard",    icon: "dashboard",         defaultLabel: defaultMenuLabels.dashboard },
  { key: "events",       icon: "event",             defaultLabel: defaultMenuLabels.events },
  { key: "participants", icon: "group",             defaultLabel: defaultMenuLabels.participants },
  { key: "officers",     icon: "badge",             defaultLabel: defaultMenuLabels.officers },
  { key: "scan",         icon: "document_scanner",  defaultLabel: defaultMenuLabels.scan },
  { key: "prizes",       icon: "card_giftcard",     defaultLabel: defaultMenuLabels.prizes },
  { key: "pemetaan",     icon: "map",               defaultLabel: defaultMenuLabels.pemetaan },
  { key: "settings",     icon: "settings",          defaultLabel: defaultMenuLabels.settings },
];

export default function SettingsPage() {
  const { settings, updateSettings, saveSettings, resetSettings } = useSettings();
  const [saved, setSaved] = useState(false);

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
          {menuItems.map(({ key, icon, defaultLabel }) => (
            <div key={key}>
              <label className="flex items-center gap-1.5 text-[11px] font-bold tracking-[0.08em] text-slate-400 mb-1.5">
                <span
                  className="material-symbols-outlined text-[13px] text-slate-300"
                  style={{ fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 20" }}
                >
                  {icon}
                </span>
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
    </Layout>
  );
}
