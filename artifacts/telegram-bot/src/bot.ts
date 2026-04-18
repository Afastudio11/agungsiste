import { Bot, InlineKeyboard, InputFile } from "grammy";
import { db } from "@workspace/db";
import { usersTable, eventsTable, participantsTable, eventRegistrationsTable } from "@workspace/db";
import { eq, and, ne, sql } from "drizzle-orm";
import Groq from "groq-sdk";
import sharp from "sharp";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!BOT_TOKEN) {
  console.error("TELEGRAM_BOT_TOKEN is not set");
  process.exit(1);
}

const groq = process.env.GROQ_API_KEY
  ? new Groq({ apiKey: process.env.GROQ_API_KEY })
  : null;

const bot = new Bot(BOT_TOKEN);

// ─── Session state per chat ────────────────────────────────────────────────────

type BotState =
  | { step: "idle" }
  | { step: "await_photo" }
  | { step: "await_petugas"; imageBase64: string }
  | { step: "await_event"; imageBase64: string; staffId: number; staffName: string }
  | { step: "await_confirm"; imageBase64: string; staffId: number; staffName: string; eventId: number; eventName: string; ktpData: KtpData };

interface KtpData {
  nik: string;
  fullName: string;
  gender: string | null;
  birthPlace: string | null;
  birthDate: string | null;
  address: string | null;
  city: string | null;
  kecamatan: string | null;
  kelurahan: string | null;
  rtRw: string | null;
  occupation: string | null;
  religion: string | null;
  maritalStatus: string | null;
  bloodType: string | null;
  nationality: string | null;
  province: string | null;
}

const sessions = new Map<number, BotState>();

function getState(chatId: number): BotState {
  return sessions.get(chatId) ?? { step: "idle" };
}

function setState(chatId: number, state: BotState) {
  sessions.set(chatId, state);
}

// ─── KTP OCR via Groq ────────────────────────────────────────────────────────

const GROQ_PROMPT = `Kamu adalah OCR untuk KTP Indonesia. Ekstrak data dari foto KTP ini dan kembalikan JSON dengan field berikut (null jika tidak ditemukan):
{
  "nik": "16 digit NIK",
  "fullName": "nama lengkap",
  "birthPlace": "tempat lahir",
  "birthDate": "DD-MM-YYYY",
  "gender": "LAKI-LAKI atau PEREMPUAN",
  "address": "alamat lengkap",
  "rtRw": "RT/RW",
  "kelurahan": "desa/kelurahan",
  "kecamatan": "kecamatan",
  "city": "kota/kabupaten",
  "province": "provinsi",
  "religion": "agama",
  "maritalStatus": "status perkawinan",
  "occupation": "pekerjaan",
  "nationality": "kewarganegaraan",
  "bloodType": "golongan darah atau null"
}
Kembalikan hanya JSON, tanpa markdown atau teks lain.`;

async function scanKtpWithGroq(imageBase64: string): Promise<KtpData> {
  if (!groq) throw new Error("Groq not configured");

  const resp = await groq.chat.completions.create({
    model: "meta-llama/llama-4-scout-17b-16e-instruct",
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: GROQ_PROMPT },
          { type: "image_url", image_url: { url: `data:image/jpeg;base64,${imageBase64}` } },
        ],
      },
    ],
    max_tokens: 800,
    temperature: 0,
  });

  const text = resp.choices[0]?.message?.content ?? "{}";
  const cleaned = text.replace(/```json?|```/g, "").trim();
  return JSON.parse(cleaned) as KtpData;
}

async function getImageBase64(fileUrl: string): Promise<string> {
  const resp = await fetch(fileUrl);
  const buf = await resp.arrayBuffer();
  const jpegBuf = await sharp(Buffer.from(buf))
    .resize({ width: 1200, withoutEnlargement: true })
    .jpeg({ quality: 90 })
    .toBuffer();
  return jpegBuf.toString("base64");
}

