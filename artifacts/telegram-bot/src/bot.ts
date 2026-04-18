import { Bot, InlineKeyboard } from "grammy";
import { db } from "@workspace/db";
import { usersTable, eventsTable, participantsTable, eventRegistrationsTable } from "@workspace/db";
import { eq, and, ne, sql } from "drizzle-orm";
import Groq from "groq-sdk";
import sharp from "sharp";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!BOT_TOKEN) { console.error("TELEGRAM_BOT_TOKEN is not set"); process.exit(1); }

const groq = process.env.GROQ_API_KEY
  ? new Groq({ apiKey: process.env.GROQ_API_KEY })
  : null;

const bot = new Bot(BOT_TOKEN);

// ─── HTML escape ──────────────────────────────────────────────────────────────

function h(text: string | null | undefined): string {
  if (!text) return "<i>—</i>";
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ─── Types ────────────────────────────────────────────────────────────────────

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

type KtpField = keyof KtpData;

const FIELD_LABELS: Record<KtpField, string> = {
  nik: "NIK", fullName: "Nama Lengkap", birthPlace: "Tempat Lahir", birthDate: "Tanggal Lahir",
  gender: "Jenis Kelamin", address: "Alamat", rtRw: "RT/RW", kelurahan: "Desa/Kel.",
  kecamatan: "Kecamatan", city: "Kota/Kab.", province: "Provinsi", religion: "Agama",
  maritalStatus: "Status Nikah", occupation: "Pekerjaan", nationality: "Kewarganegaraan",
  bloodType: "Gol. Darah",
};

// Fields that show up as Edit buttons
const EDIT_BUTTON_FIELDS: KtpField[] = [
  "nik", "fullName", "birthPlace", "birthDate", "gender",
  "city", "kecamatan", "occupation", "religion", "maritalStatus",
];

type BotState =
  | { step: "idle" }
  | { step: "await_photo" }
  | { step: "await_data_confirm"; ktpData: KtpData; imageBase64: string; dataMessageId: number }
  | { step: "await_edit_field"; ktpData: KtpData; imageBase64: string; field: KtpField; dataMessageId: number }
  | { step: "await_petugas"; ktpData: KtpData; imageBase64: string }
  | { step: "await_event"; ktpData: KtpData; imageBase64: string; staffId: number; staffName: string }
  | { step: "await_confirm"; ktpData: KtpData; imageBase64: string; staffId: number; staffName: string; eventId: number; eventName: string };

const sessions = new Map<number, BotState>();
function getState(id: number): BotState { return sessions.get(id) ?? { step: "idle" }; }
function setState(id: number, s: BotState) { sessions.set(id, s); }

// ─── OCR via Groq ─────────────────────────────────────────────────────────────

const GROQ_PROMPT = `Kamu adalah OCR untuk KTP Indonesia. Ekstrak data dari foto KTP ini dan kembalikan JSON dengan field berikut (null jika tidak ditemukan):
{"nik":"16 digit NIK","fullName":"nama lengkap","birthPlace":"tempat lahir","birthDate":"DD-MM-YYYY","gender":"LAKI-LAKI atau PEREMPUAN","address":"alamat lengkap","rtRw":"RT/RW","kelurahan":"desa/kelurahan","kecamatan":"kecamatan","city":"kota/kabupaten","province":"provinsi","religion":"agama","maritalStatus":"status perkawinan","occupation":"pekerjaan","nationality":"kewarganegaraan","bloodType":"golongan darah atau null"}
Kembalikan hanya JSON tanpa markdown atau teks lain.`;

async function scanKtp(imageBase64: string): Promise<KtpData> {
  if (!groq) throw new Error("Groq not configured");
  const resp = await groq.chat.completions.create({
    model: "meta-llama/llama-4-scout-17b-16e-instruct",
    messages: [{
      role: "user",
      content: [
        { type: "text", text: GROQ_PROMPT },
        { type: "image_url", image_url: { url: `data:image/jpeg;base64,${imageBase64}` } },
      ],
    }],
    max_tokens: 800,
    temperature: 0,
  });
  const text = resp.choices[0]?.message?.content ?? "{}";
  return JSON.parse(text.replace(/```json?|```/g, "").trim()) as KtpData;
}

async function getImageBase64(fileUrl: string): Promise<string> {
  const resp = await fetch(fileUrl);
  const buf = await resp.arrayBuffer();
  return (await sharp(Buffer.from(buf)).resize({ width: 1200, withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer()).toString("base64");
}

// ─── DB helpers ───────────────────────────────────────────────────────────────

async function getStaff() {
  return db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).orderBy(usersTable.name);
}

async function getActiveEvents() {
  const now = new Date();
  return db.select({ id: eventsTable.id, name: eventsTable.name, location: eventsTable.location })
    .from(eventsTable)
    .where(and(eq(eventsTable.status, "active"), sql`${eventsTable.endDate} >= ${now}`))
    .orderBy(eventsTable.startDate);
}

async function registerParticipant(d: { ktpData: KtpData; eventId: number; staffId: number; staffName: string }) {
  const { ktpData, eventId, staffId, staffName } = d;
  let participant = await db.query.participantsTable.findFirst({ where: eq(participantsTable.nik, ktpData.nik) });
  const isNew = !participant;
  const fields = {
    fullName: ktpData.fullName, gender: ktpData.gender || null, birthPlace: ktpData.birthPlace || null,
    birthDate: ktpData.birthDate || null, address: ktpData.address || null, rtRw: ktpData.rtRw || null,
    kelurahan: ktpData.kelurahan || null, kecamatan: ktpData.kecamatan || null, city: ktpData.city || null,
    province: ktpData.province || null, religion: ktpData.religion || null, maritalStatus: ktpData.maritalStatus || null,
    occupation: ktpData.occupation || null, nationality: ktpData.nationality || null, bloodType: ktpData.bloodType || null,
  };
  if (!participant) {
    const [p] = await db.insert(participantsTable).values({ nik: ktpData.nik, ...fields }).returning();
    participant = p;
  } else {
    await db.update(participantsTable).set({ ...fields, updatedAt: new Date() }).where(eq(participantsTable.id, participant.id));
  }
  const existing = await db.query.eventRegistrationsTable.findFirst({
    where: (t, { and: a, eq: e }) => a(e(t.eventId, eventId), e(t.participantId, participant!.id)),
  });
  if (existing) {
    const total = await db.$count(eventRegistrationsTable, and(eq(eventRegistrationsTable.participantId, participant.id), ne(eventRegistrationsTable.registrationType, "attendance")));
    return { alreadyRegistered: true, isNew, totalEvents: total };
  }
  await db.insert(eventRegistrationsTable).values({ eventId, participantId: participant.id, staffId, staffName, registrationType: "onsite" });
  const total = await db.$count(eventRegistrationsTable, and(eq(eventRegistrationsTable.participantId, participant.id), ne(eventRegistrationsTable.registrationType, "attendance")));
  return { alreadyRegistered: false, isNew, totalEvents: total };
}

// ─── Message builders ─────────────────────────────────────────────────────────

function buildDataMessage(ktp: KtpData): string {
  return (
    `<b>Periksa Data KTP</b>\n\n` +
    `<b>NIK:</b> <code>${h(ktp.nik)}</code>\n` +
    `<b>Nama:</b> ${h(ktp.fullName)}\n` +
    `<b>Tempat Lahir:</b> ${h(ktp.birthPlace)}\n` +
    `<b>Tanggal Lahir:</b> ${h(ktp.birthDate)}\n` +
    `<b>Jenis Kelamin:</b> ${h(ktp.gender)}\n` +
    `<b>Alamat:</b> ${h(ktp.address)}\n` +
    (ktp.rtRw ? `<b>RT/RW:</b> ${h(ktp.rtRw)}\n` : "") +
    (ktp.kelurahan ? `<b>Desa/Kel.:</b> ${h(ktp.kelurahan)}\n` : "") +
    `<b>Kecamatan:</b> ${h(ktp.kecamatan)}\n` +
    `<b>Kota/Kab.:</b> ${h(ktp.city)}\n` +
    `<b>Agama:</b> ${h(ktp.religion)}\n` +
    `<b>Pekerjaan:</b> ${h(ktp.occupation)}\n` +
    `<b>Status Nikah:</b> ${h(ktp.maritalStatus)}\n` +
    (ktp.bloodType ? `<b>Gol. Darah:</b> ${h(ktp.bloodType)}\n` : "") +
    `\n<i>Pastikan data sudah benar. Jika ada yang salah, tekan tombol Edit di bawah. Jika sudah benar, tekan <b>Data Benar - Lanjut</b>.</i>`
  );
}

function buildDataKeyboard(): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (let i = 0; i < EDIT_BUTTON_FIELDS.length; i += 2) {
    const f1 = EDIT_BUTTON_FIELDS[i];
    const f2 = EDIT_BUTTON_FIELDS[i + 1];
    kb.text(`Ubah ${FIELD_LABELS[f1]}`, `edit:${f1}`);
    if (f2) kb.text(`Ubah ${FIELD_LABELS[f2]}`, `edit:${f2}`);
    kb.row();
  }
  kb.text("Data Benar - Lanjut", "data_ok").row();
  kb.text("Batal", "cancel");
  return kb;
}

function buildPetugasKeyboard(staff: { id: number; name: string }[]): InlineKeyboard {
  const kb = new InlineKeyboard();
  staff.forEach((s, i) => {
    kb.text(s.name, `petugas:${s.id}:${encodeURIComponent(s.name)}`);
    if ((i + 1) % 2 === 0) kb.row();
  });
  return kb.row().text("Batal", "cancel");
}

function buildEventKeyboard(events: { id: number; name: string; location: string | null }[]): InlineKeyboard {
  const kb = new InlineKeyboard();
  events.forEach((e) => kb.text(`${e.name}${e.location ? ` (${e.location})` : ""}`, `event:${e.id}:${encodeURIComponent(e.name)}`).row());
  return kb.text("Batal", "cancel");
}

// ─── Commands ─────────────────────────────────────────────────────────────────

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
    await ctx.reply("Sedang dalam proses lain. Ketik /batal untuk membatalkan.");
    return;
  }
  setState(ctx.chat.id, { step: "await_photo" });
  const statusMsg = await ctx.reply("Memproses foto KTP...");
  try {
    const photo = ctx.message.photo.at(-1)!;
    const file = await ctx.api.getFile(photo.file_id);
    const imageBase64 = await getImageBase64(`https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`);

    await ctx.api.editMessageText(ctx.chat.id, statusMsg.message_id, "Membaca data KTP dengan AI...");
    const ktpData = await scanKtp(imageBase64);

    if (!ktpData.nik || ktpData.nik.length < 10) {
      await ctx.api.deleteMessage(ctx.chat.id, statusMsg.message_id);
      await ctx.reply("Gagal membaca NIK. Pastikan foto KTP jelas lalu coba lagi.");
      setState(ctx.chat.id, { step: "await_photo" });
      return;
    }
    if (!ktpData.fullName) {
      await ctx.api.deleteMessage(ctx.chat.id, statusMsg.message_id);
      await ctx.reply("Gagal membaca nama. Pastikan foto KTP jelas lalu coba lagi.");
      setState(ctx.chat.id, { step: "await_photo" });
      return;
    }

    await ctx.api.deleteMessage(ctx.chat.id, statusMsg.message_id);

    const dataMsg = await ctx.reply(buildDataMessage(ktpData), {
      parse_mode: "HTML",
      reply_markup: buildDataKeyboard(),
    });

    setState(ctx.chat.id, { step: "await_data_confirm", ktpData, imageBase64, dataMessageId: dataMsg.message_id });
  } catch (err) {
    console.error("Photo error:", err);
    try { await ctx.api.deleteMessage(ctx.chat.id, statusMsg.message_id); } catch {}
    await ctx.reply("Terjadi kesalahan saat membaca foto. Coba lagi.");
    setState(ctx.chat.id, { step: "idle" });
  }
});

