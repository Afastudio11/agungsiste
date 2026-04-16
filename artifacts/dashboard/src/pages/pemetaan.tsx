import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  MapPin, Globe, Building2, Home, ChevronRight, ChevronLeft, ArrowLeft,
  Users, CalendarDays, TrendingUp, User, Phone, Tag, Clock,
} from "lucide-react";
import Layout from "@/components/layout";
import PetaMapContent from "@/pages/peta";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface Summary { totalDesa: number; totalKecamatan: number; totalKabupaten: number; desaWithEvents: number; }
interface KabupatenRow { kabupaten: string; totalInput: number; totalDesa: number; totalKecamatan: number; totalEvent: number; }
interface KecamatanRow { kecamatan: string; kabupaten: string; totalInput: number; totalDesa: number; totalEvent: number; }
interface DesaRow { kelurahan: string; kecamatan: string; kabupaten: string; totalInput: number; totalEvent: number; }
interface DesaDetail {
  kelurahan: string; kecamatan: string; kabupaten: string; totalInput: number; totalEvent: number;
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

/* ─── VIEW 1: Kabupaten ────────────────────────────────────────────────── */
function KabupatenView({ summary, kabData, onSelect }: { summary?: Summary; kabData: KabupatenRow[]; onSelect: (k: string) => void }) {
  const coverage = summary ? Math.round((summary.desaWithEvents / Math.max(summary.totalDesa, 1)) * 100) : 0;
  const max = Math.max(...kabData.map((k) => Number(k.totalInput)), 1);
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Desa", value: summary?.totalDesa ?? 0, icon: Home },
          { label: "Desa Ada Event", value: summary?.desaWithEvents ?? 0, icon: MapPin },
          { label: "Kabupaten", value: summary?.totalKabupaten ?? 0, icon: Building2 },
          { label: "Coverage", value: `${coverage}%`, icon: Globe },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="bg-white rounded-2xl border border-slate-100 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Icon className="h-3.5 w-3.5 text-slate-400" />
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">{label}</div>
            </div>
            <div className="text-2xl font-extrabold text-slate-900" style={{ letterSpacing: "-0.04em" }}>
              {typeof value === "number" ? value.toLocaleString() : value}
            </div>
          </div>
        ))}
      </div>
      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
          <Building2 className="h-4 w-4 text-slate-500" />
          <span className="font-bold text-slate-900">Sebaran per Kabupaten</span>
          <span className="ml-auto text-xs text-slate-400">Klik untuk lihat desa</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 text-xs font-bold text-slate-400 uppercase tracking-wider">
                <th className="px-5 py-3 text-left">Kabupaten / Kota</th>
                <th className="px-5 py-3 text-right">Total Peserta</th>
                <th className="px-5 py-3 text-right hidden md:table-cell">Desa</th>
                <th className="px-5 py-3 text-right hidden md:table-cell">Kecamatan</th>
                <th className="px-5 py-3 text-right hidden md:table-cell">Event</th>
                <th className="px-5 py-3 w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {kabData.map((k) => (
                <tr key={k.kabupaten} className="hover:bg-blue-50/60 cursor-pointer transition group" onClick={() => onSelect(k.kabupaten)}>
                  <td className="px-5 py-3">
                    <div className="font-semibold text-sm text-slate-900 group-hover:text-blue-700 transition mb-1">{k.kabupaten}</div>
                    <div className="h-1 w-32 rounded-full bg-slate-100 overflow-hidden">
                      <div className="h-full rounded-full bg-blue-400" style={{ width: `${Math.round((Number(k.totalInput) / max) * 100)}%` }} />
                    </div>
                  </td>
                  <td className="px-5 py-3 text-sm font-bold text-slate-900 text-right">{Number(k.totalInput).toLocaleString()}</td>
                  <td className="px-5 py-3 text-sm text-slate-500 text-right hidden md:table-cell">{k.totalDesa}</td>
                  <td className="px-5 py-3 text-sm text-slate-500 text-right hidden md:table-cell">{k.totalKecamatan}</td>
                  <td className="px-5 py-3 text-right hidden md:table-cell">
                    <span className="text-xs font-bold bg-blue-50 text-blue-600 px-2 py-0.5 rounded-lg">{k.totalEvent}</span>
                  </td>
                  <td className="px-3 py-3"><ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-blue-500 transition" /></td>
                </tr>
              ))}
            </tbody>
          </table>
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

  return (
    <div className="space-y-5">
      {/* Kabupaten header */}
      <div className="bg-gradient-to-br from-blue-700 to-blue-900 rounded-2xl p-5 text-white">
        <div className="flex items-start gap-4">
          <div className="h-12 w-12 rounded-xl bg-white/15 flex items-center justify-center text-2xl shrink-0">🏙️</div>
          <div className="flex-1">
            <div className="text-xs font-bold opacity-60 tracking-widest mb-1 uppercase">Kabupaten</div>
            <div className="text-xl font-extrabold">{kabupaten}</div>
            <div className="text-sm opacity-70 mt-0.5">Klik kecamatan untuk lihat desa</div>
          </div>
        </div>
        {kabInfo && (
          <div className="grid grid-cols-3 gap-3 mt-4">
            {[
              { label: "Total Peserta", value: Number(kabInfo.totalInput).toLocaleString(), icon: TrendingUp },
              { label: "Kecamatan", value: kabInfo.totalKecamatan, icon: MapPin },
              { label: "Event", value: kabInfo.totalEvent, icon: CalendarDays },
            ].map(({ label, value, icon: Icon }) => (
              <div key={label} className="bg-white/10 rounded-xl p-3">
                <div className="flex items-center gap-1.5 mb-1 opacity-70"><Icon className="h-3 w-3" /><span className="text-[10px] font-bold uppercase tracking-wider">{label}</span></div>
                <div className="text-lg font-extrabold">{value}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Kecamatan table */}
      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
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
                <tr className="bg-slate-50 text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                  <th className="px-4 py-3 text-center w-12">No.</th>
                  <th className="px-4 py-3 text-left">Nama Kecamatan</th>
                  <th className="px-4 py-3 text-right">Jumlah Desa</th>
                  <th className="px-4 py-3 text-right">Jumlah Event</th>
                  <th className="px-4 py-3 text-right">Total Peserta</th>
                  <th className="px-3 py-3 w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {kecData.map((k, i) => (
                  <tr key={k.kecamatan} onClick={() => onSelect(k.kecamatan)} className="hover:bg-blue-50/60 cursor-pointer transition group">
                    <td className="px-4 py-3 text-center text-xs text-slate-400 font-medium">{i + 1}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-slate-900 group-hover:text-blue-700 transition">{k.kecamatan}</td>
                    <td className="px-4 py-3 text-sm text-slate-700 text-right">{k.totalDesa}</td>
                    <td className="px-4 py-3 text-sm text-slate-700 text-right">{k.totalEvent}</td>
                    <td className="px-4 py-3 text-sm font-bold text-slate-900 text-right">{Number(k.totalInput).toLocaleString()}</td>
                    <td className="px-3 py-3"><ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-blue-500 transition" /></td>
                  </tr>
                ))}
                {kecData.length === 0 && (
                  <tr><td colSpan={6} className="px-5 py-10 text-center text-slate-400 text-sm">Tidak ada data kecamatan</td></tr>
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
    <div className="space-y-5">
      {/* Kecamatan header */}
      <div className="bg-gradient-to-br from-indigo-700 to-indigo-900 rounded-2xl p-5 text-white">
        <div className="flex items-start gap-4">
          <div className="h-12 w-12 rounded-xl bg-white/15 flex items-center justify-center text-2xl shrink-0">📍</div>
          <div className="flex-1">
            <div className="text-xs font-bold opacity-60 tracking-widest mb-1 uppercase">Kecamatan</div>
            <div className="text-xl font-extrabold">{kecamatan}</div>
            <div className="text-sm opacity-70 mt-0.5">{kabupaten}</div>
          </div>
        </div>
        {kecInfo && (
          <div className="grid grid-cols-3 gap-3 mt-4">
            {[
              { label: "Total Peserta", value: Number(kecInfo.totalInput).toLocaleString(), icon: TrendingUp },
              { label: "Desa", value: kecInfo.totalDesa, icon: Home },
              { label: "Event", value: kecInfo.totalEvent, icon: CalendarDays },
            ].map(({ label, value, icon: Icon }) => (
              <div key={label} className="bg-white/10 rounded-xl p-3">
                <div className="flex items-center gap-1.5 mb-1 opacity-70"><Icon className="h-3 w-3" /><span className="text-[10px] font-bold uppercase tracking-wider">{label}</span></div>
                <div className="text-lg font-extrabold">{value}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Desa table */}
      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
          <span className="font-bold text-slate-900">Daftar Desa / Kelurahan</span>
          <span className="ml-auto text-xs text-indigo-600 font-semibold bg-indigo-50 px-2 py-0.5 rounded-lg">{desaData.length} desa</span>
        </div>
        {isLoading ? (
          <div className="p-10 text-center text-slate-400 text-sm">Memuat data desa...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                  <th className="px-4 py-3 text-center w-12">No.</th>
                  <th className="px-4 py-3 text-left">Nama Desa</th>
                  <th className="px-4 py-3 text-right">Jumlah Event</th>
                  <th className="px-4 py-3 text-right">Total Peserta</th>
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
                  <tr><td colSpan={5} className="px-5 py-10 text-center text-slate-400 text-sm">Tidak ada data desa</td></tr>
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
  if (isLoading) return <div className="py-16 text-center text-slate-400 text-sm">Memuat data desa...</div>;
  if (!data) return null;
  return (
    <div className="space-y-5">
      <div className="bg-gradient-to-br from-green-700 to-green-900 rounded-2xl p-5 text-white">
        <div className="flex items-start gap-4">
          <div className="h-12 w-12 rounded-xl bg-white/15 flex items-center justify-center text-2xl shrink-0">🏘️</div>
          <div>
            <div className="text-xs font-bold opacity-60 tracking-widest mb-1 uppercase">Desa / Kelurahan</div>
            <div className="text-xl font-extrabold">{data.kelurahan}</div>
            <div className="text-sm opacity-70 mt-0.5">Kec. {data.kecamatan} · {data.kabupaten}</div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 mt-4">
          <div className="bg-white/10 rounded-xl p-3">
            <div className="flex items-center gap-1.5 mb-1 opacity-70"><Users className="h-3 w-3" /><span className="text-[10px] font-bold uppercase tracking-wider">Total Peserta</span></div>
            <div className="text-xl font-extrabold">{Number(data.totalInput).toLocaleString()}</div>
          </div>
          <div className="bg-white/10 rounded-xl p-3">
            <div className="flex items-center gap-1.5 mb-1 opacity-70"><CalendarDays className="h-3 w-3" /><span className="text-[10px] font-bold uppercase tracking-wider">Total Event</span></div>
            <div className="text-xl font-extrabold">{Number(data.totalEvent)}</div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
          <span className="font-bold text-slate-900">Daftar Event</span>
          <span className="ml-auto text-xs text-green-600 font-semibold bg-green-50 px-2 py-0.5 rounded-lg">{data.events.length} event</span>
        </div>
        {data.events.length === 0 ? (
          <div className="p-10 text-center text-slate-400 text-sm">Tidak ada event</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                  <th className="px-4 py-3 text-center w-12">No.</th>
                  <th className="px-4 py-3 text-left">Nama Event</th>
                  <th className="px-4 py-3 text-right">Total Peserta</th>
                  <th className="px-3 py-3 w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {data.events.map((ev, i) => (
                  <tr key={ev.eventId} onClick={() => onSelectEvent(ev.eventId, ev.eventName)} className="hover:bg-green-50/60 cursor-pointer transition group">
                    <td className="px-4 py-3 text-center text-xs text-slate-400 font-medium">{i + 1}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-slate-900 group-hover:text-green-700 transition">{ev.eventName}</td>
                    <td className="px-4 py-3 text-sm font-bold text-slate-900 text-right">{Number(ev.peserta).toLocaleString()}</td>
                    <td className="px-3 py-3"><ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-green-500 transition" /></td>
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
    <div className="space-y-5">
      {/* Header */}
      <div className="bg-gradient-to-br from-violet-700 to-violet-900 rounded-2xl p-5 text-white">
        <div className="flex items-start gap-4">
          <div className="h-12 w-12 rounded-xl bg-white/15 flex items-center justify-center text-2xl shrink-0">👥</div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-bold opacity-60 tracking-widest mb-1 uppercase">Daftar Peserta</div>
            <div className="text-lg font-extrabold leading-tight truncate">{eventName}</div>
            <div className="text-sm opacity-70 mt-0.5 flex items-center gap-1.5">
              <Home className="h-3 w-3" /> {kelurahan}
            </div>
          </div>
        </div>
        <div className="bg-white/10 rounded-xl p-3 mt-4 flex items-center gap-3">
          <Users className="h-5 w-5 opacity-70" />
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider opacity-70">Total Peserta dari Desa Ini</div>
            <div className="text-2xl font-extrabold" style={{ letterSpacing: "-0.04em" }}>{isLoading ? "..." : peserta.length}</div>
          </div>
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
        <div className="flex items-start gap-4">
          {view.type !== "kabupaten" && (
            <button
              onClick={() => setView(backView(view))}
              className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 border border-slate-200 hover:border-slate-300 px-3 py-2 rounded-xl transition mt-0.5 shrink-0"
            >
              <ArrowLeft className="h-4 w-4" />
              Kembali
            </button>
          )}
          <div className="flex-1">
            <div className="mt-1"><Breadcrumb view={view} onNav={setView} /></div>
          </div>
        </div>

        {/* Top-level: map + table together */}
        {view.type === "kabupaten" && (
          <>
            <PetaMapContent
              onDesaClick={(desa, _kec, kab) =>
                setView({ type: "detail", kelurahan: desa, kabupaten: kab })
              }
              onKabupatenClick={(kab) => setView({ type: "kecamatan", kabupaten: kab })}
            />
            <KabupatenView summary={summary} kabData={kabData} onSelect={(kab) => setView({ type: "kecamatan", kabupaten: kab })} />
          </>
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
