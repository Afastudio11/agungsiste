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

// ─── Regional normalization ────────────────────────────────────────────────────
// Strip "KABUPATEN"/"KOTA" prefix for display, INITCAP for consistency

const cityExpr = sql<string>`INITCAP(LOWER(COALESCE(${participantsTable.city}, 'Tidak Diketahui')))`;
const cityGroupExpr = sql`INITCAP(LOWER(COALESCE(${participantsTable.city}, 'Tidak Diketahui')))`;

function cleanCityName(raw: string): string {
  return raw
    .replace(/^(Kabupaten|Kab\.|Kota)\s+/i, "")
    .trim();
}

// ─── Chart via QuickChart.io ───────────────────────────────────────────────────

interface DayData { label: string; value: number }
interface RegionData { city: string; cnt: number }

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

async function fetchTodayRegions(today: { start: Date; end: Date }): Promise<RegionData[]> {
  const rows = await db
    .select({ city: cityExpr, cnt: count() })
    .from(eventRegistrationsTable)
    .innerJoin(participantsTable, eq(eventRegistrationsTable.participantId, participantsTable.id))
    .where(and(
      gte(eventRegistrationsTable.registeredAt, today.start),
      lte(eventRegistrationsTable.registeredAt, today.end),
      ne(eventRegistrationsTable.registrationType, "attendance"),
    ))
    .groupBy(cityGroupExpr)
    .orderBy(desc(count()))
    .limit(20);
  return rows.map(r => ({ city: r.city ?? "Tidak Diketahui", cnt: r.cnt }));
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

function buildBarChartUrl(days: DayData[]): string {
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

function buildRegionChartUrl(regions: RegionData[], title: string): string {
  // Show top 10 for horizontal bar
  const top = regions.slice(0, 10);
  const labels = top.map(r => cleanCityName(r.city));
  const data   = top.map(r => r.cnt);
  const maxVal = Math.max(...data, 1);

  // Color gradient: darker = higher count
  const colors = data.map((v, i) => {
    const alpha = 0.55 + 0.45 * (v / maxVal);
    return `rgba(79,70,229,${alpha.toFixed(2)})`;
  });

  const config = {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Peserta",
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
        title: { display: true, text: title, font: { size: 16, weight: "bold" }, color: "#1e1b4b", padding: { bottom: 16 } },
        legend: { display: false },
        datalabels: {
          anchor: "end",
          align: "right",
          color: "#374151",
          font: { weight: "bold", size: 12 },
          formatter: (v: number) => v.toLocaleString("id-ID"),
        },
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

async function buildReport(): Promise<{ text: string; regionText: string; charts: { trend: Buffer; region: Buffer } }> {
  const today     = wibDayRange(0);
  const yesterday = wibDayRange(-1);

  const [
    [regToday], [regYesterday], [totalPeserta],
    [eventHariIni], [totalEventAktif],
    [prizeToday], [prizeYesterday],
    topStaff, topStaffYesterday,
    todayRegions, totalRegions,
    last7Days,
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
    fetchTodayRegions(today),
    fetchTotalRegions(),
    fetchLast7Days(),
  ]);

  // Charts
  const trendUrl  = buildBarChartUrl(last7Days);
  const regionUrl = buildRegionChartUrl(totalRegions, "Top 10 Daerah — Total Peserta");
  const [trendBuf, regionBuf] = await Promise.all([downloadImage(trendUrl), downloadImage(regionUrl)]);

  // Top staff
  const yesterdayMap = new Map(topStaffYesterday.map(s => [s.staffId, s.jumlah]));
  const medals = ["🥇","🥈","🥉"];
  const topStaffLines = topStaff.length > 0
    ? topStaff.map((s, i) => {
        const kem = yesterdayMap.get(s.staffId) ?? 0;
        const diff = s.jumlah - kem;
        const arrow = diff > 0 ? ` (+${diff})` : diff < 0 ? ` (${diff})` : "";
        return `${medals[i]} <b>${h(s.staffName ?? "—")}</b> — ${s.jumlah} pendaftaran${arrow}`;
      }).join("\n")
    : "Belum ada pendaftaran hari ini.";

  const rT = regToday.count, rY = regYesterday.count;
  const pzT = prizeToday.count, pzY = prizeYesterday.count;

  // Main report text
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

  // Regional breakdown message (separate message)
  let regionText = `🗺 <b>PENDAFTARAN HARI INI PER DAERAH</b>\n━━━━━━━━━━━━━━━━━━\n\n`;

  if (todayRegions.length === 0) {
    regionText += `Belum ada pendaftaran masuk hari ini.\n\n`;
  } else {
    const regionLines = todayRegions.map((r, i) => {
      const name = cleanCityName(r.city);
      const bar = "█".repeat(Math.min(Math.ceil(r.cnt / Math.max(...todayRegions.map(x => x.cnt)) * 12), 12));
      return `${String(i + 1).padStart(2)}. <b>${h(name)}</b>\n    ${bar} ${r.cnt} pendaftaran`;
    });
    regionText += regionLines.join("\n") + "\n\n";
  }

  // Add running total per region (top 10 overall, always shown)
  regionText += `📍 <b>TOTAL PESERTA PER DAERAH (KESELURUHAN)</b>\n`;
  const totalLines = totalRegions.slice(0, 10).map((r, i) => {
    const name = cleanCityName(r.city);
    const bar = "█".repeat(Math.min(Math.ceil(r.cnt / Math.max(...totalRegions.map(x => x.cnt)) * 10), 10));
    return `${String(i + 1).padStart(2)}. <b>${h(name)}</b>\n    ${bar} ${r.cnt.toLocaleString("id-ID")} peserta`;
  });
  regionText += totalLines.join("\n") +
    `\n\n<i>Laporan otomatis dikirim setiap hari pukul 09.00 WIB</i>`;

  return { text, regionText, charts: { trend: trendBuf, region: regionBuf } };
}

async function sendReport(chatId: string | number) {
  const { text, regionText, charts } = await buildReport();

  // 1. Main summary
  await bot.api.sendMessage(chatId, text, { parse_mode: "HTML" });

  // 2. Charts album (trend + region map)
  await bot.api.sendMediaGroup(chatId, [
    {
      type: "photo",
      media: new InputFile(charts.trend, "trend-7hari.png"),
      caption: "📈 <b>Tren Pendaftaran 7 Hari Terakhir</b>",
      parse_mode: "HTML",
    },
    {
      type: "photo",
      media: new InputFile(charts.region, "top-daerah.png"),
      caption: "🗺 <b>Top 10 Daerah — Total Peserta</b>",
      parse_mode: "HTML",
    },
  ]);

  // 3. Regional detail text
  await bot.api.sendMessage(chatId, regionText, { parse_mode: "HTML" });
}

// ─── Commands ─────────────────────────────────────────────────────────────────

bot.command("start", async (ctx) => {
  await ctx.reply(
    "Bot Laporan Harian KTP aktif.\n\n" +
    "Perintah:\n" +
    "/idgrup - Tampilkan ID chat ini\n" +
    "/laporansekarang - Kirim laporan + chart + detail daerah sekarang\n\n" +
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

// ─── Catch-all ────────────────────────────────────────────────────────────────

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