// ─── DB helpers ───────────────────────────────────────────────────────────────

async function getActiveStaff() {
  return db
    .select({ id: usersTable.id, name: usersTable.name, username: usersTable.username })
    .from(usersTable)
    .orderBy(usersTable.name);
}

async function getActiveEvents() {
  const now = new Date();
  return db
    .select({ id: eventsTable.id, name: eventsTable.name, location: eventsTable.location })
    .from(eventsTable)
    .where(
      and(
        eq(eventsTable.status, "active"),
        sql`${eventsTable.endDate} >= ${now}`
      )
    )
    .orderBy(eventsTable.startDate);
}

async function registerParticipant(data: {
  ktpData: KtpData;
  eventId: number;
  staffId: number;
  staffName: string;
}) {
  const { ktpData, eventId, staffId, staffName } = data;

  let participant = await db.query.participantsTable.findFirst({
    where: eq(participantsTable.nik, ktpData.nik),
  });

  const isNew = !participant;

  if (!participant) {
    const [p] = await db.insert(participantsTable).values({
      nik: ktpData.nik,
      fullName: ktpData.fullName,
      gender: ktpData.gender || null,
      birthPlace: ktpData.birthPlace || null,
      birthDate: ktpData.birthDate || null,
      address: ktpData.address || null,
      rtRw: ktpData.rtRw || null,
      kelurahan: ktpData.kelurahan || null,
      kecamatan: ktpData.kecamatan || null,
      city: ktpData.city || null,
      province: ktpData.province || null,
      religion: ktpData.religion || null,
      maritalStatus: ktpData.maritalStatus || null,
      occupation: ktpData.occupation || null,
      nationality: ktpData.nationality || null,
      bloodType: ktpData.bloodType || null,
    }).returning();
    participant = p;
  } else {
    await db.update(participantsTable)
      .set({
        fullName: ktpData.fullName,
        gender: ktpData.gender || null,
        birthPlace: ktpData.birthPlace || null,
        birthDate: ktpData.birthDate || null,
        address: ktpData.address || null,
        rtRw: ktpData.rtRw || null,
        kelurahan: ktpData.kelurahan || null,
        kecamatan: ktpData.kecamatan || null,
        city: ktpData.city || null,
        province: ktpData.province || null,
        religion: ktpData.religion || null,
        maritalStatus: ktpData.maritalStatus || null,
        occupation: ktpData.occupation || null,
        nationality: ktpData.nationality || null,
        bloodType: ktpData.bloodType || null,
        updatedAt: new Date(),
      })
      .where(eq(participantsTable.id, participant.id));
  }

  const existing = await db.query.eventRegistrationsTable.findFirst({
    where: (t, { and: a, eq: e }) => a(e(t.eventId, eventId), e(t.participantId, participant!.id)),
  });

  if (existing) {
    const totalEvents = await db.$count(
      eventRegistrationsTable,
      and(
        eq(eventRegistrationsTable.participantId, participant.id),
        ne(eventRegistrationsTable.registrationType, "attendance")
      )
    );
    return { alreadyRegistered: true, isNew, totalEvents };
  }

  await db.insert(eventRegistrationsTable).values({
    eventId,
    participantId: participant.id,
    staffId,
    staffName,
    registrationType: "onsite",
  });

  const totalEvents = await db.$count(
    eventRegistrationsTable,
    and(
      eq(eventRegistrationsTable.participantId, participant.id),
      ne(eventRegistrationsTable.registrationType, "attendance")
    )
  );

  return { alreadyRegistered: false, isNew, totalEvents };
}

// ─── Keyboards ────────────────────────────────────────────────────────────────

function buildPetugasKeyboard(staff: { id: number; name: string }[]) {
  const kb = new InlineKeyboard();
  staff.forEach((s, i) => {
    kb.text(s.name, `petugas:${s.id}:${encodeURIComponent(s.name)}`);
    if ((i + 1) % 2 === 0) kb.row();
  });
  kb.row().text("Batal", "cancel");
  return kb;
}

