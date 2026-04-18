import { Bot } from "grammy";
import { db } from "@workspace/db";
import { eventsTable, participantsTable, eventRegistrationsTable, prizeDistributionsTable, usersTable } from "@workspace/db";
import { eq, and, ne, gte, lt, lte, sql, asc, desc, count } from "drizzle-orm";
import cron from "node-cron";

const BOT_TOKEN = process.env.TELEGRAM_REPORT_BOT_TOKEN;
if (!BOT_TOKEN) { console.error("TELEGRAM_REPORT_BOT_TOKEN is not set"); process.exit(1); }

const bot = new Bot(BOT_TOKEN);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function h(text: string | null | undefined): string {
  if (!text) return "—";
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** WIB = UTC+7. Returns start-of-day and end-of-day UTC Date for a WIB date offset. */
function wibDayRange(daysOffset: number = 0): { start: Date; end: Date; dateStr: string } {
  // Current time in WIB
  const nowUtc = Date.now();
  const wibOffset = 7 * 60 * 60 * 1000;
  const nowWib = new Date(nowUtc + wibOffset);

  // Apply offset
  nowWib.setUTCDate(nowWib.getUTCDate() + daysOffset);

  // Start of day in WIB (00:00:00 WIB = 17:00:00 UTC previous day)
  const startWib = new Date(Date.UTC(nowWib.getUTCFullYear(), nowWib.getUTCMonth(), nowWib.getUTCDate(), 0, 0, 0));
  const endWib   = new Date(Date.UTC(nowWib.getUTCFullYear(), nowWib.getUTCMonth(), nowWib.getUTCDate(), 23, 59, 59, 999));

  // Convert back to UTC
  const startUtc = new Date(startWib.getTime() - wibOffset);
  const endUtc   = new Date(endWib.getTime() - wibOffset);

  // YYYY-MM-DD string in WIB
  const y = nowWib.getUTCFullYear();
  const m = String(nowWib.getUTCMonth() + 1).padStart(2, "0");
  const d = String(nowWib.getUTCDate()).padStart(2, "0");
  const dateStr = `${y}-${m}-${d}`;

  return { start: startUtc, end: endUtc, dateStr };
}

const HARI = ["Minggu","Senin","Selasa","Rabu","Kamis","Jumat","Sabtu"];
const BULAN = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];

function formatTanggalWIB(daysOffset: number = 0): string {
  const wibOffset = 7 * 60 * 60 * 1000;
  const nowWib = new Date(Date.now() + wibOffset);
  nowWib.setUTCDate(nowWib.getUTCDate() + daysOffset);
  const hari  = HARI[nowWib.getUTCDay()];
  const tgl   = nowWib.getUTCDate();
  const bln   = BULAN[nowWib.getUTCMonth()];
  const thn   = nowWib.getUTCFullYear();
  return `${hari}, ${tgl} ${bln} ${thn}`;
}

function delta(today: number, yesterday: number): string {
  const diff = today - yesterday;
  if (diff > 0) return `<b>+${diff}</b> ↑`;
  if (diff < 0) return `<b>${diff}</b> ↓`;
  return `<b>0</b> →`;
}

// ─── Queries ──────────────────────────────────────────────────────────────────

