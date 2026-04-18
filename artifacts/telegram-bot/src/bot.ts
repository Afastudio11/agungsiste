import { Bot, InlineKeyboard } from "grammy";
import { db } from "@workspace/db";
import { usersTable, eventsTable, participantsTable, eventRegistrationsTable } from "@workspace/db";
import { eq, and, ne, asc } from "drizzle-orm";
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

const EDIT_BUTTON_FIELDS: KtpField[] = [
  "nik", "fullName", "birthPlace", "birthDate", "gender",
  "city", "kecamatan", "occupation", "religion", "maritalStatus",
];

// ─── State machine ─────────────────────────────────────────────────────────────
// Alur: /daftar → pilih event → pilih petugas → kirim foto KTP → cek data → konfirmasi

type BotState =
  | { step: "idle" }
  | { step: "await_event" }
  | { step: "await_petugas"; eventId: number; eventName: string; eventDate: string | null }
  | { step: "await_photo"; eventId: number; eventName: string; eventDate: string | null; staffId: number; staffName: string }
  | { step: "await_data_confirm"; eventId: number; eventName: string; staffId: number; staffName: string; ktpData: KtpData; imageBase64: string; dataMessageId: number }
  | { step: "await_edit_field"; eventId: number; eventName: string; staffId: number; staffName: string; ktpData: KtpData; imageBase64: string; field: KtpField; dataMessageId: number }
  | { step: "await_confirm"; eventId: number; eventName: string; staffId: number; staffName: string; ktpData: KtpData; imageBase64: string };

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
  return db.select({ id: usersTable.id, name: usersTable.name })
    .from(usersTable)
    .orderBy(asc(usersTable.name));
}

async function getActiveEvents() {
  return db.select({ id: eventsTable.id, name: eventsTable.name, location: eventsTable.location, eventDate: eventsTable.eventDate })
    .from(eventsTable)
    .where(eq(eventsTable.status, "active"))
    .orderBy(asc(eventsTable.eventDate));
}

async function saveKtpImage(participantId: number, nik: string, imageBase64: string): Promise<void> {
  try {
    const compressed = await sharp(Buffer.from(imageBase64, "base64"))
      .resize({ width: 800, withoutEnlargement: true })
      .jpeg({ quality: 70 })
      .toBuffer();
    const dataUrl = `data:image/jpeg;base64,${compressed.toString("base64")}`;
    await db.update(participantsTable)
      .set({ ktpImagePath: dataUrl })
      .where(eq(participantsTable.id, participantId));
    console.log(`[KTP] Image saved for NIK ${nik} (${Math.round(compressed.length / 1024)}KB)`);
  } catch (err) {
    console.error(`[KTP] Failed to save image for NIK ${nik}:`, err);
  }
}