function buildEventKeyboard(events: { id: number; name: string; location: string | null }[]) {
  const kb = new InlineKeyboard();
  events.forEach((e) => {
    kb.text(`${e.name}${e.location ? ` (${e.location})` : ""}`, `event:${e.id}:${encodeURIComponent(e.name)}`).row();
  });
  kb.text("Batal", "cancel");
  return kb;
}

function formatKtpData(d: KtpData): string {
  const lines = [
    `*NIK:* \`${d.nik}\``,
    `*Nama:* ${d.fullName}`,
    d.birthPlace && d.birthDate ? `*TTL:* ${d.birthPlace}, ${d.birthDate}` : null,
    d.gender ? `*Jenis Kelamin:* ${d.gender}` : null,
    d.address ? `*Alamat:* ${d.address}` : null,
    d.city ? `*Kota:* ${d.city}` : null,
    d.kecamatan ? `*Kecamatan:* ${d.kecamatan}` : null,
    d.occupation ? `*Pekerjaan:* ${d.occupation}` : null,
    d.religion ? `*Agama:* ${d.religion}` : null,
  ];
  return lines.filter(Boolean).join("\n");
}

// ─── Handlers ────────────────────────────────────────────────────────────────

bot.command("start", async (ctx) => {
  setState(ctx.chat.id, { step: "idle" });
  await ctx.reply(
    "Halo! Saya bot pendaftaran KTP.\n\n" +
    "Kirim foto KTP untuk mendaftarkan peserta ke event.\n\n" +
    "Perintah:\n/daftar - Mulai pendaftaran\n/batal - Batalkan proses"
  );
});

bot.command("daftar", async (ctx) => {
  setState(ctx.chat.id, { step: "await_photo" });
  await ctx.reply("Silakan kirim foto KTP peserta yang ingin didaftarkan.");
});

bot.command("batal", async (ctx) => {
  setState(ctx.chat.id, { step: "idle" });
  await ctx.reply("Proses dibatalkan.");
});

// ─── Photo handler ─────────────────────────────────────────────────────────

bot.on("message:photo", async (ctx) => {
  const state = getState(ctx.chat.id);

  if (state.step !== "await_photo" && state.step !== "idle") {
    await ctx.reply("Saya sedang dalam proses lain. Ketik /batal untuk membatalkan.");
    return;
  }

  setState(ctx.chat.id, { step: "await_photo" });

  const processingMsg = await ctx.reply("Memproses foto KTP...");

  try {
    const photo = ctx.message.photo.at(-1);
    if (!photo) { await ctx.reply("Foto tidak ditemukan."); return; }

    const file = await ctx.api.getFile(photo.file_id);
    const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;
    const imageBase64 = await getImageBase64(fileUrl);

    if (!groq) {
      await ctx.api.deleteMessage(ctx.chat.id, processingMsg.message_id);
      await ctx.reply("OCR tidak tersedia. Pastikan GROQ_API_KEY sudah dikonfigurasi.");
      return;
    }

    await ctx.api.editMessageText(ctx.chat.id, processingMsg.message_id, "Membaca data KTP dengan AI...");
    const ktpData = await scanKtpWithGroq(imageBase64);

    if (!ktpData.nik || ktpData.nik.length < 16) {
      await ctx.api.deleteMessage(ctx.chat.id, processingMsg.message_id);
      await ctx.reply("Gagal membaca NIK dari foto. Pastikan foto KTP jelas dan coba lagi.");
      setState(ctx.chat.id, { step: "await_photo" });
      return;
    }

    // Check if NIK already exists, auto-fill name fallback
    if (!ktpData.fullName) {
      await ctx.api.deleteMessage(ctx.chat.id, processingMsg.message_id);
      await ctx.reply("Gagal membaca nama dari foto. Pastikan foto KTP jelas dan coba lagi.");
      setState(ctx.chat.id, { step: "await_photo" });
      return;
    }

    await ctx.api.deleteMessage(ctx.chat.id, processingMsg.message_id);

    // Ask petugas
    const staff = await getActiveStaff();
    if (staff.length === 0) {
      await ctx.reply("Tidak ada petugas terdaftar. Hubungi admin.");
      setState(ctx.chat.id, { step: "idle" });
      return;
    }

    setState(ctx.chat.id, { step: "await_petugas", imageBase64 });

    await ctx.reply(
      `Data KTP berhasil dibaca:\n\n${formatKtpData(ktpData)}\n\n*Pilih petugas yang mendaftarkan:*`,
      {
        parse_mode: "Markdown",
        reply_markup: buildPetugasKeyboard(staff),
      }
    );

    // Store ktpData temporarily in a shared map keyed by chatId
    pendingKtp.set(ctx.chat.id, ktpData);

  } catch (err) {
    console.error("Photo handler error:", err);
    try { await ctx.api.deleteMessage(ctx.chat.id, processingMsg.message_id); } catch {}
    await ctx.reply("Terjadi kesalahan saat memproses foto. Coba lagi.");
    setState(ctx.chat.id, { step: "idle" });
  }
});