async function buildReport(): Promise<string> {
  const today     = wibDayRange(0);
  const yesterday = wibDayRange(-1);

  // Registrations today (exclude attendance)
  const [regToday] = await db
    .select({ count: count() })
    .from(eventRegistrationsTable)
    .where(and(
      gte(eventRegistrationsTable.registeredAt, today.start),
      lte(eventRegistrationsTable.registeredAt, today.end),
      ne(eventRegistrationsTable.registrationType, "attendance"),
    ));

  // Registrations yesterday
  const [regYesterday] = await db
    .select({ count: count() })
    .from(eventRegistrationsTable)
    .where(and(
      gte(eventRegistrationsTable.registeredAt, yesterday.start),
      lte(eventRegistrationsTable.registeredAt, yesterday.end),
      ne(eventRegistrationsTable.registrationType, "attendance"),
    ));

  // Total unique participants
  const [totalPeserta] = await db
    .select({ count: count() })
    .from(participantsTable);

  // Active events today (by eventDate string = today dateStr)
  const [eventHariIni] = await db
    .select({ count: count() })
    .from(eventsTable)
    .where(and(eq(eventsTable.status, "active"), eq(eventsTable.eventDate, today.dateStr)));

  // All active events (not just today)
  const [totalEventAktif] = await db
    .select({ count: count() })
    .from(eventsTable)
    .where(eq(eventsTable.status, "active"));

  // Prizes distributed today
  const [prizeToday] = await db
    .select({ count: count() })
    .from(prizeDistributionsTable)
    .where(and(
      gte(prizeDistributionsTable.distributedAt, today.start),
      lte(prizeDistributionsTable.distributedAt, today.end),
    ));

  // Prizes distributed yesterday
  const [prizeYesterday] = await db
    .select({ count: count() })
    .from(prizeDistributionsTable)
    .where(and(
      gte(prizeDistributionsTable.distributedAt, yesterday.start),
      lte(prizeDistributionsTable.distributedAt, yesterday.end),
    ));

  // Top 3 staff today
  const topStaff = await db
    .select({
      staffName: eventRegistrationsTable.staffName,
      staffId: eventRegistrationsTable.staffId,
      jumlah: count(),
    })
    .from(eventRegistrationsTable)
    .where(and(
      gte(eventRegistrationsTable.registeredAt, today.start),
      lte(eventRegistrationsTable.registeredAt, today.end),
      ne(eventRegistrationsTable.registrationType, "attendance"),
    ))
    .groupBy(eventRegistrationsTable.staffId, eventRegistrationsTable.staffName)
    .orderBy(desc(count()))
    .limit(3);

  // Top 3 staff yesterday (for comparison)
  const topStaffYesterday = await db
    .select({
      staffId: eventRegistrationsTable.staffId,
      jumlah: count(),
    })
    .from(eventRegistrationsTable)
    .where(and(
      gte(eventRegistrationsTable.registeredAt, yesterday.start),
      lte(eventRegistrationsTable.registeredAt, yesterday.end),
      ne(eventRegistrationsTable.registrationType, "attendance"),
    ))
    .groupBy(eventRegistrationsTable.staffId)
    .orderBy(desc(count()));

  const yesterdayMap = new Map(topStaffYesterday.map(s => [s.staffId, s.jumlah]));

  const medals = ["🥇", "🥈", "🥉"];

  const topStaffLines = topStaff.length > 0
    ? topStaff.map((s, i) => {
        const kem = yesterdayMap.get(s.staffId) ?? 0;
        const diff = s.jumlah - kem;
        const arrow = diff > 0 ? `(+${diff})` : diff < 0 ? `(${diff})` : "";
        return `${medals[i]} <b>${h(s.staffName ?? "—")}</b> — ${s.jumlah} pendaftaran ${arrow}`;
      }).join("\n")
    : "Belum ada pendaftaran hari ini.";

  const tanggal = formatTanggalWIB(0);
  const rT  = regToday.count;
  const rY  = regYesterday.count;
  const pzT = prizeToday.count;
  const pzY = prizeYesterday.count;

  return (
    `📊 <b>LAPORAN HARIAN KTP</b>\n` +
    `📅 ${h(tanggal)}\n` +
    `━━━━━━━━━━━━━━━━━━\n\n` +
    `🗓 <b>Event Aktif:</b> ${totalEventAktif.count} (berlangsung hari ini: ${eventHariIni.count})\n\n` +
    `👤 <b>Total Peserta Unik:</b> ${totalPeserta.count.toLocaleString("id-ID")}\n\n` +
    `📝 <b>Pendaftaran Hari Ini:</b> ${rT}\n` +
    `   vs kemarin (${rY}): ${delta(rT, rY)}\n\n` +
    `🎁 <b>Hadiah Dibagikan Hari Ini:</b> ${pzT}\n` +
    `   vs kemarin (${pzY}): ${delta(pzT, pzY)}\n\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `🏆 <b>TOP 3 PETUGAS HARI INI</b>\n` +
    topStaffLines + `\n\n` +
    `<i>Laporan otomatis dikirim setiap hari pukul 09.00 WIB</i>`
  );
}

// ─── Commands ─────────────────────────────────────────────────────────────────

bot.command("start", async (ctx) => {
  await ctx.reply(
    "Bot Laporan Harian KTP aktif.\n\n" +
    "Perintah:\n" +
    "/idgrup - Tampilkan ID grup ini\n" +
    "/laporansekarang - Kirim laporan sekarang (untuk uji coba)\n\n" +
    "Laporan otomatis dikirim setiap hari pukul 09.00 WIB."
  );
});

bot.command("idgrup", async (ctx) => {
  const chatId = ctx.chat.id;
  const chatType = ctx.chat.type;
  const chatTitle = "title" in ctx.chat ? ctx.chat.title : "—";
  await ctx.reply(
    `Info Chat:\n` +
    `ID: <code>${chatId}</code>\n` +
    `Tipe: ${chatType}\n` +
    `Nama: ${h(chatTitle)}\n\n` +
    `Salin ID di atas dan set sebagai <b>REPORT_CHAT_ID</b> di environment variables.`,
    { parse_mode: "HTML" }
  );
});

bot.command("laporansekarang", async (ctx) => {
  const chatId = process.env.REPORT_CHAT_ID;
  // Allow from configured group or from any admin chat (for testing)
  const statusMsg = await ctx.reply("Menyiapkan laporan...");
  try {
    const report = await buildReport();
    await ctx.api.deleteMessage(ctx.chat.id, statusMsg.message_id);
    await ctx.reply(report, { parse_mode: "HTML" });
  } catch (err) {
    console.error("Report error:", err);
    await ctx.api.editMessageText(ctx.chat.id, statusMsg.message_id, "Gagal membuat laporan. Cek log untuk detail.");
  }
});

// ─── Scheduled report ─────────────────────────────────────────────────────────

// 09:00 WIB = 02:00 UTC
// Cron: "0 2 * * *"
cron.schedule("0 2 * * *", async () => {
  const chatId = process.env.REPORT_CHAT_ID;
  if (!chatId) {
    console.warn("REPORT_CHAT_ID not set — skipping scheduled report.");
    return;
  }
  console.log(`[${new Date().toISOString()}] Sending daily report to chat ${chatId}...`);
  try {
    const report = await buildReport();
    await bot.api.sendMessage(chatId, report, { parse_mode: "HTML" });
    console.log("Daily report sent.");
  } catch (err) {
    console.error("Failed to send daily report:", err);
  }
}, {
  timezone: "UTC",
});

// ─── Error + start ────────────────────────────────────────────────────────────

// Log semua pesan masuk untuk debug & tangkap chat ID
bot.on("message", async (ctx) => {
  const chat = ctx.chat;
  const text = ctx.message.text ?? "";
  console.log(`[MSG] chat_id=${chat.id} type=${chat.type} title=${"title" in chat ? chat.title : "—"} text="${text}"`);
  // Jika pesan mengandung "idgrup" atau "id grup" (case-insensitive), balas dengan chat ID
  if (/idgrup|id grup|chatid|chat id/i.test(text)) {
    const chatTitle = "title" in chat ? chat.title : "—";
    await ctx.reply(
      `Info Chat:\nID: <code>${chat.id}</code>\nTipe: ${chat.type}\nNama: ${h(chatTitle)}\n\nSalin ID di atas dan set sebagai <b>REPORT_CHAT_ID</b>.`,
      { parse_mode: "HTML" }
    );
  }
});

bot.catch((err) => console.error("Bot error:", err.error));

console.log("Starting Report Bot...");
console.log(`Scheduled daily report at 09:00 WIB (02:00 UTC).`);
const chatId = process.env.REPORT_CHAT_ID;
if (chatId) {
  console.log(`Target group: ${chatId}`);
} else {
  console.warn("REPORT_CHAT_ID not set. Laporan otomatis tidak akan terkirim sampai variabel ini diset.");
  console.warn("Jalankan /idgrup di grup Telegram lalu set REPORT_CHAT_ID.");
}

bot.start({ allowed_updates: ["message", "callback_query"] })
  .then(() => console.log("Bot stopped"))
  .catch((err) => { console.error("Bot fatal error:", err); process.exit(1); });