async function registerParticipant(d: { ktpData: KtpData; eventId: number; staffId: number; staffName: string; imageBase64: string }) {
  const { ktpData, eventId, staffId, staffName, imageBase64 } = d;
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

  // Save KTP image if not already stored
  if (!participant.ktpImagePath && imageBase64) {
    await saveKtpImage(participant.id, ktpData.nik, imageBase64);
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

// ─── Keyboard builders ────────────────────────────────────────────────────────

function buildEventKeyboard(events: { id: number; name: string; location: string | null; eventDate: string | null }[]): InlineKeyboard {
  const kb = new InlineKeyboard();
  events.forEach((e) => {
    const label = e.eventDate ? `${e.name} — ${e.eventDate}` : e.name;
    kb.text(label, `event:${e.id}:${encodeURIComponent(e.name)}:${encodeURIComponent(e.eventDate ?? "")}`).row();
  });
  return kb.text("Batal", "cancel");
}

function buildPetugasKeyboard(staff: { id: number; name: string }[]): InlineKeyboard {
  const kb = new InlineKeyboard();
  staff.forEach((s, i) => {
    kb.text(s.name, `petugas:${s.id}:${encodeURIComponent(s.name)}`);
    if ((i + 1) % 2 === 0) kb.row();
  });
  return kb.row().text("Batal", "cancel");
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

function buildDataMessage(ktp: KtpData, eventName: string, staffName: string): string {
  return (
    `<b>Periksa Data KTP</b>\n` +
    `Event: <b>${h(eventName)}</b> | Petugas: <b>${h(staffName)}</b>\n\n` +
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

// ─── Commands ─────────────────────────────────────────────────────────────────

bot.command("start", async (ctx) => {
  setState(ctx.chat.id, { step: "idle" });
  await ctx.reply(
    "Halo! Saya bot pendaftaran KTP.\n\n" +
    "Perintah:\n/daftar - Mulai pendaftaran\n/batal - Batalkan proses"
  );
});

bot.command("daftar", async (ctx) => {
  const events = await getActiveEvents();
  if (events.length === 0) {
    await ctx.reply("Tidak ada event aktif saat ini. Hubungi admin.");
    return;
  }
  setState(ctx.chat.id, { step: "await_event" });
  await ctx.reply(
    "<b>Langkah 1 dari 3: Pilih Event</b>\n\nPilih event yang ingin didaftarkan:",
    { parse_mode: "HTML", reply_markup: buildEventKeyboard(events) }
  );
});

bot.command("batal", async (ctx) => {
  setState(ctx.chat.id, { step: "idle" });
  await ctx.reply("Proses dibatalkan.");
});

// ─── Step 1: Event callback ───────────────────────────────────────────────────

bot.callbackQuery(/^event:(\d+):([^:]*):([^:]*)$/, async (ctx) => {
  const state = getState(ctx.chat.id);
  if (state.step !== "await_event") { await ctx.answerCallbackQuery("Ketik /daftar untuk memulai."); return; }

  const eventId = parseInt(ctx.match[1]);
  const eventName = decodeURIComponent(ctx.match[2]);
  const eventDate = decodeURIComponent(ctx.match[3]) || null;

  const staff = await getStaff();
  if (staff.length === 0) {
    await ctx.editMessageText("Tidak ada petugas terdaftar. Hubungi admin.");
    setState(ctx.chat.id, { step: "idle" });
    await ctx.answerCallbackQuery();
    return;
  }

  setState(ctx.chat.id, { step: "await_petugas", eventId, eventName, eventDate });
  await ctx.editMessageText(
    `<b>Langkah 2 dari 3: Pilih Petugas</b>\n\nEvent: <b>${h(eventName)}</b>${eventDate ? ` (${h(eventDate)})` : ""}\n\nPilih nama petugas yang bertugas:`,
    { parse_mode: "HTML", reply_markup: buildPetugasKeyboard(staff) }
  );
  await ctx.answerCallbackQuery();
});

// ─── Step 2: Petugas callback ──────────────────────────────────────────────────

bot.callbackQuery(/^petugas:(\d+):(.+)$/, async (ctx) => {
  const state = getState(ctx.chat.id);
  if (state.step !== "await_petugas") { await ctx.answerCallbackQuery("Ketik /daftar untuk memulai."); return; }

  const staffId = parseInt(ctx.match[1]);
  const staffName = decodeURIComponent(ctx.match[2]);

  setState(ctx.chat.id, {
    step: "await_photo",
    eventId: state.eventId,
    eventName: state.eventName,
    eventDate: state.eventDate,
    staffId,
    staffName,
  });

  await ctx.editMessageText(
    `<b>Langkah 3 dari 3: Scan KTP</b>\n\n` +
    `Event: <b>${h(state.eventName)}</b>\n` +
    `Petugas: <b>${h(staffName)}</b>\n\n` +
    `Silakan kirim foto KTP peserta yang ingin didaftarkan.`,
    { parse_mode: "HTML" }
  );
  await ctx.answerCallbackQuery();
});

// ─── Step 3: Photo handler ────────────────────────────────────────────────────

bot.on("message:photo", async (ctx) => {
  const state = getState(ctx.chat.id);

  // Allow photo if in await_photo, or if idle (convenience: just send photo to quick-start)
  if (state.step === "idle") {
    await ctx.reply("Ketik /daftar untuk memilih event dan petugas terlebih dahulu sebelum scan KTP.");
    return;
  }
  if (state.step !== "await_photo") {
    await ctx.reply("Sedang dalam proses lain. Ketik /batal untuk membatalkan.");
    return;
  }

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
      return;
    }
    if (!ktpData.fullName) {
      await ctx.api.deleteMessage(ctx.chat.id, statusMsg.message_id);
      await ctx.reply("Gagal membaca nama. Pastikan foto KTP jelas lalu coba lagi.");
      return;
    }

    await ctx.api.deleteMessage(ctx.chat.id, statusMsg.message_id);

    const dataMsg = await ctx.reply(buildDataMessage(ktpData, state.eventName, state.staffName), {
      parse_mode: "HTML",
      reply_markup: buildDataKeyboard(),
    });

    setState(ctx.chat.id, {
      step: "await_data_confirm",
      eventId: state.eventId,
      eventName: state.eventName,
      staffId: state.staffId,
      staffName: state.staffName,
      ktpData,
      imageBase64,
      dataMessageId: dataMsg.message_id,
    });
  } catch (err) {
    console.error("Photo error:", err);
    try { await ctx.api.deleteMessage(ctx.chat.id, statusMsg.message_id); } catch {}
    await ctx.reply("Terjadi kesalahan saat membaca foto. Coba kirim ulang foto KTP.");
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
    eventId: state.eventId,
    eventName: state.eventName,
    staffId: state.staffId,
    staffName: state.staffName,
    ktpData: state.ktpData,
    imageBase64: state.imageBase64,
    field,
    dataMessageId: state.dataMessageId,
  });

  await ctx.answerCallbackQuery();
  await ctx.reply(
    `Ketik nilai baru untuk <b>${h(label)}</b>:\nNilai saat ini: <i>${h(currentVal) || "kosong"}</i>`,
    { parse_mode: "HTML" }
  );
});

// ─── Data OK → Konfirmasi akhir ───────────────────────────────────────────────

bot.callbackQuery("data_ok", async (ctx) => {
  const state = getState(ctx.chat.id);
  if (state.step !== "await_data_confirm") { await ctx.answerCallbackQuery("Sesi sudah berakhir."); return; }

  const ktp = state.ktpData;
  const confirmKb = new InlineKeyboard()
    .text("Daftarkan Sekarang", "confirm:yes").row()
    .text("Batal", "cancel");

  setState(ctx.chat.id, {
    step: "await_confirm",
    eventId: state.eventId,
    eventName: state.eventName,
    staffId: state.staffId,
    staffName: state.staffName,
    ktpData: ktp,
    imageBase64: state.imageBase64,
  });

  await ctx.editMessageText(
    `<b>Konfirmasi Pendaftaran</b>\n\n` +
    `<b>Event:</b> ${h(state.eventName)}\n` +
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
    const result = await registerParticipant({ ktpData: state.ktpData, eventId: state.eventId, staffId: state.staffId, staffName: state.staffName, imageBase64: state.imageBase64 });
    setState(ctx.chat.id, { step: "idle" });

    if (result.alreadyRegistered) {
      await ctx.editMessageText(
        `<b>${h(state.ktpData.fullName)}</b> sudah terdaftar di event ini sebelumnya.\n\nTotal event diikuti: ${result.totalEvents}\n\nKetik /daftar untuk mendaftarkan peserta lain.`,
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
        `<b>Total event diikuti:</b> ${result.totalEvents}\n\n` +
        `Ketik /daftar untuk mendaftarkan peserta berikutnya.`,
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

bot.callbackQuery("cancel", async (ctx) => {
  setState(ctx.chat.id, { step: "idle" });
  try {
    await ctx.editMessageText("Dibatalkan. Ketik /daftar untuk memulai kembali.");
  } catch {
    await ctx.reply("Dibatalkan. Ketik /daftar untuk memulai kembali.");
  }
  await ctx.answerCallbackQuery();
});

// ─── Text handler — edit field input ─────────────────────────────────────────

bot.on("message:text", async (ctx) => {
  const state = getState(ctx.chat.id);

  if (state.step === "await_edit_field") {
    const newValue = ctx.message.text.trim();
    const updatedKtp = { ...state.ktpData, [state.field]: newValue || null };

    try { await ctx.message.delete(); } catch {}

    const newState = {
      step: "await_data_confirm" as const,
      eventId: state.eventId,
      eventName: state.eventName,
      staffId: state.staffId,
      staffName: state.staffName,
      ktpData: updatedKtp,
      imageBase64: state.imageBase64,
      dataMessageId: state.dataMessageId,
    };
    setState(ctx.chat.id, newState);

    try {
      await ctx.api.editMessageText(ctx.chat.id, state.dataMessageId, buildDataMessage(updatedKtp, state.eventName, state.staffName), {
        parse_mode: "HTML",
        reply_markup: buildDataKeyboard(),
      });
    } catch {
      const msg = await ctx.reply(buildDataMessage(updatedKtp, state.eventName, state.staffName), {
        parse_mode: "HTML",
        reply_markup: buildDataKeyboard(),
      });
      setState(ctx.chat.id, { ...newState, dataMessageId: msg.message_id });
    }
    return;
  }

  if (state.step === "await_photo") {
    await ctx.reply("Tolong kirimkan <b>foto</b> KTP (bukan teks).", { parse_mode: "HTML" });
  } else if (state.step === "idle") {
    await ctx.reply("Ketik /daftar untuk memulai pendaftaran.");
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