// ─── Pending KTP map ──────────────────────────────────────────────────────────

const pendingKtp = new Map<number, KtpData>();

// ─── Callback query handlers ──────────────────────────────────────────────────

bot.callbackQuery(/^petugas:(\d+):(.+)$/, async (ctx) => {
  const state = getState(ctx.chat.id);
  if (state.step !== "await_petugas") {
    await ctx.answerCallbackQuery("Proses sudah selesai atau dibatalkan.");
    return;
  }

  const staffId = parseInt(ctx.match[1]);
  const staffName = decodeURIComponent(ctx.match[2]);

  const events = await getActiveEvents();
  if (events.length === 0) {
    await ctx.editMessageText("Tidak ada event aktif saat ini. Hubungi admin.");
    setState(ctx.chat.id, { step: "idle" });
    await ctx.answerCallbackQuery();
    return;
  }

  setState(ctx.chat.id, {
    step: "await_event",
    imageBase64: state.imageBase64,
    staffId,
    staffName,
  });

  await ctx.editMessageText(
    `Petugas: *${staffName}*\n\nPilih event untuk pendaftaran:`,
    {
      parse_mode: "Markdown",
      reply_markup: buildEventKeyboard(events),
    }
  );
  await ctx.answerCallbackQuery();
});

bot.callbackQuery(/^event:(\d+):(.+)$/, async (ctx) => {
  const state = getState(ctx.chat.id);
  if (state.step !== "await_event") {
    await ctx.answerCallbackQuery("Proses sudah selesai atau dibatalkan.");
    return;
  }

  const eventId = parseInt(ctx.match[1]);
  const eventName = decodeURIComponent(ctx.match[2]);
  const ktpData = pendingKtp.get(ctx.chat.id);

  if (!ktpData) {
    await ctx.editMessageText("Data KTP tidak ditemukan. Silakan kirim ulang foto KTP.");
    setState(ctx.chat.id, { step: "idle" });
    await ctx.answerCallbackQuery();
    return;
  }

  setState(ctx.chat.id, {
    step: "await_confirm",
    imageBase64: state.imageBase64,
    staffId: state.staffId,
    staffName: state.staffName,
    eventId,
    eventName,
    ktpData,
  });

  const confirmKb = new InlineKeyboard()
    .text("Daftarkan", "confirm:yes")
    .text("Batal", "confirm:no");

  await ctx.editMessageText(
    `*Konfirmasi Pendaftaran*\n\n` +
    `*Event:* ${eventName}\n` +
    `*Petugas:* ${state.staffName}\n\n` +
    `*Data Peserta:*\n${formatKtpData(ktpData)}\n\n` +
    `Apakah data sudah benar?`,
    {
      parse_mode: "Markdown",
      reply_markup: confirmKb,
    }
  );
  await ctx.answerCallbackQuery();
});