// ─── Edit field callbacks ─────────────────────────────────────────────────────

bot.callbackQuery(/^edit:(.+)$/, async (ctx) => {
  const state = getState(ctx.chat.id);
  if (state.step !== "await_data_confirm") { await ctx.answerCallbackQuery("Sesi sudah berakhir."); return; }

  const field = ctx.match[1] as KtpField;
  const label = FIELD_LABELS[field];
  const currentVal = state.ktpData[field];

  setState(ctx.chat.id, {
    step: "await_edit_field",
    ktpData: state.ktpData,
    imageBase64: state.imageBase64,
    field,
    dataMessageId: state.dataMessageId,
  });

  await ctx.answerCallbackQuery();
  await ctx.reply(
    `Ketik nilai baru untuk <b>${h(label)}</b>:\n` +
    `Nilai saat ini: <i>${h(currentVal) || "kosong"}</i>`,
    { parse_mode: "HTML" }
  );
});

// ─── Data OK ─────────────────────────────────────────────────────────────────

bot.callbackQuery("data_ok", async (ctx) => {
  const state = getState(ctx.chat.id);
  if (state.step !== "await_data_confirm") { await ctx.answerCallbackQuery("Sesi sudah berakhir."); return; }

  const staff = await getStaff();
  if (staff.length === 0) {
    await ctx.editMessageText("Tidak ada petugas terdaftar. Hubungi admin.");
    setState(ctx.chat.id, { step: "idle" });
    await ctx.answerCallbackQuery();
    return;
  }

  setState(ctx.chat.id, { step: "await_petugas", ktpData: state.ktpData, imageBase64: state.imageBase64 });
  await ctx.editMessageText(
    `<b>Data dikonfirmasi.</b>\n\nPilih petugas yang mendaftarkan:`,
    { parse_mode: "HTML", reply_markup: buildPetugasKeyboard(staff) }
  );
  await ctx.answerCallbackQuery();
});

