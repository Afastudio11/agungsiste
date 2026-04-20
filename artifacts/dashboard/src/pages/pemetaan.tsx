import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  MapPin, Globe, Building2, Home, ChevronRight, ChevronLeft, ArrowLeft,
  Users, CalendarDays, TrendingUp, User, Phone, Tag, Clock, Gift,
} from "@/lib/icons";
import Layout from "@/components/layout";
import PetaMapContent from "@/pages/peta";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface Summary { totalDesa: number; totalKecamatan: number; totalKabupaten: number; totalKTP: number; desaTerjangkau: number; kecamatanTerjangkau: number; totalEvent: number; totalProgram: number; totalHadiah: number; }
interface KabupatenRow { kabupaten: string; totalInput: number; totalDesa: number; totalKecamatan: number; totalEvent: number; desaTerjangkau: number; kecamatanTerjangkau: number; totalProgram: number; }
interface KecamatanRow { kecamatan: string; kabupaten: string; totalInput: number; totalDesa: number; totalKegiatan: number; desaTerjangkau: number; totalProgram: number; }
interface DesaRow { kelurahan: string; kecamatan: string; kabupaten: string; totalInput: number; totalEvent: number; }
interface DesaDetail {
  kelurahan: string; kecamatan: string; kabupaten: string; totalInput: number; totalEvent: number; totalProgram: number; totalHadiah: number;
  events: { eventId: number; eventName: string; eventDate: string; location: string; peserta: number }[];
}
interface Participant {
  nik: string; fullName: string; gender?: string; occupation?: string;
  phone?: string; tags?: string; registeredAt?: string;
}

type View =
  | { type: "kabupaten" }
  | { type: "kecamatan"; kabupaten: string }
  | { type: "desa"; kabupaten: string; kecamatan: string }
  | { type: "detail"; kelurahan: string; kabupaten: string; kecamatan?: string }
  | { type: "peserta"; eventId: number; eventName: string; kelurahan: string; kabupaten: string; kecamatan?: string };

function Breadcrumb({ view, onNav }: { view: View; onNav: (v: View) => void }) {
  const crumbs: { label: string; target: View | null }[] = [
    { label: "Pemetaan Wilayah", target: view.type !== "kabupaten" ? { type: "kabupaten" } : null },
  ];

  if (view.type === "kecamatan" || view.type === "desa" || view.type === "detail" || view.type === "peserta") {
    const kab = (view as { kabupaten: string }).kabupaten;
    const isLast = view.type === "kecamatan";
    crumbs.push({ label: kab, target: isLast ? null : { type: "kecamatan", kabupaten: kab } });
  }

  if (view.type === "desa" || view.type === "detail" || view.type === "peserta") {
    const kec = (view as { kecamatan?: string }).kecamatan;
    if (kec) {
      const kab = (view as { kabupaten: string }).kabupaten;
      const isLast = view.type === "desa";
      crumbs.push({ label: kec, target: isLast ? null : { type: "desa", kabupaten: kab, kecamatan: kec } });
    }
  }

  if (view.type === "detail" || view.type === "peserta") {
    const kel = (view as { kelurahan: string }).kelurahan;
    const kab = (view as { kabupaten: string }).kabupaten;
    const kec = (view as { kecamatan?: string }).kecamatan;
    const isLast = view.type === "detail";
    crumbs.push({
      label: kel,
      target: isLast ? null : { type: "detail", kelurahan: kel, kabupaten: kab, kecamatan: kec },
    });
  }

  if (view.type === "peserta") {
    crumbs.push({ label: view.eventName, target: null });
  }

  return (
    <div className="flex items-center gap-1.5 text-sm flex-wrap">
      {crumbs.map((c, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-slate-300 shrink-0" />}
          {c.target ? (
            <button onClick={() => onNav(c.target!)} className="text-blue-600 hover:text-blue-800 hover:underline font-medium transition">
              {c.label}
            </button>
          ) : (
            <span className="text-slate-900 font-semibold">{c.label}</span>
          )}
        </span>
      ))}
    </div>
  );
}

function backView(view: View): View {
  if (view.type === "kecamatan") return { type: "kabupaten" };
  if (view.type === "desa") return { type: "kecamatan", kabupaten: view.kabupaten };
  if (view.type === "detail") {
    return view.kecamatan
      ? { type: "desa", kabupaten: view.kabupaten, kecamatan: view.kecamatan }
      : { type: "kecamatan", kabupaten: view.kabupaten };
  }
  if (view.type === "peserta") {
    return { type: "detail", kelurahan: view.kelurahan, kabupaten: view.kabupaten, kecamatan: view.kecamatan };
  }
  return { type: "kabupaten" };
}