bot.callbackQuery("confirm:yes", async (ctx) => {
  const state = getState(ctx.chat.id);
  if (state.step !== "await_confirm") {
    await ctx.answerCallbackQuery("Proses sudah selesai atau dibatalkan.");
    return;
  }

  await ctx.editMessageText("Mendaftarkan peserta...");

  try {
    const result = await registerParticipant({
      ktpData: state.ktpData,
      eventId: state.eventId,
      staffId: state.staffId,
      staffName: state.staffName,
    });

    pendingKtp.delete(ctx.chat.id);
    setState(ctx.chat.id, { step: "idle" });

    if (result.alreadyRegistered) {
      await ctx.editMessageText(
        `Peserta *${state.ktpData.fullName}* sudah terdaftar di event *${state.eventName}* sebelumnya.\n\n` +
        `Total event diikuti: ${result.totalEvents}`,
        { parse_mode: "Markdown" }
      );
    } else {
      await ctx.editMessageText(
        `Pendaftaran berhasil!\n\n` +
        `*Nama:* ${state.ktpData.fullName}\n` +
        `*NIK:* \`${state.ktpData.nik}\`\n` +
        `*Event:* ${state.eventName}\n` +
        `*Petugas:* ${state.staffName}\n` +
        `*Status:* ${result.isNew ? "Peserta baru" : "Peserta lama"}\n` +
        `*Total event diikuti:* ${result.totalEvents}`,
        { parse_mode: "Markdown" }
      );
    }
  } catch (err) {
    console.error("Register error:", err);
    await ctx.editMessageText("Gagal mendaftarkan peserta. Silakan coba lagi.");
    setState(ctx.chat.id, { step: "idle" });
  }
  await ctx.answerCallbackQuery();
});

bot.callbackQuery("confirm:no", async (ctx) => {
  pendingKtp.delete(ctx.chat.id);
  setState(ctx.chat.id, { step: "idle" });
  await ctx.editMessageText("Pendaftaran dibatalkan.");
  await ctx.answerCallbackQuery();
});

bot.callbackQuery("cancel", async (ctx) => {
  pendingKtp.delete(ctx.chat.id);
  setState(ctx.chat.id, { step: "idle" });
  await ctx.editMessageText("Dibatalkan.");
  await ctx.answerCallbackQuery();
});

// ─── Fallback for non-photo messages ─────────────────────────────────────────

bot.on("message:text", async (ctx) => {
  const state = getState(ctx.chat.id);
  if (state.step === "await_photo") {
    await ctx.reply("Tolong kirimkan foto KTP (bukan teks).");
  } else if (state.step === "idle") {
    await ctx.reply("Ketik /daftar untuk mulai mendaftarkan peserta, atau kirim langsung foto KTP.");
  }
});

bot.on("message:document", async (ctx) => {
  const state = getState(ctx.chat.id);
  if (state.step === "await_photo" || state.step === "idle") {
    await ctx.reply(
      "Untuk hasil OCR terbaik, kirim foto sebagai *foto* (bukan file/dokumen). " +
      "Di Telegram, pilih gambar lalu pilih 'Send as Photo'.",
      { parse_mode: "Markdown" }
    );
  }
});

// ─── Error handler ────────────────────────────────────────────────────────────

bot.catch((err) => {
  console.error("Bot error:", err.error);
});

// ─── Start bot ────────────────────────────────────────────────────────────────

console.log("Starting Telegram bot...");
bot.start({ allowed_updates: ["message", "callback_query"] })
  .then(() => console.log("Bot stopped"))
  .catch((err) => { console.error("Bot fatal error:", err); process.exit(1); });
