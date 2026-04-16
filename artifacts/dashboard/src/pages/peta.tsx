import { useState, useEffect } from "react";
import { MapContainer, TileLayer, GeoJSON, ZoomControl, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";
import { jatimKabupatenGeo } from "@/data/jatim-geo";
import { jatimKecamatanGeo } from "@/data/jatim-kecamatan-geo";

const TOOLTIP_STYLE = `
  .leaflet-tooltip { border: none !important; outline: none !important; box-shadow: 0 4px 20px rgba(0,0,0,0.13) !important; border-radius: 10px !important; background: #fff !important; padding: 8px 12px !important; }
  .leaflet-tooltip::before { display: none !important; }
  .leaflet-container,
  .leaflet-container:focus,
  .leaflet-container:focus-visible,
  .leaflet-container *,
  .leaflet-container *:focus,
  .leaflet-container *:focus-visible,
  .leaflet-container svg,
  .leaflet-container svg:focus,
  .leaflet-container path,
  .leaflet-container path:focus {
    outline: none !important;
    box-shadow: none !important;
  }
`;

function InjectTooltipStyle() {
  useEffect(() => {
    let el = document.getElementById("ktp-tooltip-style") as HTMLStyleElement | null;
    if (!el) { el = document.createElement("style"); el.id = "ktp-tooltip-style"; }
    el.textContent = TOOLTIP_STYLE;
    document.head.appendChild(el);
  }, []);
  return null;
}

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const MAP_CENTER: [number, number] = [-7.87, 111.45];

function FitBounds({ geojson }: { geojson: any }) {
  const map = useMap();
  useEffect(() => {
    if (!geojson || !geojson.features?.length) return;
    try {
      const layer = L.geoJSON(geojson);
      const bounds = layer.getBounds();
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [24, 24] });
    } catch {}
  }, [geojson, map]);
  return null;
}

function MapLabels({ features, getName, fontSize = 11, fontWeight = "700", color = "#1e293b" }: {
  features: any[];
  getName: (f: any) => string;
  fontSize?: number;
  fontWeight?: string;
  color?: string;
}) {
  const map = useMap();
  useEffect(() => {
    const markers: L.Marker[] = [];
    features.forEach(f => {
      const name = getName(f);
      if (!name) return;
      try {
        const center = L.geoJSON(f).getBounds().getCenter();
        const icon = L.divIcon({
          html: `<span style="display:block;transform:translate(-50%,-50%);font-family:'Plus Jakarta Sans',sans-serif;font-size:${fontSize}px;font-weight:${fontWeight};color:${color};white-space:nowrap;text-shadow:0 0 4px #fff,0 0 8px #fff,0 1px 3px rgba(255,255,255,0.98);pointer-events:none;line-height:1;letter-spacing:0.01em">${name}</span>`,
          className: "",
          iconSize: [1, 1],
          iconAnchor: [0, 0],
        });
        const marker = L.marker(center, { icon, interactive: false, keyboard: false });
        marker.addTo(map);
        markers.push(marker);
      } catch {}
    });
    return () => { markers.forEach(m => m.remove()); };
  }, [features, map]);
  return null;
}

interface KabupatenRow { kabupaten: string; totalInput: number; totalDesa: number; totalKecamatan: number; totalEvent: number; }
interface KecamatanRow { kecamatan: string; kabupaten: string; totalInput: number; totalDesa: number; totalEvent: number; }
interface DesaRow { kelurahan: string; kecamatan: string; kabupaten: string; totalInput: number; totalEvent: number; }

function getColor(count: number, max: number): string {
  if (!count || max === 0) return "#e2e8f0";
  const r = count / max;
  if (r < 0.15) return "#dbeafe";
  if (r < 0.35) return "#93c5fd";
  if (r < 0.55) return "#60a5fa";
  if (r < 0.75) return "#3b82f6";
  return "#1d4ed8";
}

interface PetaMapProps {
  onDesaClick?: (desa: string, kecamatan: string, kabupaten: string) => void;
  onKabupatenClick?: (kabupaten: string) => void;
}

