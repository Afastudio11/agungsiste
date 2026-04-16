import { useState } from "react";
import Layout from "@/components/layout";
import {
  HelpCircle,
  ChevronDown,
  ChevronUp,
  ScanLine,
  Users,
  CalendarDays,
  ShieldCheck,
  MessageSquare,
  BookOpen,
  Zap,
} from "lucide-react";

type FAQ = { q: string; a: string };

const faqs: FAQ[] = [
  {
    q: "Bagaimana cara scan KTP peserta?",
    a: "Buka halaman Scan KTP, isi nama staf Anda di bagian atas, lalu upload foto KTP menggunakan tombol 'Choose File' atau kamera. AI akan otomatis membaca semua data dari foto KTP. Setelah data terisi, pilih event yang sedang berlangsung dan klik 'Daftarkan Peserta'.",
  },
  {
    q: "Apakah foto KTP disimpan di sistem?",
    a: "Tidak. Foto KTP hanya digunakan sementara untuk proses pembacaan AI (OCR). Setelah data berhasil diekstrak, foto langsung dihapus dan tidak disimpan di server maupun database. Hanya data teks yang tersimpan.",
  },
  {
    q: "Apa yang terjadi jika peserta sudah terdaftar di event yang sama?",
    a: "Sistem akan menampilkan peringatan duplikat secara otomatis. Peserta yang sama (berdasarkan NIK) hanya bisa terdaftar sekali per event. Namun peserta bisa ikut event yang berbeda.",
  },
  {
    q: "Bisakah peserta ikut lebih dari satu event?",
    a: "Ya. Satu peserta (satu NIK) bisa terdaftar di beberapa event berbeda. Sistem hanya mencegah pendaftaran ganda pada event yang sama.",
  },
  {
    q: "Bagaimana jika data yang dibaca AI salah atau kurang?",
    a: "Setelah AI membaca KTP, semua field bisa diedit secara manual sebelum mendaftar. Klik pada field yang ingin diubah, ketik perbaikan, lalu daftarkan peserta seperti biasa.",
  },
  {
    q: "Apa itu 'Multi-Event Rate' di dashboard?",
    a: "Multi-Event Rate menunjukkan persentase peserta yang ikut lebih dari satu event. Angka ini berguna untuk menganalisis loyalitas peserta dan efektivitas program event Anda.",
  },
  {
    q: "Bagaimana cara menambah atau mengelola event?",
    a: "Buka menu 'Event' di sidebar. Anda bisa melihat semua event, membuat event baru, melihat detail peserta per event, dan memantau statistik masing-masing event.",
  },
  {
    q: "Dari mana data 'Staf Terbanyak Input' berasal?",
    a: "Setiap kali staf melakukan registrasi peserta, nama staf yang diisi di kolom 'Nama Staf' halaman Scan KTP akan tersimpan bersama data registrasi. Halaman Staf menampilkan leaderboard berdasarkan jumlah registrasi yang diinput.",
  },
];

function AccordionItem({ q, a }: FAQ) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`border border-slate-100 rounded-2xl overflow-hidden transition-all ${open ? "shadow-[0_1px_8px_rgba(0,0,0,0.06)]" : ""}`}>
      <button
        onClick={() => setOpen((p) => !p)}
        className="flex w-full items-start justify-between gap-4 px-5 py-4 text-left hover:bg-slate-50/80 transition-colors"
      >
        <span className="text-[13px] font-semibold text-slate-700 leading-snug">{q}</span>
        {open ? (
          <ChevronUp className="h-4 w-4 shrink-0 text-blue-500 mt-0.5" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-slate-400 mt-0.5" />
        )}
      </button>
      {open && (
        <div className="px-5 pb-4 border-t border-slate-50">
          <p className="text-[13px] text-slate-500 leading-relaxed mt-3">{a}</p>
        </div>
      )}
    </div>
  );
}

