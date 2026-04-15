import { useState } from "react";
import { MapContainer, TileLayer, GeoJSON, ZoomControl } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";
import { jatimKabupatenGeo } from "@/data/jatim-geo";
import { jatimKecamatanGeo } from "@/data/jatim-kecamatan-geo";

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const MAP_CENTER: [number, number] = [-7.87, 111.45];

interface KabupatenRow { kabupaten: string; totalInput: number; totalDesa: number; totalKecamatan: number; totalEvent: number; }
interface KecamatanRow { kecamatan: string; kabupaten: string; totalInput: number; totalDesa: number; totalEvent: number; }

function getColor(count: number, max: number): string {
  if (!count || max === 0) return "#e2e8f0";
  const r = count / max;
  if (r < 0.15) return "#dbeafe";
  if (r < 0.35) return "#93c5fd";
  if (r < 0.55) return "#60a5fa";
  if (r < 0.75) return "#3b82f6";
  return "#1d4ed8";
}

export default function PetaMapContent() {
  const [view, setView] = useState<"kabupaten" | "kecamatan">("kabupaten");
  const [selectedKab, setSelectedKab] = useState<string | null>(null);

  const { data: kabData = [] } = useQuery<KabupatenRow[]>({
    queryKey: ["pemetaan-kabupaten"],
    queryFn: () => fetch(`${BASE}/api/pemetaan/kabupaten`, { credentials: "include" }).then(r => r.json()).then(d => Array.isArray(d) ? d : []),
  });

  const { data: kecData = [] } = useQuery<KecamatanRow[]>({
    queryKey: ["pemetaan-kecamatan"],
    queryFn: () => fetch(`${BASE}/api/pemetaan/kecamatan`, { credentials: "include" }).then(r => r.json()).then(d => Array.isArray(d) ? d : []),
  });

  const countByKab = Object.fromEntries(kabData.map(k => [k.kabupaten, k.totalInput]));
  const maxKab = Math.max(...kabData.map(k => k.totalInput), 1);

  const countByKec = Object.fromEntries(kecData.map(k => [k.kecamatan.toLowerCase(), k.totalInput]));
  const eventByKec = Object.fromEntries(kecData.map(k => [k.kecamatan.toLowerCase(), k.totalEvent ?? 0]));
  const kecInSelectedKab = kecData.filter(k => k.kabupaten?.toLowerCase() === selectedKab?.toLowerCase());
  const maxKec = Math.max(...kecInSelectedKab.map(k => k.totalInput), 1);

  // Filter kecamatan GeoJSON features for selected kabupaten
  const kecFeatures = selectedKab
    ? (jatimKecamatanGeo as any).features.filter((f: any) =>
        f.properties?.kabupaten?.toLowerCase() === selectedKab.toLowerCase())
    : [];
  const kecGeoFiltered = { type: "FeatureCollection", features: kecFeatures };

  function onEachKab(feature: any, layer: L.Layer) {
    const name = feature.properties?.name || "";
    const count = countByKab[name] || 0;
    const isSelected = name === selectedKab;
    const path = layer as L.Path;
    const opacity = view === "kecamatan" ? (isSelected ? 0.1 : 0.15) : 0.82;
    path.setStyle({
      fillColor: getColor(count, maxKab),
      weight: view === "kecamatan" ? 1 : 2,
      opacity: 1, color: "white", fillOpacity: opacity,
    });
    layer.bindTooltip(
      `<div style="font-family:sans-serif;font-size:13px"><b>${name}</b><br/><span style="color:#64748b">${count.toLocaleString()} peserta</span></div>`,
      { sticky: true }
    );
    layer.on({
      click: () => { setSelectedKab(name); setView("kecamatan"); },
      mouseover: (e) => view === "kabupaten" && (e.target as L.Path).setStyle({ weight: 3, fillOpacity: 0.94 }),
      mouseout: (e) => view === "kabupaten" && (e.target as L.Path).setStyle({ weight: 2, fillOpacity: 0.82 }),
    });
  }

  function onEachKec(feature: any, layer: L.Layer) {
    const name = feature.properties?.name || "";
    const count = countByKec[name.toLowerCase()] || 0;
    const events = eventByKec[name.toLowerCase()] || 0;
    (layer as L.Path).setStyle({
      fillColor: getColor(count, maxKec),
      weight: 1.5, opacity: 1, color: "white", fillOpacity: 0.78,
    });
    layer.bindTooltip(
      `<div style="font-family:sans-serif;font-size:13px;line-height:1.5">
        <b style="font-size:14px">${name}</b><br/>
        <span style="color:#3b82f6">👥 ${count.toLocaleString()} peserta</span><br/>
        <span style="color:#64748b">📅 ${events} event</span>
      </div>`,
      { sticky: true }
    );
    layer.on({
      mouseover: (e) => (e.target as L.Path).setStyle({ fillOpacity: 0.95, weight: 2.5 }),
      mouseout: (e) => (e.target as L.Path).setStyle({ fillOpacity: 0.78, weight: 1.5 }),
    });
  }

  function goBack() { setView("kabupaten"); setSelectedKab(null); }

  const selectedInfo = kabData.find(k => k.kabupaten === selectedKab);

  return (
    <div className="flex flex-col gap-4">
      {/* Sub-header */}
      <div className="flex items-center gap-3">
        {view === "kecamatan" && (
          <button onClick={goBack} className="h-9 w-9 rounded-xl bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition shrink-0">
            <ChevronLeft className="h-5 w-5 text-slate-600" />
          </button>
        )}
        <p className="text-sm font-semibold text-slate-700">
          {view === "kecamatan"
            ? `Kab. ${selectedKab} — ${selectedInfo?.totalKecamatan ?? "..."} kecamatan · ${selectedInfo?.totalInput.toLocaleString() ?? "..."} peserta`
            : "5 Kabupaten Jawa Timur — klik kabupaten untuk detail kecamatan"}
        </p>
      </div>

      {/* Map */}
      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden" style={{ height: 420 }}>
        <MapContainer
          center={MAP_CENTER}
          zoom={view === "kecamatan" ? 10 : 9}
          style={{ height: "100%", width: "100%" }}
          zoomControl={false}
          key={view === "kecamatan" ? `kec-${selectedKab}` : "kab"}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <ZoomControl position="bottomright" />

          {/* Kabupaten layer — always visible */}
          <GeoJSON
            key={`kab-${view}-${JSON.stringify(countByKab)}`}
            data={jatimKabupatenGeo as any}
            onEachFeature={onEachKab}
          />

          {/* Kecamatan layer — shown when drilling into a kabupaten */}
          {view === "kecamatan" && kecFeatures.length > 0 && (
            <GeoJSON
              key={`kec-${selectedKab}-${JSON.stringify(countByKec)}`}
              data={kecGeoFiltered as any}
              onEachFeature={onEachKec}
            />
          )}
        </MapContainer>
      </div>

      {/* Legend */}
      <div className="bg-white rounded-2xl border border-slate-100 px-4 py-3 flex items-center gap-3 flex-wrap">
        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider shrink-0">Kepadatan</span>
        {[
          { bg: "#e2e8f0", label: "0" },
          { bg: "#dbeafe", label: "Sedikit" },
          { bg: "#93c5fd", label: "" },
          { bg: "#60a5fa", label: "" },
          { bg: "#3b82f6", label: "Sedang" },
          { bg: "#1d4ed8", label: "Banyak" },
        ].map(({ bg, label }, i) => (
          <div key={i} className="flex items-center gap-1">
            <div className="h-4 w-6 rounded" style={{ background: bg }} />
            {label && <span className="text-xs text-slate-500">{label}</span>}
          </div>
        ))}
      </div>

      {/* Stats cards */}
      {view === "kabupaten" && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          {kabData.map(k => (
            <button
              key={k.kabupaten}
              onClick={() => { setSelectedKab(k.kabupaten); setView("kecamatan"); }}
              className="bg-white rounded-xl border border-slate-100 p-3 text-left hover:border-blue-300 hover:shadow-sm transition"
            >
              <div className="flex items-center gap-1.5 mb-1">
                <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: getColor(k.totalInput, maxKab) }} />
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider truncate">{k.kabupaten}</span>
              </div>
              <div className="text-xl font-extrabold text-slate-900">{k.totalInput.toLocaleString()}</div>
              <div className="text-[11px] text-slate-400 mt-0.5">{k.totalDesa} desa · {k.totalKecamatan} kec</div>
            </button>
          ))}
        </div>
      )}

      {/* Kecamatan table when drilling down */}
      {view === "kecamatan" && (
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
            <span className="text-sm font-bold text-slate-900">Kecamatan di Kab. {selectedKab}</span>
            <span className="text-xs font-semibold bg-blue-50 text-blue-600 px-2 py-0.5 rounded-lg">{kecInSelectedKab.length} kecamatan</span>
          </div>
          <div className="overflow-x-auto max-h-72 overflow-y-auto">
            <table className="w-full">
              <thead className="sticky top-0 bg-slate-50 z-10">
                <tr className="border-b border-slate-100">
                  <th className="px-5 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">Kecamatan</th>
                  <th className="px-5 py-2.5 text-right text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">Peserta</th>
                  <th className="px-5 py-2.5 text-right text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">Event</th>
                  <th className="px-5 py-2.5 text-right text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">Desa</th>
                  <th className="px-5 py-2.5 w-28 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">Sebaran</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {kecInSelectedKab.map((k, i) => {
                  const pct = Math.round((Number(k.totalInput) / maxKec) * 100);
                  return (
                    <tr key={k.kecamatan} className="hover:bg-blue-50/30 transition-colors">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="h-5 w-5 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                            <span className="text-[9px] font-bold text-blue-500">{i + 1}</span>
                          </div>
                          <span className="text-sm font-semibold text-slate-800">{k.kecamatan}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <span className="text-sm font-bold text-slate-900">{Number(k.totalInput).toLocaleString()}</span>
                        <span className="text-[10px] text-slate-400 ml-1">orang</span>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <span className="text-sm font-semibold text-indigo-600">{k.totalEvent ?? 0}</span>
                        <span className="text-[10px] text-slate-400 ml-1">event</span>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <span className="text-sm text-slate-600">{k.totalDesa}</span>
                        <span className="text-[10px] text-slate-400 ml-1">desa</span>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                            <div className="h-full rounded-full bg-blue-400 transition-all" style={{ width: `${pct}%`, background: getColor(Number(k.totalInput), maxKec) }} />
                          </div>
                          <span className="text-[10px] font-bold text-slate-400 w-7 text-right">{pct}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {kecInSelectedKab.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-center text-sm text-slate-400">Tidak ada data kecamatan</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
