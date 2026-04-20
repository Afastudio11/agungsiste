import { useState, useEffect, useRef } from "react";
import { useParams, useLocation } from "wouter";
import Layout from "@/components/layout";
import { ChevronLeft, CheckCircle2, Calendar, MapPin, Users, Clock, X, Plus, Gift } from "@/lib/icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

interface EventData {
  id: number;
  name: string;
  description: string | null;
  category: string | null;
  location: string | null;
  eventDate: string;
  startTime: string | null;
  endTime: string | null;
  targetParticipants: number | null;
  isRsvp: boolean | null;
  status: string | null;
}

const CATEGORIES = [
  "Kegiatan Sosial",
  "Pendidikan",
  "Kesehatan",
  "Ekonomi",
  "Olahraga",
  "Budaya",
  "Keagamaan",
  "Pemerintahan",
  "Lainnya",
];

function FormField({
  label,
  required,
  children,
  hint,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-[12px] font-bold text-slate-600 tracking-wide uppercase">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      {children}
      {hint && <p className="text-[11px] text-slate-400">{hint}</p>}
    </div>
  );
}

export default function EventEditPage() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [form, setForm] = useState({
    name: "",
    description: "",
    category: "",
    location: "",
    eventDate: "",
    startTime: "",
    endTime: "",
    targetParticipants: "",
    isRsvp: false,
    status: "active",
  });
  const [fasilitas, setFasilitas] = useState<string[]>([]);
  const [fasilitasInput, setFasilitasInput] = useState("");
  const fasilitasRef = useRef<HTMLInputElement>(null);

  const { data: event, isLoading, isError } = useQuery<EventData>({
    queryKey: ["event", id],
    queryFn: () => fetch(`/api/events/${id}`).then((r) => {
      if (!r.ok) throw new Error("Event tidak ditemukan");
      return r.json();
    }),
    enabled: !!id,
  });

  useEffect(() => {
    if (event) {
      setForm({
        name: event.name ?? "",
        description: event.description ?? "",
        category: event.category ?? "",
        location: event.location ?? "",
        eventDate: event.eventDate ?? "",
        startTime: event.startTime ?? "",
        endTime: event.endTime ?? "",
        targetParticipants: event.targetParticipants != null ? String(event.targetParticipants) : "",
        isRsvp: event.isRsvp ?? false,
        status: event.status ?? "active",
      });
      try {
        const parsed = JSON.parse((event as any).fasilitas ?? "[]");
        setFasilitas(Array.isArray(parsed) ? parsed : []);
      } catch {
        setFasilitas([]);
      }
    }
  }, [event]);

  const addFasilitas = () => {
    const val = fasilitasInput.trim();
    if (val && !fasilitas.includes(val)) {
      setFasilitas((prev) => [...prev, val]);
    }
    setFasilitasInput("");
    fasilitasRef.current?.focus();
  };

  const mutation = useMutation({
    mutationFn: (data: typeof form) =>
      fetch(`/api/events/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          targetParticipants: data.targetParticipants ? parseInt(data.targetParticipants) : null,
          fasilitas: fasilitas.length > 0 ? JSON.stringify(fasilitas) : null,
        }),
      }).then(async (r) => {
        if (!r.ok) {
          const err = await r.json().catch(() => ({}));
          throw new Error(err.error ?? "Gagal menyimpan");
        }
        return r.json();
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event", id] });
      queryClient.invalidateQueries({ queryKey: ["events"] });
      toast({ title: "Event berhasil diperbarui" });
      navigate(`/events/${id}`);
    },
    onError: (err: Error) => {
      toast({ title: "Gagal menyimpan", description: err.message, variant: "destructive" });
    },
  });

  const set = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-48 text-slate-400 text-sm">Memuat data event...</div>
      </Layout>
    );
  }

  if (isError || !event) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center h-48 gap-3">
          <p className="text-slate-500 text-sm">Event tidak ditemukan.</p>
          <button onClick={() => navigate("/events")} className="text-blue-600 text-sm font-semibold hover:underline">
            Kembali ke daftar
          </button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      {/* Header */}
      <div className="max-w-2xl mx-auto flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate(`/events/${id}`)}
          className="flex items-center justify-center h-8 w-8 rounded-full bg-white border border-slate-200 text-slate-500 hover:bg-slate-50 transition shadow-sm"
        >
          <ChevronLeft size={18} weight="bold" />
        </button>
        <div>
          <h1 className="text-[15px] font-extrabold text-slate-900">Edit Event</h1>
          <p className="text-[11px] text-slate-400 mt-0.5 truncate max-w-xs">{event.name}</p>
        </div>
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); mutation.mutate(form); }}
        className="max-w-2xl mx-auto space-y-6"
      >
        {/* Informasi Dasar */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-5">
          <h2 className="text-[12px] font-bold text-slate-400 tracking-widest uppercase">Informasi Dasar</h2>

          <FormField label="Nama Event" required>
            <input
              value={form.name}
              onChange={set("name")}
              required
              placeholder="Contoh: Seminar Wirausaha Muda"
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-800 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition"
            />
          </FormField>

          <FormField label="Deskripsi">
            <textarea
              value={form.description}
              onChange={set("description")}
              rows={3}
              placeholder="Deskripsi singkat tentang event ini..."
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-800 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition resize-none"
            />
          </FormField>

          <FormField label="Kategori">
            <select
              value={form.category}
              onChange={set("category")}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition bg-white"
            >
              <option value="">— Pilih kategori —</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </FormField>
        </div>

        {/* Waktu & Tempat */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-5">
          <h2 className="text-[12px] font-bold text-slate-400 tracking-widest uppercase">Waktu & Tempat</h2>

          <FormField label="Tanggal Event" required>
            <div className="relative">
              <Calendar size={15} weight="bold" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                type="date"
                value={form.eventDate}
                onChange={set("eventDate")}
                required
                className="w-full rounded-xl border border-slate-200 pl-9 pr-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition"
              />
            </div>
          </FormField>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Jam Mulai">
              <div className="relative">
                <Clock size={15} weight="bold" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  type="time"
                  value={form.startTime}
                  onChange={set("startTime")}
                  className="w-full rounded-xl border border-slate-200 pl-9 pr-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition"
                />
              </div>
            </FormField>
            <FormField label="Jam Selesai">
              <div className="relative">
                <Clock size={15} weight="bold" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  type="time"
                  value={form.endTime}
                  onChange={set("endTime")}
                  className="w-full rounded-xl border border-slate-200 pl-9 pr-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition"
                />
              </div>
            </FormField>
          </div>

          <FormField label="Lokasi">
            <div className="relative">
              <MapPin size={15} weight="bold" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                value={form.location}
                onChange={set("location")}
                placeholder="Contoh: Gedung Serbaguna Trenggalek"
                className="w-full rounded-xl border border-slate-200 pl-9 pr-3 py-2.5 text-sm text-slate-800 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition"
              />
            </div>
          </FormField>
        </div>

        {/* Pengaturan */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-5">
          <h2 className="text-[12px] font-bold text-slate-400 tracking-widest uppercase">Pengaturan</h2>

          <FormField label="Target Peserta" hint="Kosongkan jika tidak ada batas">
            <div className="relative">
              <Users size={15} weight="bold" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                type="number"
                min={0}
                value={form.targetParticipants}
                onChange={set("targetParticipants")}
                placeholder="Contoh: 200"
                className="w-full rounded-xl border border-slate-200 pl-9 pr-3 py-2.5 text-sm text-slate-800 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition"
              />
            </div>
          </FormField>

          <FormField label="Status">
            <select
              value={form.status}
              onChange={set("status")}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition bg-white"
            >
              <option value="active">Aktif</option>
              <option value="inactive">Tidak Aktif</option>
            </select>
          </FormField>

          <FormField label="Mode RSVP" hint="Aktifkan jika peserta perlu mendaftar terlebih dahulu">
            <label className="flex items-center gap-3 cursor-pointer">
              <div
                onClick={() => setForm((prev) => ({ ...prev, isRsvp: !prev.isRsvp }))}
                className={`relative w-11 h-6 rounded-full transition-colors ${form.isRsvp ? "bg-blue-600" : "bg-slate-200"}`}
              >
                <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${form.isRsvp ? "left-6" : "left-1"}`} />
              </div>
              <span className="text-sm text-slate-700">{form.isRsvp ? "RSVP diaktifkan" : "RSVP dinonaktifkan"}</span>
            </label>
          </FormField>
        </div>

        {/* Fasilitas */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
          <h2 className="text-[12px] font-bold text-slate-400 tracking-widest uppercase">Fasilitas</h2>
          <p className="text-[11px] text-slate-400 -mt-2">Isi fasilitas yang didapatkan peserta, mis: Merchandise, Snack, Sertifikat.</p>

          {/* Chips */}
          {fasilitas.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {fasilitas.map((f) => (
                <span key={f} className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 border border-indigo-100 px-3 py-1 text-[12px] font-semibold text-indigo-700">
                  {f}
                  <button
                    type="button"
                    onClick={() => setFasilitas((prev) => prev.filter((x) => x !== f))}
                    className="text-indigo-400 hover:text-indigo-700 transition"
                  >
                    <X size={11} weight="bold" />
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Input + add button */}
          <div className="flex gap-2">
            <input
              ref={fasilitasRef}
              type="text"
              value={fasilitasInput}
              onChange={(e) => setFasilitasInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); addFasilitas(); }
                if (e.key === ",") { e.preventDefault(); addFasilitas(); }
              }}
              placeholder="Ketik fasilitas lalu tekan Enter"
              className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition"
            />
            <button
              type="button"
              onClick={addFasilitas}
              disabled={!fasilitasInput.trim()}
              className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-40 transition"
            >
              <Plus size={14} weight="bold" />
              Tambah
            </button>
          </div>

          {/* Quick suggestions */}
          <div className="flex flex-wrap gap-1.5">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest self-center">Cepat:</span>
            {["Merchandise", "Snack", "Konsumsi", "Sertifikat", "Kaos", "Topi", "Makan Siang"].map((s) => (
              !fasilitas.includes(s) && (
                <button
                  key={s}
                  type="button"
                  onClick={() => setFasilitas((prev) => [...prev, s])}
                  className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-100 hover:border-slate-300 transition"
                >
                  + {s}
                </button>
              )
            ))}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-3 pb-6">
          <button
            type="submit"
            disabled={mutation.isPending}
            className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-blue-600 text-white text-sm font-bold shadow-sm shadow-blue-300/50 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            <CheckCircle2 size={15} weight="bold" />
            {mutation.isPending ? "Menyimpan..." : "Simpan Perubahan"}
          </button>
          <button
            type="button"
            onClick={() => navigate(`/events/${id}`)}
            className="px-5 py-2.5 rounded-full text-sm font-semibold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 transition"
          >
            Batal
          </button>
        </div>
      </form>
    </Layout>
  );
}