/* ─── helpers ──────────────────────────────────────────────────────────── */
function CompBar({ value, total, color = "bg-blue-500" }: { value: number; total: number; color?: string }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="mt-1.5">
      <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%`, transition: "width 0.5s" }} />
      </div>
      <div className="text-[10px] text-slate-400 mt-0.5">{pct}% dari {total.toLocaleString()}</div>
    </div>
  );
}

/* ─── VIEW 1: Kabupaten ────────────────────────────────────────────────── */
function KabupatenView({ summary, kabData, onSelect }: { summary?: Summary; kabData: KabupatenRow[]; onSelect: (k: string) => void }) {
  const max = Math.max(...kabData.map((k) => Number(k.totalInput)), 1);
  const totalDesa = summary?.totalDesa ?? 0;
  const totalKec = summary?.totalKecamatan ?? 0;
  return (
    <div className="space-y-4">
      {/* Row 1 — 3 scalar cards */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total KTP Terkumpul", value: (summary?.totalKTP ?? 0).toLocaleString(), icon: Users, color: "text-blue-500", bg: "bg-blue-50" },
          { label: "Total Kegiatan", value: (summary?.totalEvent ?? 0).toLocaleString(), icon: CalendarDays, color: "text-indigo-500", bg: "bg-indigo-50" },
          { label: "Total Program", value: (summary?.totalProgram ?? 0).toLocaleString(), icon: Globe, color: "text-violet-500", bg: "bg-violet-50" },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="bg-white rounded-2xl border border-slate-100 p-4 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
            <div className="flex items-center gap-2 mb-3">
              <div className={`h-7 w-7 rounded-lg ${bg} flex items-center justify-center`}>
                <Icon className={`h-3.5 w-3.5 ${color}`} />
              </div>
              <span className="text-xs font-bold text-slate-400 tracking-wide">{label}</span>
            </div>
            <div className="text-2xl font-extrabold text-slate-900" style={{ letterSpacing: "-0.04em" }}>{value}</div>
          </div>
        ))}
      </div>
      {/* Row 2 — 2 comparison cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
          <div className="flex items-center gap-2 mb-3">
            <div className="h-7 w-7 rounded-lg bg-emerald-50 flex items-center justify-center">
              <Home className="h-3.5 w-3.5 text-emerald-500" />
            </div>
            <span className="text-xs font-bold text-slate-400 tracking-wide">Desa Terjangkau</span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-extrabold text-slate-900" style={{ letterSpacing: "-0.04em" }}>{(summary?.desaTerjangkau ?? 0).toLocaleString()}</span>
            <span className="text-sm text-slate-400 font-medium">/ {totalDesa.toLocaleString()} desa</span>
          </div>
          <CompBar value={summary?.desaTerjangkau ?? 0} total={totalDesa} color="bg-emerald-400" />
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
          <div className="flex items-center gap-2 mb-3">
            <div className="h-7 w-7 rounded-lg bg-amber-50 flex items-center justify-center">
              <MapPin className="h-3.5 w-3.5 text-amber-500" />
            </div>
            <span className="text-xs font-bold text-slate-400 tracking-wide">Kecamatan Terjangkau</span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-extrabold text-slate-900" style={{ letterSpacing: "-0.04em" }}>{(summary?.kecamatanTerjangkau ?? 0).toLocaleString()}</span>
            <span className="text-sm text-slate-400 font-medium">/ {totalKec.toLocaleString()} kec</span>
          </div>
          <CompBar value={summary?.kecamatanTerjangkau ?? 0} total={totalKec} color="bg-amber-400" />
        </div>
      </div>

      {/* Sebaran per Kabupaten */}
      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
          <Building2 className="h-4 w-4 text-blue-500" />
          <span className="font-bold text-slate-900">Sebaran per Kabupaten</span>
          <span className="ml-auto text-xs text-slate-400">Klik untuk lihat kecamatan</span>
        </div>
        <div className="divide-y divide-slate-50">
          {kabData.map((k, i) => {
            const dotColors = ["bg-blue-500","bg-indigo-500","bg-violet-500","bg-sky-500","bg-teal-500"];
            const barColors = ["bg-blue-400","bg-indigo-400","bg-violet-400","bg-sky-400","bg-teal-400"];
            const pct = Math.round((Number(k.totalInput) / max) * 100);
            const desaPct = k.totalDesa > 0 ? Math.round((Number(k.desaTerjangkau) / k.totalDesa) * 100) : 0;
            const kecPct = k.totalKecamatan > 0 ? Math.round((Number(k.kecamatanTerjangkau) / k.totalKecamatan) * 100) : 0;
            return (
              <button key={k.kabupaten} onClick={() => onSelect(k.kabupaten)}
                className="w-full flex items-center gap-4 px-5 py-4 hover:bg-slate-50/80 transition-colors text-left group">
                <div className={`h-2.5 w-2.5 rounded-full shrink-0 ${dotColors[i % dotColors.length]}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between mb-1.5">
                    <span className="font-bold text-sm text-slate-900 group-hover:text-blue-700 transition-colors">{k.kabupaten}</span>
                    <span className="text-lg font-extrabold text-slate-900 ml-3" style={{ letterSpacing: "-0.04em" }}>
                      {Number(k.totalInput).toLocaleString()} KTP
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden mb-2">
                    <div className={`h-full rounded-full ${barColors[i % barColors.length]}`} style={{ width: `${pct}%` }} />
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
                    <span className="flex items-center gap-1">
                      <Home className="h-2.5 w-2.5 text-emerald-400" />
                      <span className="font-bold text-emerald-700">{k.desaTerjangkau}</span>
                      <span className="text-slate-400">/ {k.totalDesa} desa ({desaPct}%)</span>
                    </span>
                    <span className="text-slate-200">·</span>
                    <span className="flex items-center gap-1">
                      <MapPin className="h-2.5 w-2.5 text-amber-400" />
                      <span className="font-bold text-amber-700">{k.kecamatanTerjangkau}</span>
                      <span className="text-slate-400">/ {k.totalKecamatan} kec ({kecPct}%)</span>
                    </span>
                    <span className="text-slate-200">·</span>
                    <span className="bg-indigo-50 text-indigo-600 font-bold px-1.5 py-0.5 rounded-md">{k.totalEvent} kegiatan</span>
                    <span className="bg-violet-50 text-violet-600 font-bold px-1.5 py-0.5 rounded-md">{k.totalProgram} program</span>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-blue-500 transition-colors shrink-0" />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ─── VIEW 2: Kecamatan list ───────────────────────────────────────────── */
function KecamatanView({ kabupaten, onSelect }: { kabupaten: string; onSelect: (kec: string) => void }) {
  const { data: kecData = [], isLoading } = useQuery<KecamatanRow[]>({
    queryKey: ["pemetaan-kecamatan", kabupaten],
    queryFn: () =>
      fetch(`${BASE}/api/pemetaan/kecamatan?kabupaten=${encodeURIComponent(kabupaten)}`, { credentials: "include" })
        .then((r) => r.json())
        .then((d) => Array.isArray(d) ? d : []),
  });
  const { data: kabData } = useQuery<KabupatenRow[]>({
    queryKey: ["pemetaan-kabupaten"],
    queryFn: () => fetch(`${BASE}/api/pemetaan/kabupaten`, { credentials: "include" }).then((r) => r.json()).then((d) => Array.isArray(d) ? d : []),
  });
  const kabInfo = kabData?.find((k) => k.kabupaten === kabupaten);

  const totalDesaKab = kabInfo?.totalDesa ?? 0;
  const desaTerjangkauKab = kecData.reduce((s, k) => s + (k.desaTerjangkau ?? 0), 0);
  const totalKecamatan = kecData.length;
  const kecTerjangkau = kecData.filter(k => (k.desaTerjangkau ?? 0) > 0).length;

  return (
    <div className="space-y-4">
      {/* Kabupaten banner */}
      <div className="overflow-hidden rounded-[2rem] shadow-md bg-white">
        <div className="relative h-40">
          <img
            src={
              kabupaten === "Pacitan" ? `${BASE}/banner-pacitan.jpeg`
              : kabupaten === "Ngawi" ? `${BASE}/banner-ngawi.jpeg`
              : kabupaten === "Magetan" ? `${BASE}/banner-magetan.jpeg`
              : kabupaten === "Ponorogo" ? `${BASE}/banner-ponorogo.jpeg`
              : kabupaten === "Trenggalek" ? `${BASE}/banner-trenggalek.jpeg`
              : `${BASE}/banner-kecamatan.jpeg`
            }
            alt="Banner kabupaten"
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent from-[55%] to-white" />
        </div>
        <div className="px-5 pb-5 bg-white">
          <span className="bg-blue-100 text-blue-600 px-3 py-1 rounded-full text-[10px] font-extrabold tracking-widest mb-2.5 inline-block">
            Kabupaten
          </span>
          <div className="text-[1.6rem] font-extrabold text-slate-900 leading-tight tracking-tight">{kabupaten}</div>
          <div className="text-slate-500 text-xs mt-1">Klik kecamatan untuk lihat desa</div>
        </div>
      </div>

      {/* Stats — 3 scalar + 2 comparison */}
      {kabInfo && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Total KTP", value: Number(kabInfo.totalInput).toLocaleString(), icon: Users, color: "text-blue-500", bg: "bg-blue-50" },
              { label: "Total Kegiatan", value: kabInfo.totalEvent, icon: CalendarDays, color: "text-indigo-500", bg: "bg-indigo-50" },
              { label: "Total Program", value: kabInfo.totalProgram ?? 0, icon: Globe, color: "text-violet-500", bg: "bg-violet-50" },
            ].map(({ label, value, icon: Icon, color, bg }) => (
              <div key={label} className="bg-white rounded-2xl border border-slate-100 p-4 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
                <div className="flex items-center gap-2 mb-2">
                  <div className={`h-6 w-6 rounded-lg ${bg} flex items-center justify-center shrink-0`}>
                    <Icon className={`h-3 w-3 ${color}`} />
                  </div>
                  <span className="text-[10px] font-bold text-slate-400 tracking-wide">{label}</span>
                </div>
                <div className="text-xl font-extrabold text-slate-900" style={{ letterSpacing: "-0.04em" }}>{value}</div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
              <div className="flex items-center gap-2 mb-2">
                <div className="h-6 w-6 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
                  <Home className="h-3 w-3 text-emerald-500" />
                </div>
                <span className="text-[10px] font-bold text-slate-400 tracking-wide">Desa Terjangkau</span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-xl font-extrabold text-slate-900" style={{ letterSpacing: "-0.04em" }}>{desaTerjangkauKab}</span>
                <span className="text-xs text-slate-400">/ {totalDesaKab} desa</span>
              </div>
              <CompBar value={desaTerjangkauKab} total={totalDesaKab} color="bg-emerald-400" />
            </div>
            <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
              <div className="flex items-center gap-2 mb-2">
                <div className="h-6 w-6 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
                  <MapPin className="h-3 w-3 text-amber-500" />
                </div>
                <span className="text-[10px] font-bold text-slate-400 tracking-wide">Kecamatan Terjangkau</span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-xl font-extrabold text-slate-900" style={{ letterSpacing: "-0.04em" }}>{kecTerjangkau}</span>
                <span className="text-xs text-slate-400">/ {totalKecamatan} kecamatan</span>
              </div>
              <CompBar value={kecTerjangkau} total={totalKecamatan} color="bg-amber-400" />
            </div>
          </div>
        </div>
      )}

      {/* Kecamatan table */}
      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
          <span className="font-bold text-slate-900">Daftar Kecamatan</span>
          <span className="ml-auto text-xs text-blue-600 font-semibold bg-blue-50 px-2 py-0.5 rounded-lg">{kecData.length} kecamatan</span>
        </div>
        {isLoading ? (
          <div className="p-10 text-center text-slate-400 text-sm">Memuat kecamatan...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 text-xs font-bold text-slate-400 tracking-wider border-b border-slate-100">
                  <th className="px-4 py-3 text-center w-12">No.</th>
                  <th className="px-4 py-3 text-left">Kecamatan</th>
                  <th className="px-4 py-3 text-right">Desa Terjangkau</th>
                  <th className="px-4 py-3 text-right">Total KTP</th>
                  <th className="px-4 py-3 text-right">Kegiatan</th>
                  <th className="px-4 py-3 text-right">Program</th>
                  <th className="px-3 py-3 w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {kecData.map((k, i) => {
                  const isTerjangkau = (k.desaTerjangkau ?? 0) > 0;
                  return (
                    <tr key={k.kecamatan} onClick={() => onSelect(k.kecamatan)} className="hover:bg-blue-50/60 cursor-pointer transition group">
                      <td className="px-4 py-3 text-center text-xs text-slate-400 font-medium">{i + 1}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {isTerjangkau && <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 shrink-0" />}
                          <span className="text-sm font-semibold text-slate-900 group-hover:text-blue-700 transition">{k.kecamatan}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={`text-sm font-bold ${isTerjangkau ? "text-emerald-700" : "text-slate-400"}`}>
                          {k.desaTerjangkau ?? 0}
                        </span>
                        <span className="text-xs text-slate-400"> / {k.totalDesa}</span>
                      </td>
                      <td className="px-4 py-3 text-sm font-bold text-slate-900 text-right">{Number(k.totalInput).toLocaleString()}</td>
                      <td className="px-4 py-3 text-sm text-slate-600 text-right">{k.totalKegiatan ?? 0}</td>
                      <td className="px-4 py-3 text-sm text-slate-600 text-right">{k.totalProgram ?? 0}</td>
                      <td className="px-3 py-3"><ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-blue-500 transition" /></td>
                    </tr>
                  );
                })}
                {kecData.length === 0 && (
                  <tr><td colSpan={7} className="px-5 py-10 text-center text-slate-400 text-sm">Tidak ada data kecamatan</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── VIEW 3: Desa list ────────────────────────────────────────────────── */
function DesaView({ kabupaten, kecamatan, onSelect }: { kabupaten: string; kecamatan: string; onSelect: (kel: string) => void }) {
  const { data: desaData = [], isLoading } = useQuery<DesaRow[]>({
    queryKey: ["pemetaan-desa", kabupaten, kecamatan],
    queryFn: () => fetch(
      `${BASE}/api/pemetaan/desa?kabupaten=${encodeURIComponent(kabupaten)}&kecamatan=${encodeURIComponent(kecamatan)}`,
      { credentials: "include" }
    ).then((r) => r.json()).then((d) => Array.isArray(d) ? d : []),
  });
  const { data: kecAll = [] } = useQuery<KecamatanRow[]>({
    queryKey: ["pemetaan-kecamatan", kabupaten],
    queryFn: () => fetch(`${BASE}/api/pemetaan/kecamatan?kabupaten=${encodeURIComponent(kabupaten)}`, { credentials: "include" }).then((r) => r.json()).then((d) => Array.isArray(d) ? d : []),
  });
  const kecInfo = kecAll.find((k) => k.kecamatan.toLowerCase() === kecamatan.toLowerCase());

  return (
    <div className="space-y-4">
      {/* Kecamatan banner */}
      <div className="overflow-hidden rounded-[2rem] shadow-md bg-white">
        <div className="relative h-40">
          <img
            src={`${BASE}/banner-kecamatan.jpeg`}
            alt="Banner kecamatan"
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent from-[55%] to-white" />
        </div>
        <div className="px-5 pb-5 bg-white">
          <span className="bg-indigo-100 text-indigo-600 px-3 py-1 rounded-full text-[10px] font-extrabold tracking-widest mb-2.5 inline-block">
            Kecamatan
          </span>
          <div className="text-[1.6rem] font-extrabold text-slate-900 leading-tight tracking-tight">{kecamatan}</div>
          <div className="text-slate-500 text-xs mt-1">{kabupaten}</div>
        </div>
      </div>

      {kecInfo && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { icon: <TrendingUp className="h-6 w-6 text-indigo-500" />, label: "Total Peserta", value: Number(kecInfo.totalInput).toLocaleString() },
            { icon: <Home className="h-6 w-6 text-indigo-500" />, label: "Desa/Kel.", value: kecInfo.totalDesa },
            { icon: <CalendarDays className="h-6 w-6 text-indigo-500" />, label: "Kegiatan", value: kecInfo.totalKegiatan ?? 0 },
          ].map(({ icon, label, value }) => (
            <div key={label} className="rounded-2xl p-4 flex items-center gap-3 bg-white border border-slate-100 shadow-sm">
              <div className="h-12 w-12 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">{icon}</div>
              <div>
                <div className="text-[9px] font-bold tracking-widest text-slate-400 mb-0.5">{label}</div>
                <div className="text-2xl font-extrabold text-slate-900 leading-none">{value}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Desa table */}
      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
          <span className="font-bold text-slate-900">Daftar Desa / Kelurahan</span>
          <span className="ml-auto text-xs text-indigo-600 font-semibold bg-indigo-50 px-2 py-0.5 rounded-lg">{desaData.length} desa/kel.</span>
        </div>
        {isLoading ? (
          <div className="p-10 text-center text-slate-400 text-sm">Memuat data desa/kel....</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 text-xs font-bold text-slate-400 tracking-wider border-b border-slate-100">
                  <th className="px-4 py-3 text-center w-12">No.</th>
                  <th className="px-4 py-3 text-left">Nama Desa / Kelurahan</th>
                  <th className="px-4 py-3 text-right">Kegiatan</th>
                  <th className="px-4 py-3 text-right">Total KTP</th>
                  <th className="px-3 py-3 w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {desaData.map((d, idx) => (
                  <tr key={`${d.kelurahan}-${idx}`} onClick={() => onSelect(d.kelurahan)} className="hover:bg-indigo-50/60 cursor-pointer transition group">
                    <td className="px-4 py-3 text-center text-xs text-slate-400 font-medium">{idx + 1}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-slate-900 group-hover:text-indigo-700 transition">{d.kelurahan}</td>
                    <td className="px-4 py-3 text-sm text-slate-700 text-right">{d.totalEvent}</td>
                    <td className="px-4 py-3 text-sm font-bold text-slate-900 text-right">{Number(d.totalInput).toLocaleString()}</td>
                    <td className="px-3 py-3"><ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-indigo-500 transition" /></td>
                  </tr>
                ))}
                {desaData.length === 0 && (
                  <tr><td colSpan={5} className="px-5 py-10 text-center text-slate-400 text-sm">Tidak ada data desa/kel.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── VIEW 3: Desa detail ──────────────────────────────────────────────── */
function DesaDetailView({
  kelurahan,
  onSelectEvent,
}: {
  kelurahan: string;
  onSelectEvent: (eventId: number, eventName: string) => void;
}) {
  const { data, isLoading } = useQuery<DesaDetail>({
    queryKey: ["pemetaan-desa-detail", kelurahan],
    queryFn: () => fetch(`${BASE}/api/pemetaan/desa/${encodeURIComponent(kelurahan)}`, { credentials: "include" }).then((r) => r.json()),
  });
  if (isLoading) return <div className="py-16 text-center text-slate-400 text-sm">Memuat data desa/kel....</div>;
  if (!data) return null;
  return (
    <div className="space-y-4">
      {/* Hero banner card */}
      <div className="overflow-hidden rounded-[2rem] shadow-md bg-white">
        <div className="relative h-40">
          <img
            src={`${BASE}/banner-desa.jpeg`}
            alt="Banner desa"
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent from-[55%] to-white" />
        </div>
        <div className="px-5 pb-5 bg-white">
          <span className="bg-blue-100 text-blue-600 px-3 py-1 rounded-full text-[10px] font-extrabold tracking-widest mb-2.5 inline-block">
            Profil Desa/Kel.
          </span>
          <div className="text-[1.6rem] font-extrabold text-slate-900 leading-tight tracking-tight">{data.kelurahan}</div>
          <div className="text-slate-500 text-xs mt-1">Kec. {data.kecamatan} · {data.kabupaten}</div>
        </div>
      </div>

      {/* Stats grid — horizontal layout */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { icon: <Users className="h-6 w-6 text-blue-500" />, label: "KTP Terkumpul", value: Number(data.totalInput).toLocaleString() },
          { icon: <CalendarDays className="h-6 w-6 text-blue-500" />, label: "Kegiatan", value: Number(data.totalEvent) },
          { icon: <Globe className="h-6 w-6 text-blue-500" />, label: "Program", value: Number(data.totalProgram ?? 0) },
        ].map(({ icon, label, value }) => (
          <div
            key={label}
            className="rounded-2xl p-4 flex items-center gap-3"
            style={{
              background: "rgba(255,255,255,0.7)",
              backdropFilter: "blur(16px)",
              WebkitBackdropFilter: "blur(16px)",
              border: "1px solid rgba(226,232,240,0.8)",
              boxShadow: "0 4px 16px 0 rgba(31,38,135,0.04)",
            }}
          >
            <div className="h-12 w-12 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
              {icon}
            </div>
            <div>
              <div className="text-[9px] font-bold tracking-widest text-slate-400 mb-0.5">{label}</div>
              <div className="text-2xl font-extrabold text-slate-900 leading-none">{value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Event list */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-blue-500" />
          <span className="font-bold text-slate-900">Daftar Kegiatan</span>
          <span className="ml-auto text-xs text-blue-600 font-semibold bg-blue-50 px-2.5 py-0.5 rounded-full">{data.events.length} kegiatan</span>
        </div>
        {data.events.length === 0 ? (
          <div className="p-10 text-center text-slate-400 text-sm">Tidak ada kegiatan</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 text-[10px] font-bold text-slate-400 tracking-widest border-b border-slate-100">
                  <th className="px-4 py-3 text-center w-12">No.</th>
                  <th className="px-4 py-3 text-left">Nama Event</th>
                  <th className="px-4 py-3 text-right">Total Peserta</th>
                  <th className="px-3 py-3 w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {data.events.map((ev, i) => (
                  <tr key={ev.eventId} onClick={() => onSelectEvent(ev.eventId, ev.eventName)} className="hover:bg-blue-50/50 cursor-pointer transition-colors group">
                    <td className="px-4 py-3.5 text-center text-xs text-slate-400 font-medium">{i + 1}</td>
                    <td className="px-4 py-3.5 text-sm font-semibold text-slate-800 group-hover:text-blue-700 transition-colors">{ev.eventName}</td>
                    <td className="px-4 py-3.5 text-sm font-bold text-slate-900 text-right">{Number(ev.peserta).toLocaleString()}</td>
                    <td className="px-3 py-3.5"><ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-blue-400 transition-colors" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── VIEW 4: Peserta per event per desa ───────────────────────────────── */
const PAGE_SIZE = 100;

function PesertaView({
  eventId,
  eventName,
  kelurahan,
}: {
  eventId: number;
  eventName: string;
  kelurahan: string;
}) {
  const [, navigate] = useLocation();
  const [page, setPage] = useState(0);

  const { data: peserta = [], isLoading } = useQuery<Participant[]>({
    queryKey: ["pemetaan-peserta", kelurahan, eventId],
    queryFn: () =>
      fetch(`${BASE}/api/pemetaan/desa/${encodeURIComponent(kelurahan)}/event/${eventId}/participants`, { credentials: "include" })
        .then((r) => r.json())
        .then((d) => Array.isArray(d) ? d : []),
  });

  const totalPages = Math.ceil(peserta.length / PAGE_SIZE);
  const paged = peserta.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const startNo = page * PAGE_SIZE;

  return (
    <div className="space-y-4">
      {/* Event banner */}
      <div className="overflow-hidden rounded-[2rem] shadow-md bg-white">
        <div className="relative h-40">
          <img
            src={`${BASE}/banner-desa.jpeg`}
            alt="Banner event"
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent from-[55%] to-white" />
        </div>
        <div className="px-5 pb-5 bg-white">
          <span className="bg-violet-100 text-violet-600 px-3 py-1 rounded-full text-[10px] font-extrabold tracking-widest mb-2.5 inline-block">
            Daftar Peserta
          </span>
          <div className="text-[1.6rem] font-extrabold text-slate-900 leading-tight tracking-tight">{eventName}</div>
          <div className="flex items-center gap-1.5 text-slate-500 text-xs mt-1">
            <Home className="h-3 w-3 shrink-0" /> {kelurahan}
          </div>
        </div>
      </div>

      {/* Total peserta stat */}
      <div className="rounded-2xl p-4 flex items-center gap-3 bg-white border border-slate-100 shadow-sm">
        <div className="h-12 w-12 rounded-xl bg-violet-50 flex items-center justify-center shrink-0">
          <Users className="h-6 w-6 text-violet-500" />
        </div>
        <div>
          <div className="text-[9px] font-bold tracking-widest text-slate-400 mb-0.5">Total Peserta dari Desa/Kel. Ini</div>
          <div className="text-2xl font-extrabold text-slate-900 leading-none">{isLoading ? "..." : peserta.length}</div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
          <Users className="h-4 w-4 text-slate-500" />
          <span className="font-bold text-slate-900">Peserta</span>
          {!isLoading && (
            <span className="ml-auto text-xs text-violet-600 font-semibold bg-violet-50 px-2 py-0.5 rounded-lg">{peserta.length} orang</span>
          )}
        </div>

        {isLoading ? (
          <div className="p-10 text-center text-slate-400 text-sm">Memuat peserta...</div>
        ) : peserta.length === 0 ? (
          <div className="p-10 text-center text-slate-400 text-sm">Tidak ada peserta ditemukan</div>
        ) : (
          <div className="divide-y divide-slate-50">
            {paged.map((p, i) => (
              <button
                key={p.nik}
                onClick={() => navigate(`/participants/${p.nik}`)}
                className="w-full flex items-center gap-3 px-5 py-3 hover:bg-violet-50/50 transition text-left group"
              >
                {/* Avatar / rank */}
                <div className="h-9 w-9 rounded-xl bg-violet-50 group-hover:bg-violet-100 flex items-center justify-center text-violet-600 font-bold text-sm shrink-0 transition">
                  {startNo + i + 1}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm text-slate-900 group-hover:text-violet-700 transition truncate">
                    {p.fullName}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-400 flex-wrap">
                    <span className="flex items-center gap-1">
                      <User className="h-3 w-3" />
                      {p.gender ?? "—"} {p.occupation ? `· ${p.occupation}` : ""}
                    </span>
                    {p.phone && (
                      <span className="flex items-center gap-1">
                        <Phone className="h-3 w-3" />
                        {p.phone}
                      </span>
                    )}
                  </div>
                  {p.tags && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {p.tags.split(",").map((t) => t.trim()).filter(Boolean).map((t) => (
                        <span key={t} className="inline-flex items-center gap-1 text-[10px] bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded-full">
                          <Tag className="h-2.5 w-2.5" />{t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="text-right shrink-0">
                  <div className="font-mono text-xs text-slate-400">{p.nik}</div>
                  {p.registeredAt && (
                    <div className="flex items-center gap-1 text-[10px] text-slate-300 mt-0.5 justify-end">
                      <Clock className="h-2.5 w-2.5" />
                      {new Date(p.registeredAt).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
                    </div>
                  )}
                </div>

                <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-violet-400 transition shrink-0" />
              </button>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-5 py-4 border-t border-slate-100 flex items-center justify-between gap-3">
            <span className="text-xs text-slate-400">
              Menampilkan {startNo + 1}–{Math.min(startNo + PAGE_SIZE, peserta.length)} dari {peserta.length} peserta
            </span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="h-8 w-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-violet-50 hover:border-violet-300 hover:text-violet-600 disabled:opacity-30 disabled:cursor-not-allowed transition"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              {Array.from({ length: totalPages }, (_, idx) => idx).map((idx) => (
                <button
                  key={idx}
                  onClick={() => setPage(idx)}
                  className={`h-8 min-w-8 px-2 rounded-lg text-xs font-semibold border transition ${
                    idx === page
                      ? "bg-violet-600 text-white border-violet-600"
                      : "border-slate-200 text-slate-500 hover:bg-violet-50 hover:border-violet-300 hover:text-violet-600"
                  }`}
                >
                  {idx + 1}
                </button>
              ))}
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page === totalPages - 1}
                className="h-8 w-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-violet-50 hover:border-violet-300 hover:text-violet-600 disabled:opacity-30 disabled:cursor-not-allowed transition"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Main page ────────────────────────────────────────────────────────── */
export default function PemetaanPage() {
  const [view, setView] = useState<View>({ type: "kabupaten" });

  const { data: summary } = useQuery<Summary>({
    queryKey: ["pemetaan-summary"],
    queryFn: () => fetch(`${BASE}/api/pemetaan/summary`, { credentials: "include" }).then((r) => r.json()),
  });
  const { data: kabData = [] } = useQuery<KabupatenRow[]>({
    queryKey: ["pemetaan-kabupaten"],
    queryFn: () => fetch(`${BASE}/api/pemetaan/kabupaten`, { credentials: "include" }).then((r) => r.json()).then((d) => Array.isArray(d) ? d : []),
  });

  return (
    <Layout>
      <div className="p-4 md:p-6 space-y-5 max-w-5xl">
        {/* Header */}
        <div className="flex items-center gap-4">
          {view.type !== "kabupaten" && (
            <button
              onClick={() => setView(backView(view))}
              className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 border border-slate-200 hover:border-slate-300 px-3 py-2 rounded-xl transition shrink-0"
            >
              <ArrowLeft className="h-4 w-4" />
              Kembali
            </button>
          )}
          <div className="flex-1">
            <Breadcrumb view={view} onNav={setView} />
          </div>
        </div>

        {/* Map — tetap tampil di view kabupaten dan kecamatan */}
        {(view.type === "kabupaten" || view.type === "kecamatan") && (
          <PetaMapContent
            onDesaClick={(desa, _kec, kab) =>
              setView({ type: "detail", kelurahan: desa, kabupaten: kab })
            }
            onKabupatenClick={(kab) => setView({ type: "kecamatan", kabupaten: kab })}
          />
        )}

        {/* Tabel di bawah map — berubah sesuai level yang dipilih */}
        {view.type === "kabupaten" && (
          <KabupatenView summary={summary} kabData={kabData} onSelect={(kab) => setView({ type: "kecamatan", kabupaten: kab })} />
        )}

        {view.type === "kecamatan" && (
          <KecamatanView
            kabupaten={view.kabupaten}
            onSelect={(kec) => setView({ type: "desa", kabupaten: view.kabupaten, kecamatan: kec })}
          />
        )}

        {view.type === "desa" && (
          <DesaView
            kabupaten={view.kabupaten}
            kecamatan={view.kecamatan}
            onSelect={(kel) => setView({ type: "detail", kelurahan: kel, kabupaten: view.kabupaten, kecamatan: view.kecamatan })}
          />
        )}
        {view.type === "detail" && (
          <DesaDetailView
            kelurahan={view.kelurahan}
            onSelectEvent={(eventId, eventName) =>
              setView({ type: "peserta", eventId, eventName, kelurahan: view.kelurahan, kabupaten: view.kabupaten, kecamatan: view.kecamatan })
            }
          />
        )}
        {view.type === "peserta" && (
          <PesertaView eventId={view.eventId} eventName={view.eventName} kelurahan={view.kelurahan} />
        )}
      </div>
    </Layout>
  );
}
