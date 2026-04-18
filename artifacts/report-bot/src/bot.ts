import { Bot, InputFile } from "grammy";
import { db } from "@workspace/db";
import { eventsTable, participantsTable, eventRegistrationsTable, prizeDistributionsTable } from "@workspace/db";
import { eq, and, ne, gte, lte, count, desc, sql } from "drizzle-orm";
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

const HARI        = ["Minggu","Senin","Selasa","Rabu","Kamis","Jumat","Sabtu"];
const BULAN       = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];
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

function cleanCityName(raw: string): string {
  return raw.replace(/^(Kabupaten|Kab\.|Kota)\s+/i, "").trim();
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface DayData    { label: string; value: number }
interface RegionData { city: string; cnt: number }
interface RegionCompare { city: string; today: number; yesterday: number }

// ─── Query helpers ────────────────────────────────────────────────────────────

const cityExpr      = sql<string>`INITCAP(LOWER(COALESCE(${participantsTable.city}, 'Tidak Diketahui')))`;
const cityGroupExpr = sql`INITCAP(LOWER(COALESCE(${participantsTable.city}, 'Tidak Diketahui')))`;

async function fetchRegionsByRange(range: { start: Date; end: Date }): Promise<Map<string, number>> {
  const rows = await db
    .select({ city: cityExpr, cnt: count() })
    .from(eventRegistrationsTable)
    .innerJoin(participantsTable, eq(eventRegistrationsTable.participantId, participantsTable.id))
    .where(and(
      gte(eventRegistrationsTable.registeredAt, range.start),
      lte(eventRegistrationsTable.registeredAt, range.end),
      ne(eventRegistrationsTable.registrationType, "attendance"),
    ))
    .groupBy(cityGroupExpr)
    .orderBy(desc(count()))
    .limit(30);
  return new Map(rows.map(r => [r.city ?? "Tidak Diketahui", r.cnt]));
}

async function fetchTotalRegions(): Promise<RegionData[]> {
  const rows = await db
    .select({ city: cityExpr, cnt: count() })
    .from(participantsTable)
    .groupBy(cityGroupExpr)
    .orderBy(desc(count()))
    .limit(12);
  return rows.map(r => ({ city: r.city ?? "Tidak Diketahui", cnt: r.cnt }));
}

async function fetchLast7Days(): Promise<DayData[]> {
  const wibOffset = 7 * 60 * 60 * 1000;
  const result: DayData[] = [];
  for (let i = 6; i >= 0; i--) {
    const { start, end } = wibDayRange(-i);
    const nowWib = new Date(Date.now() + wibOffset - i * 86400000);
    const label = `${nowWib.getUTCDate()} ${BULAN[nowWib.getUTCMonth()]}`;
    const [row] = await db.select({ count: count() }).from(eventRegistrationsTable)
      .where(and(gte(eventRegistrationsTable.registeredAt, start), lte(eventRegistrationsTable.registeredAt, end), ne(eventRegistrationsTable.registrationType, "attendance")));
    result.push({ label, value: row.count });
  }
  return result;
}

// ─── Chart builders ───────────────────────────────────────────────────────────

function buildTrendChartUrl(days: DayData[]): string {
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
        backgroundColor: "rgba(79,70,229,0.85)",
        borderColor: "rgba(79,70,229,1)",
        borderWidth: 1,
        borderRadius: 6,
      }],
    },
    options: {
      plugins: {
        title: { display: true, text: "Pendaftaran 7 Hari Terakhir", font: { size: 16, weight: "bold" }, color: "#1e1b4b", padding: { bottom: 16 } },
        legend: { display: false },
      },
      scales: {
        y: { beginAtZero: true, suggestedMax: Math.ceil(maxVal * 1.2), ticks: { color: "#374151", stepSize: Math.max(1, Math.ceil(maxVal / 5)) }, grid: { color: "rgba(0,0,0,0.06)" } },
        x: { ticks: { color: "#374151" }, grid: { display: false } },
      },
    },
  };
  return `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(config))}&width=800&height=380&backgroundColor=white&devicePixelRatio=2`;
}