// ─── Petugas callback ─────────────────────────────────────────────────────────

bot.callbackQuery(/^petugas:(\d+):(.+)$/, async (ctx) => {
  const state = getState(ctx.chat.id);
  if (state.step !== "await_petugas") { await ctx.answerCallbackQuery("Sesi sudah berakhir."); return; }

  const staffId = parseInt(ctx.match[1]);
  const staffName = decodeURIComponent(ctx.match[2]);
  const events = await getActiveEvents();

  if (events.length === 0) {
    await ctx.editMessageText("Tidak ada event aktif saat ini. Hubungi admin.");
    setState(ctx.chat.id, { step: "idle" });
    await ctx.answerCallbackQuery();
    return;
  }

  setState(ctx.chat.id, { step: "await_event", ktpData: state.ktpData, imageBase64: state.imageBase64, staffId, staffName });
  await ctx.editMessageText(
    `Petugas: <b>${h(staffName)}</b>\n\nPilih event untuk pendaftaran:`,
    { parse_mode: "HTML", reply_markup: buildEventKeyboard(events) }
  );
  await ctx.answerCallbackQuery();
});

// ─── Event callback ───────────────────────────────────────────────────────────

bot.callbackQuery(/^event:(\d+):(.+)$/, async (ctx) => {
  const state = getState(ctx.chat.id);
  if (state.step !== "await_event") { await ctx.answerCallbackQuery("Sesi sudah berakhir."); return; }

  const eventId = parseInt(ctx.match[1]);
  const eventName = decodeURIComponent(ctx.match[2]);
  const ktp = state.ktpData;

  const confirmKb = new InlineKeyboard()
    .text("Daftarkan", "confirm:yes").text("Batal", "cancel");

  setState(ctx.chat.id, { step: "await_confirm", ktpData: ktp, imageBase64: state.imageBase64, staffId: state.staffId, staffName: state.staffName, eventId, eventName });
  await ctx.editMessageText(
    `<b>Konfirmasi Akhir</b>\n\n` +
    `<b>Event:</b> ${h(eventName)}\n` +
    `<b>Petugas:</b> ${h(state.staffName)}\n\n` +
    `<b>NIK:</b> <code>${h(ktp.nik)}</code>\n` +
    `<b>Nama:</b> ${h(ktp.fullName)}\n` +
    (ktp.birthPlace && ktp.birthDate ? `<b>TTL:</b> ${h(ktp.birthPlace)}, ${h(ktp.birthDate)}\n` : "") +
    (ktp.gender ? `<b>Kelamin:</b> ${h(ktp.gender)}\n` : "") +
    (ktp.city ? `<b>Kota:</b> ${h(ktp.city)}\n` : "") +
    (ktp.occupation ? `<b>Pekerjaan:</b> ${h(ktp.occupation)}\n` : "") +
    `\nLanjutkan pendaftaran?`,
    { parse_mode: "HTML", reply_markup: confirmKb }
  );
  await ctx.answerCallbackQuery();
});