export default function PetaMapContent({ onDesaClick, onKabupatenClick }: PetaMapProps = {}) {
  const [view, setView] = useState<"kabupaten" | "kecamatan">("kabupaten");
  const [selectedKab, setSelectedKab] = useState<string | null>(null);
  const [selectedKec, setSelectedKec] = useState<string | null>(null);
  const [allDesaGeo, setAllDesaGeo] = useState<any | null>(null);
  const [desaGeoLoading, setDesaGeoLoading] = useState(false);

  useEffect(() => {
    if (allDesaGeo || desaGeoLoading) return;
    setDesaGeoLoading(true);
    fetch(`${BASE}/jatim-5kab-desa.geojson`)
      .then(r => r.json())
      .then(data => setAllDesaGeo(data))
      .catch(() => {})
      .finally(() => setDesaGeoLoading(false));
  }, []);

  const { data: kabData = [] } = useQuery<KabupatenRow[]>({
    queryKey: ["pemetaan-kabupaten"],
    queryFn: () => fetch(`${BASE}/api/pemetaan/kabupaten`, { credentials: "include" }).then(r => r.json()).then(d => Array.isArray(d) ? d : []),
  });

  const { data: kecData = [] } = useQuery<KecamatanRow[]>({
    queryKey: ["pemetaan-kecamatan"],
    queryFn: () => fetch(`${BASE}/api/pemetaan/kecamatan`, { credentials: "include" }).then(r => r.json()).then(d => Array.isArray(d) ? d : []),
  });

  const { data: desaData = [] } = useQuery<DesaRow[]>({
    queryKey: ["peta-desa", selectedKab, selectedKec],
    queryFn: () => fetch(`${BASE}/api/pemetaan/desa?kabupaten=${encodeURIComponent(selectedKab || "")}&kecamatan=${encodeURIComponent(selectedKec || "")}`, { credentials: "include" }).then(r => r.json()).then(d => Array.isArray(d) ? d : []),
    enabled: !!selectedKec,
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

  // Filter desa GeoJSON for selected kabupaten + kecamatan
  const desaFeatures = (allDesaGeo && selectedKab && selectedKec)
    ? allDesaGeo.features.filter((f: any) =>
        f.properties?.district?.toLowerCase() === selectedKab.toLowerCase() &&
        f.properties?.sub_district?.toLowerCase() === selectedKec.toLowerCase())
    : [];
  const desaGeoFiltered = { type: "FeatureCollection", features: desaFeatures };

  // Build participant count lookup by village name
  const countByDesa = Object.fromEntries(desaData.map(d => [d.kelurahan.toLowerCase(), Number(d.totalInput)]));
  const eventByDesa = Object.fromEntries(desaData.map(d => [d.kelurahan.toLowerCase(), d.totalEvent ?? 0]));
  const maxDesa = Math.max(...desaData.map(d => Number(d.totalInput)), 1);

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
      { sticky: true, className: "ktp-tooltip" }
    );
    layer.on({
      click: () => {
        setSelectedKab(name);
        setView("kecamatan");
        onKabupatenClick?.(name);
      },
      mouseover: (e) => view === "kabupaten" && (e.target as L.Path).setStyle({ weight: 3, fillOpacity: 0.94 }),
      mouseout: (e) => view === "kabupaten" && (e.target as L.Path).setStyle({ weight: 2, fillOpacity: 0.82 }),
    });
  }

  function onEachKec(feature: any, layer: L.Layer) {
    const name = feature.properties?.name || "";
    const count = countByKec[name.toLowerCase()] || 0;
    const events = eventByKec[name.toLowerCase()] || 0;
    const isSelected = name === selectedKec;
    (layer as L.Path).setStyle({
      fillColor: getColor(count, maxKec),
      weight: isSelected ? 2.5 : 1.5,
      opacity: 1, color: isSelected ? "#2563eb" : "white",
      fillOpacity: isSelected ? 0.90 : 0.78,
    });
    layer.bindTooltip(
      `<div style="font-family:sans-serif;font-size:13px;line-height:1.5">
        <b style="font-size:14px">${name}</b><br/>
        <span style="color:#3b82f6">👥 ${count.toLocaleString()} peserta</span><br/>
        <span style="color:#64748b">📅 ${events} event</span><br/>
        <span style="color:#94a3b8;font-size:11px">Klik untuk lihat desa</span>
      </div>`,
      { sticky: true, className: "ktp-tooltip" }
    );
    layer.on({
      click: () => setSelectedKec(name),
      mouseover: (e) => (e.target as L.Path).setStyle({ fillOpacity: 0.95, weight: 2.5 }),
      mouseout: (e) => (e.target as L.Path).setStyle({ fillOpacity: isSelected ? 0.90 : 0.78, weight: isSelected ? 2.5 : 1.5 }),
    });
  }

  function onEachDesa(feature: any, layer: L.Layer) {
    const villageName = feature.properties?.village || "";
    const displayName = feature.properties?.kelurahan || villageName;
    const count = countByDesa[villageName.toLowerCase()] ?? 0;
    const events = eventByDesa[villageName.toLowerCase()] ?? 0;
    (layer as L.Path).setStyle({
      fillColor: getColor(count, maxDesa),
      weight: 1, opacity: 1, color: "white", fillOpacity: 0.80,
    });
    const hasData = count > 0;
    layer.bindTooltip(
      `<div style="font-family:sans-serif;font-size:13px;line-height:1.5">
        <b style="font-size:14px">${displayName}</b><br/>
        <span style="color:#10b981">👥 ${count.toLocaleString()} peserta</span><br/>
        <span style="color:#64748b">📅 ${events} event</span>${hasData && onDesaClick ? `<br/><span style="color:#94a3b8;font-size:11px">Klik untuk profil desa</span>` : ""}
      </div>`,
      { sticky: true, className: "ktp-tooltip" }
    );
    layer.on({
      click: () => {
        if (onDesaClick && selectedKab && selectedKec) {
          onDesaClick(displayName, selectedKec, selectedKab);
        }
      },
      mouseover: (e) => {
        (e.target as L.Path).setStyle({ fillOpacity: 0.96, weight: 2, color: onDesaClick ? "#2563eb" : "white" });
        if (onDesaClick) (e.target as L.Layer).getElement?.()?.setAttribute?.("style", "cursor:pointer");
      },
      mouseout:  (e) => (e.target as L.Path).setStyle({ fillOpacity: 0.80, weight: 1, color: "white" }),
    });
  }

  function goBack() { setView("kabupaten"); setSelectedKab(null); setSelectedKec(null); }

  const selectedInfo = kabData.find(k => k.kabupaten === selectedKab);

  return (
    <div className="flex flex-col gap-4">
      <InjectTooltipStyle />
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
        {desaGeoLoading && (
          <span className="text-xs text-slate-400 bg-slate-50 px-2 py-0.5 rounded-lg">Memuat peta desa…</span>
        )}
        {view === "kecamatan" && selectedKec && !desaGeoLoading && allDesaGeo && desaFeatures.length > 0 && (
          <span className="text-xs text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-lg">{desaFeatures.length} desa/kel. ditampilkan</span>
        )}
      </div>

      {/* Map */}
      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden" style={{ height: 420 }}>
        <MapContainer
          center={MAP_CENTER}
          zoom={view === "kecamatan" ? 10 : 9}
          style={{ height: "100%", width: "100%", outline: "none" }}
          zoomControl={false}
          key={view === "kecamatan" ? `kec-${selectedKab}` : "kab"}
          // @ts-ignore
          tabIndex={-1}
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
          {/* Kabupaten labels */}
          <MapLabels
            key={`kab-labels-${view}`}
            features={(jatimKabupatenGeo as any).features}
            getName={(f) => f.properties?.name || ""}
            fontSize={13}
            fontWeight="800"
            color="#1e293b"
          />

          {/* Kecamatan layer — shown when drilling into a kabupaten */}
          {view === "kecamatan" && kecFeatures.length > 0 && (
            <>
              <GeoJSON
                key={`kec-${selectedKab}-${JSON.stringify(countByKec)}`}
                data={kecGeoFiltered as any}
                onEachFeature={onEachKec}
              />
              {/* Kecamatan labels */}
              <MapLabels
                key={`kec-labels-${selectedKab}`}
                features={kecFeatures}
                getName={(f) => f.properties?.name || ""}
                fontSize={10}
                fontWeight="700"
                color="#1e3a8a"
              />
            </>
          )}

          {/* Desa border layer — shown when a kecamatan is selected */}
          {view === "kecamatan" && selectedKec && desaFeatures.length > 0 && (
            <>
              <GeoJSON
                key={`desa-${selectedKab}-${selectedKec}-${JSON.stringify(countByDesa)}`}
                data={desaGeoFiltered as any}
                onEachFeature={onEachDesa}
              />
              {/* Desa labels */}
              <MapLabels
                key={`desa-labels-${selectedKab}-${selectedKec}`}
                features={desaFeatures}
                getName={(f) => f.properties?.kelurahan || f.properties?.village || ""}
                fontSize={9}
                fontWeight="600"
                color="#166534"
              />
              <FitBounds geojson={desaGeoFiltered} />
            </>
          )}
        </MapContainer>
      </div>

      {/* Legend */}
      <div className="bg-white rounded-2xl border border-slate-100 px-4 py-3 flex items-center gap-3 flex-wrap">
        <span className="text-xs font-bold text-slate-400 tracking-wider shrink-0">Kepadatan</span>
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
              onClick={() => { setSelectedKab(k.kabupaten); setView("kecamatan"); onKabupatenClick?.(k.kabupaten); }}
              className="bg-white rounded-xl border border-slate-100 p-3 text-left hover:border-blue-300 hover:shadow-sm transition"
            >
              <div className="flex items-center gap-1.5 mb-1">
                <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: getColor(k.totalInput, maxKab) }} />
                <span className="text-[11px] font-bold text-slate-400 tracking-wider truncate">{k.kabupaten}</span>
              </div>
              <div className="text-xl font-extrabold text-slate-900">{k.totalInput.toLocaleString()}</div>
              <div className="text-[11px] text-slate-400 mt-0.5">{k.totalDesa} desa/kel. · {k.totalKecamatan} kec</div>
            </button>
          ))}
        </div>
      )}

    </div>
  );
}