/** Grouped horizontal bar: hari ini vs kemarin per kota — top 10 by (today + yesterday) */
function buildRegionCompareChartUrl(regions: RegionCompare[]): string {
  // Sort by today+yesterday combined, take top 10
  const top = [...regions]
    .sort((a, b) => (b.today + b.yesterday) - (a.today + a.yesterday))
    .slice(0, 10)
    .reverse(); // reverse so highest is at top in horizontal bar

  const labels    = top.map(r => cleanCityName(r.city));
  const todayData = top.map(r => r.today);
  const yestData  = top.map(r => r.yesterday);

  const config = {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Hari Ini",
          data: todayData,
          backgroundColor: "rgba(79,70,229,0.85)",
          borderColor: "rgba(79,70,229,1)",
          borderWidth: 1,
          borderRadius: 4,
        },
        {
          label: "Kemarin",
          data: yestData,
          backgroundColor: "rgba(156,163,175,0.7)",
          borderColor: "rgba(107,114,128,0.8)",
          borderWidth: 1,
          borderRadius: 4,
        },
      ],
    },
    options: {
      indexAxis: "y",
      plugins: {
        title: {
          display: true,
          text: "Pendaftaran Per Daerah: Hari Ini vs Kemarin",
          font: { size: 15, weight: "bold" },
          color: "#1e1b4b",
          padding: { bottom: 14 },
        },
        legend: { position: "top", labels: { color: "#374151", padding: 16 } },
      },
      scales: {
        x: { beginAtZero: true, ticks: { color: "#374151", stepSize: 1 }, grid: { color: "rgba(0,0,0,0.06)" } },
        y: { ticks: { color: "#374151", font: { size: 12 } }, grid: { display: false } },
      },
    },
  };
  return `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(config))}&width=800&height=520&backgroundColor=white&devicePixelRatio=2`;
}

/** Single horizontal bar — overall total peserta per daerah */
function buildTotalRegionChartUrl(regions: RegionData[]): string {
  const top    = regions.slice(0, 10).reverse();
  const labels = top.map(r => cleanCityName(r.city));
  const data   = top.map(r => r.cnt);
  const maxVal = Math.max(...data, 1);
  const colors = data.map(v => {
    const a = (0.55 + 0.45 * (v / maxVal)).toFixed(2);
    return `rgba(79,70,229,${a})`;
  });
  const config = {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Total Peserta",
        data,
        backgroundColor: colors,
        borderColor: colors.map(c => c.replace(/[\d.]+\)$/, "1)")),
        borderWidth: 1,
        borderRadius: 4,
      }],
    },
    options: {
      indexAxis: "y",
      plugins: {
        title: { display: true, text: "Top 10 Daerah — Total Peserta Keseluruhan", font: { size: 15, weight: "bold" }, color: "#1e1b4b", padding: { bottom: 14 } },
        legend: { display: false },
      },
      scales: {
        x: { beginAtZero: true, ticks: { color: "#374151" }, grid: { color: "rgba(0,0,0,0.06)" } },
        y: { ticks: { color: "#374151", font: { size: 12 } }, grid: { display: false } },
      },
    },
  };
  return `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(config))}&width=800&height=480&backgroundColor=white&devicePixelRatio=2`;
}

async function downloadImage(url: string): Promise<Buffer> {
  const resp = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!resp.ok) throw new Error(`QuickChart error: ${resp.status}`);
  return Buffer.from(await resp.arrayBuffer());
}

// ─── Build full report ─────────────────────────────────────────────────────────

