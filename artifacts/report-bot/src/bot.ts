import { Bot, InputFile } from "grammy";
import { db } from "@workspace/db";
import { eventsTable, participantsTable, eventRegistrationsTable, prizeDistributionsTable } from "@workspace/db";
import { eq, and, ne, gte, lte, count, desc, asc, sql } from "drizzle-orm";
import cron from "node-cron";

const BOT_TOKEN = process.env.TELEGRAM_REPORT_BOT_TOKEN;
if (!BOT_TOKEN) { console.error("TELEGRAM_REPORT_BOT_TOKEN is not set"); process.exit(1); }

const bot = new Bot(BOT_TOKEN);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function h(text: string | null | undefined): string {
  if (!text) return "—";
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function wibDayRange(daysOffset: number = 0): { start: Date; end: Date; dateStr: string } {
  const wibOffset = 7 * 60 * 60 * 1000;
  const nowWib = new Date(Date.now() + wibOffset);
  nowWib.setUTCDate(nowWib.getUTCDate() + daysOffset);
  const startWib = new Date(Date.UTC(nowWib.getUTCFullYear(), nowWib.getUTCMonth(), nowWib.getUTCDate(), 0, 0, 0));
  const endWib   = new Date(Date.UTC(nowWib.getUTCFullYear(), nowWib.getUTCMonth(), nowWib.getUTCDate(), 23, 59, 59, 999));
  const startUtc = new Date(startWib.getTime() - wibOffset);
  const endUtc   = new Date(endWib.getTime() - wibOffset);
  const y = nowWib.getUTCFullYear();
  const m = String(nowWib.getUTCMonth() + 1).padStart(2, "0");
  const d = String(nowWib.getUTCDate()).padStart(2, "0");
  return { start: startUtc, end: endUtc, dateStr: `${y}-${m}-${d}` };
}

const HARI  = ["Minggu","Senin","Selasa","Rabu","Kamis","Jumat","Sabtu"];
const BULAN = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];
const BULAN_PANJANG = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];

function formatTanggalWIB(): string {
  const wibOffset = 7 * 60 * 60 * 1000;
  const nowWib = new Date(Date.now() + wibOffset);
  return `${HARI[nowWib.getUTCDay()]}, ${nowWib.getUTCDate()} ${BULAN_PANJANG[nowWib.getUTCMonth()]} ${nowWib.getUTCFullYear()}`;
}

function delta(today: number, yesterday: number): string {
  const diff = today - yesterday;
  if (diff > 0) return `<b>+${diff}</b> ↑`;
  if (diff < 0) return `<b>${diff}</b> ↓`;
  return `<b>0</b> →`;
}

// ─── Chart via QuickChart.io ───────────────────────────────────────────────────

interface DayData { label: string; value: number }

async function fetchLast7Days(): Promise<DayData[]> {
  const wibOffset = 7 * 60 * 60 * 1000;
  const result: DayData[] = [];

  for (let i = 6; i >= 0; i--) {
    const { start, end, dateStr } = wibDayRange(-i);
    const nowWib = new Date(Date.now() + wibOffset - i * 86400000);
    const label = `${nowWib.getUTCDate()} ${BULAN[nowWib.getUTCMonth()]}`;
    const [row] = await db
      .select({ count: count() })
      .from(eventRegistrationsTable)
      .where(and(
        gte(eventRegistrationsTable.registeredAt, start),
        lte(eventRegistrationsTable.registeredAt, end),
        ne(eventRegistrationsTable.registrationType, "attendance"),
      ));
    result.push({ label, value: row.count });
  }
  return result;
}

async function fetchGenderData(): Promise<{ laki: number; perempuan: number; lainnya: number }> {
  const rows = await db
    .select({ gender: participantsTable.gender, count: count() })
    .from(participantsTable)
    .groupBy(participantsTable.gender);

  let laki = 0, perempuan = 0, lainnya = 0;
  for (const r of rows) {
    const g = (r.gender ?? "").toUpperCase();
    if (g.includes("LAKI")) laki += r.count;
    else if (g.includes("PEREMPUAN")) perempuan += r.count;
    else lainnya += r.count;
  }
  return { laki, perempuan, lainnya };
}