// ─── Confirm ──────────────────────────────────────────────────────────────────

bot.callbackQuery("confirm:yes", async (ctx) => {
  const state = getState(ctx.chat.id);
  if (state.step !== "await_confirm") { await ctx.answerCallbackQuery(); return; }

  await ctx.editMessageText("Mendaftarkan peserta...");
  try {
    const result = await registerParticipant({ ktpData: state.ktpData, eventId: state.eventId, staffId: state.staffId, staffName: state.staffName });
    setState(ctx.chat.id, { step: "idle" });

    if (result.alreadyRegistered) {
      await ctx.editMessageText(
        `<b>${h(state.ktpData.fullName)}</b> sudah terdaftar di event ini sebelumnya.\n\nTotal event diikuti: ${result.totalEvents}`,
        { parse_mode: "HTML" }
      );
    } else {
      await ctx.editMessageText(
        `<b>Pendaftaran Berhasil!</b>\n\n` +
        `<b>Nama:</b> ${h(state.ktpData.fullName)}\n` +
        `<b>NIK:</b> <code>${h(state.ktpData.nik)}</code>\n` +
        `<b>Event:</b> ${h(state.eventName)}\n` +
        `<b>Petugas:</b> ${h(state.staffName)}\n` +
        `<b>Status:</b> ${result.isNew ? "Peserta baru" : "Peserta lama"}\n` +
        `<b>Total event diikuti:</b> ${result.totalEvents}`,
        { parse_mode: "HTML" }
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
  setState(ctx.chat.id, { step: "idle" });
  await ctx.editMessageText("Pendaftaran dibatalkan.");
  await ctx.answerCallbackQuery();
});

bot.callbackQuery("cancel", async (ctx) => {
  setState(ctx.chat.id, { step: "idle" });
  await ctx.editMessageText("Dibatalkan.");
  await ctx.answerCallbackQuery();
});

// ─── Text handler — handles edit field input ──────────────────────────────────

bot.on("message:text", async (ctx) => {
  const state = getState(ctx.chat.id);

  if (state.step === "await_edit_field") {
    const newValue = ctx.message.text.trim();
    const updatedKtp = { ...state.ktpData, [state.field]: newValue || null };

    // Delete the "Ketik nilai baru" prompt if possible
    try { await ctx.message.delete(); } catch {}

    setState(ctx.chat.id, {
      step: "await_data_confirm",
      ktpData: updatedKtp,
      imageBase64: state.imageBase64,
      dataMessageId: state.dataMessageId,
    });

    // Update the original data message
    try {
      await ctx.api.editMessageText(ctx.chat.id, state.dataMessageId, buildDataMessage(updatedKtp), {
        parse_mode: "HTML",
        reply_markup: buildDataKeyboard(),
      });
    } catch {
      const msg = await ctx.reply(buildDataMessage(updatedKtp), {
        parse_mode: "HTML",
        reply_markup: buildDataKeyboard(),
      });
      setState(ctx.chat.id, {
        step: "await_data_confirm",
        ktpData: updatedKtp,
        imageBase64: state.imageBase64,
        dataMessageId: msg.message_id,
      });
    }
    return;
  }

  if (state.step === "await_photo") {
    await ctx.reply("Tolong kirimkan foto KTP (bukan teks).");
  } else if (state.step === "idle") {
    await ctx.reply("Ketik /daftar untuk mulai, atau kirim langsung foto KTP.");
  } else {
    await ctx.reply("Sedang dalam proses. Ketik /batal untuk membatalkan.");
  }
});

bot.on("message:document", async (ctx) => {
  await ctx.reply(
    "Untuk hasil OCR terbaik, kirim sebagai <b>foto</b> (bukan file/dokumen). " +
    "Di Telegram, pilih gambar lalu pilih <b>Send as Photo</b>.",
    { parse_mode: "HTML" }
  );
});

// ─── Error + start ────────────────────────────────────────────────────────────

bot.catch((err) => console.error("Bot error:", err.error));

console.log("Starting Telegram bot...");
bot.start({ allowed_updates: ["message", "callback_query"] })
  .then(() => console.log("Bot stopped"))
  .catch((err) => { console.error("Bot fatal error:", err); process.exit(1); });