async function buildReport(): Promise<{ text: string; regionText: string; charts: { trend: Buffer; compare: Buffer; total: Buffer } }> {
  const today     = wibDayRange(0);
  const yesterday = wibDayRange(-1);

  const [
    [regToday], [regYesterday], [totalPeserta],
    [eventHariIni], [totalEventAktif],
    [prizeToday], [prizeYesterday],
    topStaff, topStaffYesterday,
    todayRegionMap, yesterdayRegionMap,
    totalRegions, last7Days,
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
    fetchRegionsByRange(today),
    fetchRegionsByRange(yesterday),
    fetchTotalRegions(),
    fetchLast7Days(),
  ]);

  // Merge today + yesterday regions into unified list sorted by today desc
  const allCities = new Set([...todayRegionMap.keys(), ...yesterdayRegionMap.keys()]);
  const regionCompare: RegionCompare[] = Array.from(allCities).map(city => ({
    city,
    today:     todayRegionMap.get(city)     ?? 0,
    yesterday: yesterdayRegionMap.get(city) ?? 0,
  })).sort((a, b) => b.today - a.today || b.yesterday - a.yesterday);

  // Charts
  const trendUrl   = buildTrendChartUrl(last7Days);
  const compareUrl = buildRegionCompareChartUrl(regionCompare);
  const totalUrl   = buildTotalRegionChartUrl(totalRegions);
  const [trendBuf, compareBuf, totalBuf] = await Promise.all([
    downloadImage(trendUrl),
    downloadImage(compareUrl),
    downloadImage(totalUrl),
  ]);

  // Top staff text
  const yesterdayMap = new Map(topStaffYesterday.map(s => [s.staffId, s.jumlah]));
  const medals = ["🥇","🥈","🥉"];
  const topStaffLines = topStaff.length > 0
    ? topStaff.map((s, i) => {
        const kem  = yesterdayMap.get(s.staffId) ?? 0;
        const diff = s.jumlah - kem;
        const arrow = diff > 0 ? ` (+${diff})` : diff < 0 ? ` (${diff})` : "";
        return `${medals[i]} <b>${h(s.staffName ?? "—")}</b> — ${s.jumlah} pendaftaran${arrow}`;
      }).join("\n")
    : "Belum ada pendaftaran hari ini.";

  const rT = regToday.count, rY = regYesterday.count;
  const pzT = prizeToday.count, pzY = prizeYesterday.count;

  // ── Pesan 1: Ringkasan harian ──
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

  // ── Pesan 3: Detail per daerah ──
  const maxTod = Math.max(...regionCompare.map(r => r.today), 1);
  const maxTot = Math.max(...totalRegions.map(r => r.cnt), 1);

  // Today vs yesterday per city (show all cities that have activity either day)
  const compareLines = regionCompare.slice(0, 15).map((r, i) => {
    const name  = cleanCityName(r.city);
    const diff  = r.today - r.yesterday;
    const arrow = diff > 0 ? `↑ +${diff}` : diff < 0 ? `↓ ${diff}` : `→`;
    const bar   = r.today > 0 ? "█".repeat(Math.min(Math.ceil(r.today / maxTod * 10), 10)) : "░".repeat(3);
    return (
      `${String(i + 1).padStart(2)}. <b>${h(name)}</b>\n` +
      `    Hari ini: <b>${r.today}</b> | Kemarin: ${r.yesterday} | <b>${arrow}</b>\n` +
      `    ${bar}`
    );
  });

  // All-time total per city
  const totalLines = totalRegions.slice(0, 10).map((r, i) => {
    const name = cleanCityName(r.city);
    const bar  = "█".repeat(Math.min(Math.ceil(r.cnt / maxTot * 10), 10));
    return `${String(i + 1).padStart(2)}. <b>${h(name)}</b>  ${bar}  <b>${r.cnt.toLocaleString("id-ID")}</b> peserta`;
  });

  const regionText =
    `🗺 <b>LAPORAN PER DAERAH (KABUPATEN/KOTA)</b>\n` +
    `━━━━━━━━━━━━━━━━━━\n\n` +
    `📅 <b>Hari Ini vs Kemarin</b>\n` +
    (regionCompare.length === 0
      ? `Belum ada data.\n`
      : compareLines.join("\n\n") + "\n") +
    `\n━━━━━━━━━━━━━━━━━━\n` +
    `📍 <b>Total Peserta Keseluruhan</b>\n` +
    totalLines.join("\n") +
    `\n\n<i>Laporan otomatis dikirim setiap hari pukul 09.00 WIB</i>`;

  return { text, regionText, charts: { trend: trendBuf, compare: compareBuf, total: totalBuf } };
}