function buildBarChartUrl(days: DayData[], title: string): string {
  const labels = days.map(d => d.label);
  const data   = days.map(d => d.value);
  const maxVal = Math.max(...data, 1);

  const config = {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Pendaftaran",
        data,
        backgroundColor: "rgba(79, 70, 229, 0.85)",
        borderColor: "rgba(79, 70, 229, 1)",
        borderWidth: 1,
        borderRadius: 6,
      }],
    },
    options: {
      plugins: {
        title: { display: true, text: title, font: { size: 16, weight: "bold" }, color: "#1e1b4b", padding: { bottom: 16 } },
        legend: { display: false },
      },
      scales: {
        y: {
          beginAtZero: true,
          suggestedMax: Math.ceil(maxVal * 1.2),
          ticks: { color: "#374151", stepSize: Math.max(1, Math.ceil(maxVal / 5)) },
          grid: { color: "rgba(0,0,0,0.06)" },
        },
        x: { ticks: { color: "#374151" }, grid: { display: false } },
      },
    },
  };
  const encoded = encodeURIComponent(JSON.stringify(config));
  return `https://quickchart.io/chart?c=${encoded}&width=800&height=380&backgroundColor=white&devicePixelRatio=2`;
}

function buildDoughnutChartUrl(laki: number, perempuan: number, lainnya: number): string {
  const data = lainnya > 0 ? [laki, perempuan, lainnya] : [laki, perempuan];
  const labels = lainnya > 0 ? ["Laki-laki", "Perempuan", "Lainnya"] : ["Laki-laki", "Perempuan"];
  const colors = ["rgba(59,130,246,0.85)", "rgba(236,72,153,0.85)", "rgba(156,163,175,0.85)"];

  const config = {
    type: "doughnut",
    data: {
      labels,
      datasets: [{ data, backgroundColor: colors.slice(0, data.length), borderWidth: 2, borderColor: "#fff" }],
    },
    options: {
      plugins: {
        title: { display: true, text: "Distribusi Kelamin Peserta", font: { size: 16, weight: "bold" }, color: "#1e1b4b", padding: { bottom: 12 } },
        legend: { position: "bottom", labels: { color: "#374151", padding: 16 } },
        datalabels: {
          color: "#fff",
          font: { weight: "bold", size: 13 },
          formatter: (val: number) => {
            const total = data.reduce((a, b) => a + b, 0);
            return total > 0 ? `${Math.round(val / total * 100)}%` : "";
          },
        },
      },
    },
  };
  const encoded = encodeURIComponent(JSON.stringify(config));
  return `https://quickchart.io/chart?c=${encoded}&width=500&height=380&backgroundColor=white&devicePixelRatio=2`;
}

async function downloadImage(url: string): Promise<Buffer> {
  const resp = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!resp.ok) throw new Error(`QuickChart error: ${resp.status}`);
  return Buffer.from(await resp.arrayBuffer());
}

// ─── Build media group (album) with 2 charts ──────────────────────────────────

async function fetchChartBuffers(): Promise<{ bar: Buffer; donut: Buffer }> {
  const [days, gender] = await Promise.all([fetchLast7Days(), fetchGenderData()]);
  const barUrl   = buildBarChartUrl(days, "Pendaftaran 7 Hari Terakhir");
  const donutUrl = buildDoughnutChartUrl(gender.laki, gender.perempuan, gender.lainnya);
  const [bar, donut] = await Promise.all([downloadImage(barUrl), downloadImage(donutUrl)]);
  return { bar, donut };
}

// ─── Queries ──────────────────────────────────────────────────────────────────

