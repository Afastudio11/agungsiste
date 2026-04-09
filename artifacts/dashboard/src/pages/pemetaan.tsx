import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MapPin, Globe, Building2, Home, Search, ChevronRight } from "lucide-react";
import Layout from "@/components/layout";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface Summary {
  totalDesa: number;
  totalKecamatan: number;
  totalKabupaten: number;
  desaWithEvents: number;
}

interface KabupatenRow {
  kabupaten: string;
  totalInput: number;
  totalDesa: number;
  totalKecamatan: number;
  totalEvent: number;
}

interface DesaRow {
  kelurahan: string;
  kecamatan: string;
  kabupaten: string;
  totalInput: number;
  totalEvent: number;
}

interface DesaDetail {
  kelurahan: string;
  kecamatan: string;
  kabupaten: string;
  totalInput: number;
  totalEvent: number;
  events: { eventId: number; eventName: string; eventDate: string; location: string; peserta: number }[];
}

export default function PemetaanPage() {
  const [search, setSearch] = useState("");
  const [kabFilter, setKabFilter] = useState("");
  const [selectedDesa, setSelectedDesa] = useState<string | null>(null);

  const { data: summary } = useQuery<Summary>({
    queryKey: ["pemetaan-summary"],
    queryFn: () => fetch(`${BASE}/api/pemetaan/summary`, { credentials: "include" }).then((r) => r.json()),
  });

  const { data: kabData = [] } = useQuery<KabupatenRow[]>({
    queryKey: ["pemetaan-kabupaten"],
    queryFn: () => fetch(`${BASE}/api/pemetaan/kabupaten`, { credentials: "include" }).then((r) => r.json()),
  });

  const { data: desaData = [] } = useQuery<DesaRow[]>({
    queryKey: ["pemetaan-desa", search, kabFilter],
    queryFn: () => {
      const p = new URLSearchParams();
      if (search) p.set("search", search);
      if (kabFilter) p.set("kabupaten", kabFilter);
      return fetch(`${BASE}/api/pemetaan/desa?${p}`, { credentials: "include" }).then((r) => r.json());
    },
  });

  const { data: desaDetail } = useQuery<DesaDetail>({
    queryKey: ["pemetaan-desa-detail", selectedDesa],
    queryFn: () =>
      fetch(`${BASE}/api/pemetaan/desa/${encodeURIComponent(selectedDesa!)}`, { credentials: "include" }).then((r) => r.json()),
    enabled: !!selectedDesa,
  });

  const coverage = summary ? Math.round((summary.desaWithEvents / Math.max(summary.totalDesa, 1)) * 100) : 0;

  if (selectedDesa && desaDetail) {
    return (
      <Layout>
        <div className="p-4 md:p-6 max-w-4xl">
          <button onClick={() => setSelectedDesa(null)} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-4 transition">
            ← Kembali ke Pemetaan
          </button>
          <div className="bg-gradient-to-br from-blue-800 to-blue-900 rounded-2xl p-5 text-white mb-5">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-xl bg-white/15 flex items-center justify-center text-2xl">🏘️</div>
              <div>
                <div className="text-xl font-extrabold">{desaDetail.kelurahan}</div>
                <div className="text-sm opacity-70">Kec. {desaDetail.kecamatan} · {desaDetail.kabupaten}</div>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 mb-5">
            <div className="bg-white rounded-2xl border border-slate-100 p-4">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Total Input</div>
              <div className="text-3xl font-extrabold text-slate-900">{Number(desaDetail.totalInput).toLocaleString()}</div>
            </div>
            <div className="bg-white rounded-2xl border border-slate-100 p-4">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Total Event</div>
              <div className="text-3xl font-extrabold text-slate-900">{Number(desaDetail.totalEvent)}</div>
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 font-bold text-slate-900">Daftar Event</div>
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 text-xs font-bold text-slate-400 uppercase tracking-wider">
                  <th className="px-5 py-3 text-left">Nama Event</th>
                  <th className="px-5 py-3 text-left">Tanggal</th>
                  <th className="px-5 py-3 text-right">Peserta</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {desaDetail.events.map((e) => (
                  <tr key={e.eventId} className="hover:bg-slate-50/50">
                    <td className="px-5 py-3 text-sm font-semibold text-slate-900">{e.eventName}</td>
                    <td className="px-5 py-3 text-sm text-slate-500">{e.eventDate}</td>
                    <td className="px-5 py-3 text-sm font-bold text-slate-900 text-right">{Number(e.peserta).toLocaleString()}</td>
                  </tr>
                ))}
                {desaDetail.events.length === 0 && (
                  <tr><td colSpan={3} className="px-5 py-6 text-center text-slate-400 text-sm">Tidak ada event</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="p-4 md:p-6 space-y-5 max-w-6xl">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Pemetaan Wilayah</h1>
          <p className="text-sm text-slate-500 mt-0.5">Sebaran event dan peserta per desa, kecamatan, dan kabupaten</p>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Total Desa", value: summary?.totalDesa || 0, icon: Home, color: "blue" },
            { label: "Desa Ada Event", value: summary?.desaWithEvents || 0, icon: MapPin, color: "green" },
            { label: "Kabupaten", value: summary?.totalKabupaten || 0, icon: Building2, color: "purple" },
            { label: "Coverage", value: `${coverage}%`, icon: Globe, color: "amber" },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="bg-white rounded-2xl border border-slate-100 p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className={`h-7 w-7 rounded-lg bg-${color}-50 flex items-center justify-center`}>
                  <Icon className={`h-3.5 w-3.5 text-${color}-600`} />
                </div>
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">{label}</div>
              </div>
              <div className="text-2xl font-extrabold text-slate-900" style={{ letterSpacing: "-0.04em" }}>{value.toLocaleString()}</div>
            </div>
          ))}
        </div>

        {/* Per Kabupaten */}
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 font-bold text-slate-900 flex items-center gap-2">
            <Building2 className="h-4 w-4 text-slate-500" />
            Sebaran per Kabupaten
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 text-xs font-bold text-slate-400 uppercase tracking-wider">
                  <th className="px-5 py-3 text-left">Kabupaten</th>
                  <th className="px-5 py-3 text-right">Total Input</th>
                  <th className="px-5 py-3 text-right">Desa</th>
                  <th className="px-5 py-3 text-right">Kecamatan</th>
                  <th className="px-5 py-3 text-right">Event</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {kabData.slice(0, 10).map((k) => (
                  <tr
                    key={k.kabupaten}
                    className="hover:bg-slate-50/50 cursor-pointer"
                    onClick={() => setKabFilter(k.kabupaten)}
                  >
                    <td className="px-5 py-3 text-sm font-semibold text-slate-900">{k.kabupaten}</td>
                    <td className="px-5 py-3 text-sm text-slate-700 text-right font-bold">{Number(k.totalInput).toLocaleString()}</td>
                    <td className="px-5 py-3 text-sm text-slate-500 text-right">{k.totalDesa}</td>
                    <td className="px-5 py-3 text-sm text-slate-500 text-right">{k.totalKecamatan}</td>
                    <td className="px-5 py-3 text-right">
                      <span className="inline-block text-xs font-bold bg-blue-50 text-blue-600 px-2 py-0.5 rounded-lg">{k.totalEvent}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Desa list */}
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Home className="h-4 w-4 text-slate-500" />
              <span className="font-bold text-slate-900">Daftar Desa</span>
              {kabFilter && (
                <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-lg font-semibold">
                  {kabFilter}
                  <button onClick={() => setKabFilter("")} className="ml-1.5 hover:text-blue-800">×</button>
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 ml-auto">
              <Search className="h-3.5 w-3.5 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari nama desa..."
                className="text-sm px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition w-48"
              />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 text-xs font-bold text-slate-400 uppercase tracking-wider">
                  <th className="px-5 py-3 text-left">Desa / Kelurahan</th>
                  <th className="px-5 py-3 text-left">Kecamatan</th>
                  <th className="px-5 py-3 text-left">Kabupaten</th>
                  <th className="px-5 py-3 text-right">Total Input</th>
                  <th className="px-5 py-3 text-right">Event</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {desaData.map((d) => (
                  <tr key={`${d.kelurahan}-${d.kecamatan}`} className="hover:bg-slate-50/50">
                    <td className="px-5 py-3">
                      <button
                        onClick={() => setSelectedDesa(d.kelurahan)}
                        className="text-sm font-semibold text-blue-600 hover:text-blue-800 transition"
                      >
                        {d.kelurahan}
                      </button>
                    </td>
                    <td className="px-5 py-3 text-sm text-slate-500">{d.kecamatan}</td>
                    <td className="px-5 py-3 text-sm text-slate-500">{d.kabupaten}</td>
                    <td className="px-5 py-3 text-sm font-bold text-slate-900 text-right">{Number(d.totalInput).toLocaleString()}</td>
                    <td className="px-5 py-3 text-right">
                      <span className="text-xs font-bold bg-blue-50 text-blue-600 px-2 py-0.5 rounded-lg">{d.totalEvent}</span>
                    </td>
                    <td className="px-5 py-3">
                      <button onClick={() => setSelectedDesa(d.kelurahan)} className="p-1 hover:bg-slate-100 rounded-lg">
                        <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                      </button>
                    </td>
                  </tr>
                ))}
                {desaData.length === 0 && (
                  <tr><td colSpan={6} className="px-5 py-8 text-center text-slate-400 text-sm">Tidak ada data desa</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Layout>
  );
}