async function sendReport(chatId: string | number) {
  const { text, regionText, charts } = await buildReport();

  // 1. Ringkasan harian
  await bot.api.sendMessage(chatId, text, { parse_mode: "HTML" });

  // 2. Chart album: tren 7 hari + compare per daerah + total per daerah (max 10 per album)
  await bot.api.sendMediaGroup(chatId, [
    {
      type: "photo",
      media: new InputFile(charts.trend, "trend-7hari.png"),
      caption: "📈 <b>Tren Pendaftaran 7 Hari Terakhir</b>",
      parse_mode: "HTML",
    },
    {
      type: "photo",
      media: new InputFile(charts.compare, "compare-daerah.png"),
      caption: "📊 <b>Pendaftaran Per Daerah — Hari Ini vs Kemarin</b>",
      parse_mode: "HTML",
    },
    {
      type: "photo",
      media: new InputFile(charts.total, "total-daerah.png"),
      caption: "🗺 <b>Top 10 Daerah — Total Peserta Keseluruhan</b>",
      parse_mode: "HTML",
    },
  ]);

  // 3. Detail teks per daerah
  await bot.api.sendMessage(chatId, regionText, { parse_mode: "HTML" });
}

// ─── Commands ─────────────────────────────────────────────────────────────────

bot.command("start", async (ctx) => {
  await ctx.reply(
    "Bot Laporan Harian KTP aktif.\n\n" +
    "Perintah:\n" +
    "/idgrup - Tampilkan ID chat ini\n" +
    "/laporansekarang - Kirim laporan lengkap sekarang\n\n" +
    "Laporan otomatis dikirim setiap hari pukul 09.00 WIB.",
  );
});

bot.command("idgrup", async (ctx) => {
  const chat = ctx.chat;
  const chatTitle = "title" in chat ? chat.title : "—";
  await ctx.reply(
    `Info Chat:\nID: <code>${chat.id}</code>\nTipe: ${chat.type}\nNama: ${h(chatTitle)}`,
    { parse_mode: "HTML" },
  );
});

bot.command("laporansekarang", async (ctx) => {
  const statusMsg = await ctx.reply("Menyiapkan laporan, chart, dan data daerah...");
  try {
    await sendReport(ctx.chat.id);
    await ctx.api.deleteMessage(ctx.chat.id, statusMsg.message_id);
  } catch (err) {
    console.error("Report error:", err);
    await ctx.api.editMessageText(ctx.chat.id, statusMsg.message_id, "Gagal membuat laporan. Cek log untuk detail.");
  }
});

bot.on("message", async (ctx) => {
  const chat = ctx.chat;
  const text = ctx.message.text ?? "";
  console.log(`[MSG] chat_id=${chat.id} type=${chat.type} title=${"title" in chat ? chat.title : "—"} text="${text.slice(0, 80)}"`);
  if (/idgrup|id grup|chatid|chat id/i.test(text)) {
    const chatTitle = "title" in chat ? chat.title : "—";
    await ctx.reply(
      `Info Chat:\nID: <code>${chat.id}</code>\nTipe: ${chat.type}\nNama: ${h(chatTitle)}`,
      { parse_mode: "HTML" },
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
const reportChatId = process.env.REPORT_CHAT_ID;
if (reportChatId) console.log(`Target group: ${reportChatId}`);
else console.warn("REPORT_CHAT_ID not set.");

bot.start({ allowed_updates: ["message", "callback_query"] })
  .then(() => console.log("Bot stopped"))
  .catch((err) => { console.error("Bot fatal error:", err); process.exit(1); });