async function buildReport(): Promise<{ text: string; charts: { bar: Buffer; donut: Buffer } }> {
  const today     = wibDayRange(0);
  const yesterday = wibDayRange(-1);

  const [
    [regToday], [regYesterday], [totalPeserta],
    [eventHariIni], [totalEventAktif],
    [prizeToday], [prizeYesterday],
    topStaff, topStaffYesterday,
    charts,
  ] = await Promise.all([
    db.select({ count: count() }).from(eventRegistrationsTable).where(and(gte(eventRegistrationsTable.registeredAt, today.start), lte(eventRegistrationsTable.registeredAt, today.end), ne(eventRegistrationsTable.registrationType, "attendance"))),
    db.select({ count: count() }).from(eventRegistrationsTable).where(and(gte(eventRegistrationsTable.registeredAt, yesterday.start), lte(eventRegistrationsTable.registeredAt, yesterday.end), ne(eventRegistrationsTable.registrationType, "attendance"))),
    db.select({ count: count() }).from(participantsTable),
    db.select({ count: count() }).from(eventsTable).where(and(eq(eventsTable.status, "active"), eq(eventsTable.eventDate, today.dateStr))),
    db.select({ count: count() }).from(eventsTable).where(eq(eventsTable.status, "active")),
    db.select({ count: count() }).from(prizeDistributionsTable).where(and(gte(prizeDistributionsTable.distributedAt, today.start), lte(prizeDistributionsTable.distributedAt, today.end))),
    db.select({ count: count() }).from(prizeDistributionsTable).where(and(gte(prizeDistributionsTable.distributedAt, yesterday.start), lte(prizeDistributionsTable.distributedAt, yesterday.end))),
    db.select({ staffName: eventRegistrationsTable.staffName, staffId: eventRegistrationsTable.staffId, jumlah: count() }).from(eventRegistrationsTable).where(and(gte(eventRegistrationsTable.registeredAt, today.start), lte(eventRegistrationsTable.registeredAt, today.end), ne(eventRegistrationsTable.registrationType, "attendance"))).groupBy(eventRegistrationsTable.staffId, eventRegistrationsTable.staffName).orderBy(desc(count())).limit(3),
    db.select({ staffId: eventRegistrationsTable.staffId, jumlah: count() }).from(eventRegistrationsTable).where(and(gte(eventRegistrationsTable.registeredAt, yesterday.start), lte(eventRegistrationsTable.registeredAt, yesterday.end), ne(eventRegistrationsTable.registrationType, "attendance"))).groupBy(eventRegistrationsTable.staffId).orderBy(desc(count())),
    fetchChartBuffers(),
  ]);

  const yesterdayMap = new Map(topStaffYesterday.map(s => [s.staffId, s.jumlah]));
  const medals = ["🥇", "🥈", "🥉"];
  const topStaffLines = topStaff.length > 0
    ? topStaff.map((s, i) => {
        const kem = yesterdayMap.get(s.staffId) ?? 0;
        const diff = s.jumlah - kem;
        const arrow = diff > 0 ? `(+${diff})` : diff < 0 ? `(${diff})` : "";
        return `${medals[i]} <b>${h(s.staffName ?? "—")}</b> — ${s.jumlah} pendaftaran ${arrow}`.trim();
      }).join("\n")
    : "Belum ada pendaftaran hari ini.";

  const rT = regToday.count, rY = regYesterday.count;
  const pzT = prizeToday.count, pzY = prizeYesterday.count;

  const text =
    `📊 <b>LAPORAN HARIAN KTP</b>\n` +
    `📅 ${h(formatTanggalWIB())}\n` +
    `━━━━━━━━━━━━━━━━━━\n\n` +
    `🗓 <b>Event Aktif:</b> ${totalEventAktif.count} (berlangsung hari ini: ${eventHariIni.count})\n\n` +
    `👤 <b>Total Peserta Unik:</b> ${totalPeserta.count.toLocaleString("id-ID")}\n\n` +
    `📝 <b>Pendaftaran Hari Ini:</b> ${rT}\n` +
    `   vs kemarin (${rY}): ${delta(rT, rY)}\n\n` +
    `🎁 <b>Hadiah Dibagikan Hari Ini:</b> ${pzT}\n` +
    `   vs kemarin (${pzY}): ${delta(pzT, pzY)}\n\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `🏆 <b>TOP 3 PETUGAS HARI INI</b>\n` +
    topStaffLines;

  return { text, charts };
}

async function sendReport(chatId: string | number) {
  const { text, charts } = await buildReport();

  // Send text report
  await bot.api.sendMessage(chatId, text, { parse_mode: "HTML" });

  // Send charts as album (2 images)
  await bot.api.sendMediaGroup(chatId, [
    {
      type: "photo",
      media: new InputFile(charts.bar, "pendaftaran-7hari.png"),
      caption: "📈 Pendaftaran 7 Hari Terakhir",
    },
    {
      type: "photo",
      media: new InputFile(charts.donut, "distribusi-kelamin.png"),
      caption: "👥 Distribusi Jenis Kelamin Peserta",
    },
  ]);
}

// ─── Commands ─────────────────────────────────────────────────────────────────

bot.command("start", async (ctx) => {
  await ctx.reply(
    "Bot Laporan Harian KTP aktif.\n\n" +
    "Perintah:\n" +
    "/idgrup - Tampilkan ID chat ini\n" +
    "/laporansekarang - Kirim laporan + chart sekarang\n\n" +
    "Laporan otomatis dikirim setiap hari pukul 09.00 WIB."
  );
});

bot.command("idgrup", async (ctx) => {
  const chat = ctx.chat;
  const chatTitle = "title" in chat ? chat.title : "—";
  await ctx.reply(
    `Info Chat:\nID: <code>${chat.id}</code>\nTipe: ${chat.type}\nNama: ${h(chatTitle)}`,
    { parse_mode: "HTML" }
  );
});

bot.command("laporansekarang", async (ctx) => {
  const statusMsg = await ctx.reply("Menyiapkan laporan dan chart...");
  try {
    await sendReport(ctx.chat.id);
    await ctx.api.deleteMessage(ctx.chat.id, statusMsg.message_id);
  } catch (err) {
    console.error("Report error:", err);
    await ctx.api.editMessageText(ctx.chat.id, statusMsg.message_id, "Gagal membuat laporan. Cek log untuk detail.");
  }
});

// ─── Catch-all for group messages (for getting chat ID) ───────────────────────

bot.on("message", async (ctx) => {
  const chat = ctx.chat;
  const text = ctx.message.text ?? "";
  console.log(`[MSG] chat_id=${chat.id} type=${chat.type} title=${"title" in chat ? chat.title : "—"} text="${text.slice(0, 80)}"`);
  if (/idgrup|id grup|chatid|chat id/i.test(text)) {
    const chatTitle = "title" in chat ? chat.title : "—";
    await ctx.reply(
      `Info Chat:\nID: <code>${chat.id}</code>\nTipe: ${chat.type}\nNama: ${h(chatTitle)}`,
      { parse_mode: "HTML" }
    );
  }
});

// ─── Scheduled 09:00 WIB (02:00 UTC) ─────────────────────────────────────────

cron.schedule("0 2 * * *", async () => {
  const chatId = process.env.REPORT_CHAT_ID;
  if (!chatId) { console.warn("REPORT_CHAT_ID not set — skipping."); return; }
  console.log(`[${new Date().toISOString()}] Sending daily report to ${chatId}...`);
  try {
    await sendReport(chatId);
    console.log("Daily report sent.");
  } catch (err) {
    console.error("Failed to send daily report:", err);
  }
}, { timezone: "UTC" });

// ─── Error + start ────────────────────────────────────────────────────────────

bot.catch((err) => console.error("Bot error:", err.error));

console.log("Starting Report Bot...");
const chatId = process.env.REPORT_CHAT_ID;
if (chatId) {
  console.log(`Target group: ${chatId}`);
} else {
  console.warn("REPORT_CHAT_ID not set.");
}

bot.start({ allowed_updates: ["message", "callback_query"] })
  .then(() => console.log("Bot stopped"))
  .catch((err) => { console.error("Bot fatal error:", err); process.exit(1); });