function QuickGuideCard({
  icon: Icon,
  step,
  title,
  desc,
  color,
}: {
  icon: any;
  step: string;
  title: string;
  desc: string;
  color: string;
}) {
  return (
    <div className="rounded-2xl bg-white border border-slate-100 px-5 py-4 shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
      <div className="flex items-start gap-3">
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${color}`}>
          <Icon className="h-4 w-4 text-white" strokeWidth={2.5} />
        </div>
        <div>
          <p className="text-[10px] font-bold tracking-[0.08em] text-slate-400 mb-0.5">
            Langkah {step}
          </p>
          <p className="text-[13px] font-bold text-slate-800">{title}</p>
          <p className="text-[12px] text-slate-400 mt-0.5 leading-snug">{desc}</p>
        </div>
      </div>
    </div>
  );
}

export default function HelpPage() {
  return (
    <Layout>
      {/* Header */}
      <div className="mb-7">
        <h1
          className="text-[26px] font-extrabold text-slate-900 leading-tight"
          style={{ letterSpacing: "-0.03em" }}
        >
          Help & Support
        </h1>
        <p className="mt-1 text-sm text-slate-400 font-medium">
          Panduan penggunaan dan pertanyaan umum
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* Left — FAQ + Contact */}
        <div className="col-span-2 space-y-4">
          {/* FAQ */}
          <div className="rounded-2xl bg-white border border-slate-100 px-6 py-5 shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
            <div className="flex items-center gap-2 mb-4">
              <HelpCircle className="h-4 w-4 text-blue-500" />
              <p className="text-[15px] font-extrabold text-slate-900" style={{ letterSpacing: "-0.02em" }}>
                Pertanyaan Umum (FAQ)
              </p>
            </div>
            <div className="space-y-2">
              {faqs.map((f) => (
                <AccordionItem key={f.q} {...f} />
              ))}
            </div>
          </div>

          {/* Contact */}
          <div className="rounded-2xl bg-white border border-slate-100 px-6 py-5 shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
            <div className="flex items-center gap-2 mb-4">
              <MessageSquare className="h-4 w-4 text-violet-500" />
              <p className="text-[15px] font-extrabold text-slate-900" style={{ letterSpacing: "-0.02em" }}>
                Hubungi Tim Teknis
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Email Support", value: "support@ktpdashboard.id", icon: "📧" },
                { label: "WhatsApp", value: "+62 812-3456-7890", icon: "💬" },
                { label: "Jam Operasional", value: "Senin – Jumat, 08.00 – 17.00 WIB", icon: "🕐" },
                { label: "Respons", value: "Maks. 1x24 jam kerja", icon: "⚡" },
              ].map((item) => (
                <div key={item.label} className="rounded-xl bg-slate-50 border border-slate-100 px-4 py-3">
                  <p className="text-[10px] font-bold tracking-[0.08em] text-slate-400 mb-1">
                    {item.icon} {item.label}
                  </p>
                  <p className="text-[12px] font-semibold text-slate-700">{item.value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right — Quick guide + About */}
        <div className="col-span-1 space-y-4">
          {/* Quick guide */}
          <div className="rounded-2xl bg-white border border-slate-100 px-5 py-5 shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
            <div className="flex items-center gap-2 mb-4">
              <Zap className="h-4 w-4 text-amber-400" />
              <p className="text-[14px] font-extrabold text-slate-900" style={{ letterSpacing: "-0.02em" }}>
                Cara Cepat Mulai
              </p>
            </div>
            <div className="space-y-3">
              <QuickGuideCard
                icon={CalendarDays}
                step="1"
                title="Buat Event"
                desc="Tambah event baru dari menu Event sebelum mulai scan"
                color="bg-blue-500"
              />
              <QuickGuideCard
                icon={ScanLine}
                step="2"
                title="Scan KTP"
                desc="Isi nama staf, upload foto KTP, pilih event"
                color="bg-emerald-500"
              />
              <QuickGuideCard
                icon={Users}
                step="3"
                title="Monitor Data"
                desc="Pantau peserta dan statistik real-time di Dashboard"
                color="bg-violet-500"
              />
              <QuickGuideCard
                icon={ShieldCheck}
                step="4"
                title="Cek Duplikat"
                desc="Sistem otomatis mencegah duplikasi registrasi per event"
                color="bg-rose-500"
              />
            </div>
          </div>

          {/* About */}
          <div className="rounded-2xl bg-white border border-slate-100 px-5 py-5 shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
            <div className="flex items-center gap-2 mb-3">
              <BookOpen className="h-4 w-4 text-slate-400" />
              <p className="text-[14px] font-extrabold text-slate-900" style={{ letterSpacing: "-0.02em" }}>
                Tentang Aplikasi
              </p>
            </div>
            <p className="text-[12px] text-slate-400 leading-relaxed mb-3">
              KTP Dashboard adalah sistem registrasi peserta event berbasis AI. 
              Foto KTP dipindai menggunakan teknologi computer vision untuk mengekstrak data secara otomatis 
              — cepat, akurat, dan aman.
            </p>
            <div className="space-y-1.5">
              {[
                ["Versi", "1.0.0"],
                ["Dibuat dengan", "React + Express + OpenAI"],
                ["Database", "PostgreSQL"],
                ["OCR Engine", "GPT Vision"],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between text-[11px]">
                  <span className="text-slate-400 font-medium">{k}</span>
                  <span className="font-bold text-slate-600">{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
