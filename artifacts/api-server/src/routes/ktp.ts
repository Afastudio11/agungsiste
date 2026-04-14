import { Router } from "express";
import { db } from "@workspace/db";
import { participantsTable, eventRegistrationsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { createWorker } from "tesseract.js";
import sharp from "sharp";
import path from "path";
import { fileURLToPath } from "url";

const _thisDir = path.dirname(fileURLToPath(import.meta.url));
const TESSDATA_DIR = path.resolve(_thisDir, "..", "tessdata");

const router = Router();

const ScanBody = z.object({ imageBase64: z.string() });

const RegisterBody = z.object({
  eventId: z.number(),
  staffId: z.number().optional(),
  staffName: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  notes: z.string().optional(),
  tags: z.string().optional(),
  nik: z.string(),
  fullName: z.string(),
  address: z.string().optional(),
  birthPlace: z.string().optional(),
  birthDate: z.string().optional(),
  gender: z.string().optional(),
  religion: z.string().optional(),
  maritalStatus: z.string().optional(),
  occupation: z.string().optional(),
  nationality: z.string().optional(),
  rtRw: z.string().optional(),
  kelurahan: z.string().optional(),
  kecamatan: z.string().optional(),
  province: z.string().optional(),
  city: z.string().optional(),
  bloodType: z.string().optional(),
});

// ─── Quality detection ────────────────────────────────────────────────────────

type QualityWarning = "dark" | "overexposed" | "blurry" | "low_contrast" | null;

async function detectImageQuality(buffer: Buffer): Promise<QualityWarning> {
  try {
    const stats = await sharp(buffer).grayscale().stats();
    const mean = stats.channels[0].mean;
    const stdev = stats.channels[0].stdev;
    if (mean < 35) return "dark";
    if (mean > 230) return "overexposed";
    if (stdev < 12) return "blurry";
    if (stdev < 20) return "low_contrast";
    return null;
  } catch {
    return null;
  }
}

// ─── Deskew: find rotation angle via horizontal projection variance ─────────
// Technique adapted from arakattack/ocr-ktp (scipy.ndimage projection approach)

async function detectSkewAngle(grayscaleBuffer: Buffer): Promise<number> {
  const ANALYSIS_W = 300;
  const { data, info } = await sharp(grayscaleBuffer)
    .resize({ width: ANALYSIS_W, kernel: "nearest" })
    .threshold(128)
    .raw()
    .toBuffer({ resolveWithObject: true });

  const w = info.width;
  const h = info.height;
  const cx = w / 2;
  const cy = h / 2;

  let bestAngle = 0;
  let bestScore = -Infinity;

  for (let deg = -15; deg <= 15; deg += 1) {
    const rad = (deg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const projH = new Float32Array(h + 40).fill(0);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (data[y * w + x] > 128) continue;
        const ry = Math.round(sin * (x - cx) + cos * (y - cy) + cy + 20);
        if (ry >= 0 && ry < projH.length) projH[ry]++;
      }
    }

    let mean = 0;
    for (let i = 0; i < projH.length; i++) mean += projH[i];
    mean /= projH.length;
    let variance = 0;
    for (let i = 0; i < projH.length; i++) variance += (projH[i] - mean) ** 2;

    if (variance > bestScore) {
      bestScore = variance;
      bestAngle = deg;
    }
  }

  return bestAngle;
}

// ─── Image preprocessing ──────────────────────────────────────────────────────

async function basePreprocess(inputBuffer: Buffer, targetWidth: number): Promise<Buffer> {
  return sharp(inputBuffer)
    .rotate()
    .resize({ width: targetWidth, kernel: sharp.kernel.lanczos3 })
    .grayscale()
    .normalize()
    .toBuffer();
}

async function preprocessVariant(
  base: Buffer,
  variant: "normal" | "contrast" | "threshold"
): Promise<Buffer> {
  let chain = sharp(base);
  if (variant === "normal") {
    chain = chain.sharpen({ sigma: 1.5, m1: 1.0, m2: 2.0 }).linear(1.25, -15);
  } else if (variant === "contrast") {
    chain = chain.sharpen({ sigma: 2.5, m1: 2.0, m2: 4.0 }).linear(1.6, -35);
  } else {
    chain = chain.sharpen({ sigma: 2.0, m1: 1.5, m2: 3.0 }).linear(1.5, -25).threshold(135);
  }
  return chain.png({ quality: 100 }).toBuffer();
}

async function preprocessKtpImage(imageBase64: string): Promise<{
  buffers: { normal: Buffer; contrast: Buffer; threshold: Buffer };
  width: number;
  height: number;
}> {
  const inputBuffer = Buffer.from(imageBase64, "base64");
  const rotated = await sharp(inputBuffer).rotate().toBuffer();
  const meta = await sharp(rotated).metadata();
  const origW = meta.width ?? 800;
  const targetWidth = Math.max(origW, 1800);

  const base = await basePreprocess(inputBuffer, targetWidth);
  const baseMeta = await sharp(base).metadata();
  const w = baseMeta.width ?? targetWidth;
  const h = baseMeta.height ?? 500;

  // Auto-deskew: find and correct skew angle
  const angle = await detectSkewAngle(base);
  let deskewed = base;
  if (Math.abs(angle) > 0.5) {
    deskewed = await sharp(base).rotate(-angle, { background: { r: 255, g: 255, b: 255, alpha: 1 } }).toBuffer();
  }

  const [normal, contrast, threshold] = await Promise.all([
    preprocessVariant(deskewed, "normal"),
    preprocessVariant(deskewed, "contrast"),
    preprocessVariant(deskewed, "threshold"),
  ]);

  return { buffers: { normal, contrast, threshold }, width: w, height: h };
}

// ─── Character correction (inspired by arakattack/ocr-ktp) ───────────────────

function correctNik(raw: string): string {
  return raw
    .replace(/[Il|!)(lL]/g, "1")
    .replace(/[oO]/g, "0")
    .replace(/[bB]/g, match => {
      // 'B' at start of NIK is likely 8, but in context check
      return "8";
    })
    .replace(/[Dq]/g, "0")
    .replace(/[S]/g, "5")
    .replace(/[?]/g, "7")
    .replace(/[Gg]/g, "9")
    .replace(/[Zz]/g, "2")
    .replace(/\s/g, "");
}

function extractNik(text: string): string | null {
  const cleaned = text.replace(/\n/g, " ");

  // Direct regex on raw text
  const patterns = [
    /NIK\s*[:\-]?\s*([\d\s]{14,19})/i,
    /\b(\d{16})\b/,
    /\b(\d{15})\b/,
    /\b(\d{14})\b/,
  ];
  for (const re of patterns) {
    const m = cleaned.match(re);
    if (m?.[1]) {
      const nik = m[1].replace(/\s/g, "");
      if (/^\d{14,16}$/.test(nik)) return nik.padEnd(16, "0").substring(0, 16);
    }
  }

  // Try correcting OCR errors in near-NIK sequences (15-18 char alphanumeric blocks)
  const candidates = cleaned.match(/[0-9IlOoBbDSGgZz?|!()Ll]{14,18}/g) ?? [];
  for (const c of candidates) {
    const fixed = correctNik(c);
    if (/^\d{16}$/.test(fixed)) return fixed;
    if (/^\d{15}$/.test(fixed)) return fixed + "0";
    if (/^\d{14}$/.test(fixed)) return fixed + "00";
  }

  return null;
}

// ─── KTP text parser ──────────────────────────────────────────────────────────

function parseKtpText(text: string): Record<string, string | null> {
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  const raw = lines.join("\n");

  const find = (patterns: RegExp[]): string | null => {
    for (const re of patterns) {
      for (const line of lines) {
        const m = line.match(re);
        if (m?.[1]?.trim()) return m[1].trim();
      }
      const m = raw.match(re);
      if (m?.[1]?.trim()) return m[1].trim();
    }
    return null;
  };

  const nik = extractNik(raw);

  // Name: after "Nama" label, all caps 2-50 chars
  const fullName = find([
    /^Nama\s*[:\-]?\s*(.+)$/im,
    /Nama\s*[:\-]?\s*([A-Z][A-Z\s'\.]{2,50})/i,
  ]);

  // Birth place/date
  const birthRaw = find([
    /^Tempat\s*[\/\-\s]?\s*Tgl\.?\s*Lahir\s*[:\-]?\s*(.+)$/im,
    /Lahir\s*[:\-]?\s*([A-Za-z,\s\d\-\/\.]+)/i,
  ]);
  let birthPlace: string | null = null;
  let birthDate: string | null = null;
  if (birthRaw) {
    const parts = birthRaw.split(/[,\/]/);
    if (parts.length >= 2) {
      birthPlace = parts[0].trim().toUpperCase();
      const dateStr = parts.slice(1).join("/").trim();
      const dateMatch = dateStr.match(/(\d{1,2})[-\/\.](\d{1,2})[-\/\.](\d{4})/);
      if (dateMatch) {
        birthDate = `${dateMatch[1].padStart(2, "0")}-${dateMatch[2].padStart(2, "0")}-${dateMatch[3]}`;
      } else {
        birthDate = dateStr;
      }
    } else {
      birthPlace = birthRaw.toUpperCase();
    }
  }

  // Gender: allow OCR noise in label
  const genderLine = lines.find(l => /jenis\s*kel/i.test(l));
  let gender: string | null = null;
  if (genderLine) {
    if (/laki/i.test(genderLine)) gender = "LAKI-LAKI";
    else if (/perem/i.test(genderLine)) gender = "PEREMPUAN";
  }
  if (!gender) {
    if (/\bLAKI[- ]LAKI\b/i.test(raw)) gender = "LAKI-LAKI";
    else if (/\bPEREMPUAN\b/i.test(raw)) gender = "PEREMPUAN";
  }

  const address = find([
    /^Alamat\s*[:\-]?\s*(.+)$/im,
    /Alamat\s*[:\-]?\s*([A-Za-z0-9\s\.,\/\-\#]{5,120})/i,
  ]);

  const rtRw = find([
    /RT\s*[\/\-\s]?\s*RW\s*[:\-]?\s*(\d{1,3}\s*[\/\-]\s*\d{1,3})/i,
    /\b(\d{3})\s*[\/\-]\s*(\d{3})\b/,
  ]);

  const kelurahan = find([
    /(?:Kel\.?\s*\/?\s*Desa|Kelurahan|Desa)\s*[:\-]?\s*([A-Za-z\s]{3,50})/i,
  ]);

  const kecamatan = find([
    /Kecamatan\s*[:\-]?\s*([A-Za-z\s]{3,50})/i,
  ]);

  // City/Kabupaten — KTP header has "KABUPATEN X" or "KOTA X"
  const city = find([
    /(?:KABUPATEN|KOTA)\s+([A-Z][A-Za-z\s]{2,40})/,
    /(?:Kab(?:upaten)?\.?|Kota)\s*[:\-]?\s*([A-Za-z\s]{3,50})/i,
  ]);

  const province = find([
    /^PROVINSI\s+(.+)$/im,
    /Provinsi\s*[:\-]?\s*([A-Za-z\s]{3,50})/i,
    /PROV(?:INSI)?\s+([A-Z][A-Za-z\s]+)/i,
  ]);

  const religion = find([
    /Agama\s*[:\-]?\s*(Islam|Kristen|Katolik|Hindu|Buddha|Konghucu)/i,
    /\b(Islam|Kristen|Katolik|Hindu|Buddha|Konghucu)\b/i,
  ]);

  const maritalStatus = find([
    /(?:Status\s*)?Perkawinan\s*[:\-]?\s*(Kawin|Belum\s*Kawin|Cerai\s*Hidup|Cerai\s*Mati)/i,
    /\b(KAWIN|BELUM KAWIN|CERAI HIDUP|CERAI MATI)\b/i,
  ]);

  const occupation = find([
    /Pekerjaan\s*[:\-]?\s*([A-Za-z\s\/\-\.]{3,60})/i,
  ]);

  const bloodType = find([
    /Gol(?:\.?\s*Darah)?\s*[:\-]?\s*([ABO]{1,2}[+-]?)/i,
    /\b([ABO]{1,2}[+-])\b/,
  ]);

  const validUntil = find([
    /Berlaku\s*Hingga\s*[:\-]?\s*([\d\-\/]+|SEUMUR\s*HIDUP)/i,
    /\b(SEUMUR\s*HIDUP)\b/i,
  ]);

  const nationality = find([
    /Kewarganegaraan\s*[:\-]?\s*([A-Za-z\s]{2,25})/i,
    /\b(WNI|WNA)\b/i,
  ]);

  return {
    nik, fullName, address, birthPlace, birthDate,
    gender, religion, maritalStatus, occupation, nationality,
    rtRw, kelurahan, kecamatan, province, city, bloodType, validUntil,
  };
}

function scoreKtpData(data: Record<string, string | null>): number {
  let score = 0;
  if (data.nik && /^\d{16}$/.test(data.nik)) score += 40;
  else if (data.nik && /^\d{14,15}$/.test(data.nik)) score += 20;
  if (data.fullName) score += 25;
  if (data.birthDate) score += 5;
  if (data.birthPlace) score += 3;
  if (data.gender) score += 4;
  if (data.address) score += 5;
  if (data.kecamatan) score += 4;
  if (data.city) score += 4;
  if (data.province) score += 2;
  if (data.religion) score += 2;
  if (data.maritalStatus) score += 2;
  if (data.occupation) score += 2;
  if (data.bloodType) score += 2;
  return Math.min(score, 100);
}

function mergeKtpData(
  a: Record<string, string | null>,
  b: Record<string, string | null>
): Record<string, string | null> {
  const result = { ...a };
  for (const key of Object.keys(b)) {
    if (!result[key] && b[key]) result[key] = b[key];
    if (key === "nik" && b[key]) {
      const bValid = /^\d{16}$/.test(b[key]!);
      const aValid = result[key] && /^\d{16}$/.test(result[key]!);
      if (bValid && !aValid) result[key] = b[key];
    }
  }
  return result;
}

// ─── Zone-based crops for specific fields ────────────────────────────────────
// KTP standard layout: photo ~30% left, text 70% right
// Field rows (approx % of total height):
//   Header(prov/kab): 0-15, NIK: 15-25, Nama: 25-35, TTL: 35-48,
//   JK+Gol: 48-55, Alamat: 55-68, RT/RW: 68-74, Kel: 74-80,
//   Kec: 80-85, Agama: 85-90, Kawin: 90-95, Kerja: 95-100

type FieldZone = { top: number; bottom: number; left: number; right: number };

const KTP_ZONES: Record<string, FieldZone> = {
  header:    { top: 0,   bottom: 0.17, left: 0,    right: 1   },
  nik:       { top: 0.14,bottom: 0.27, left: 0.28, right: 1   },
  nama:      { top: 0.26,bottom: 0.37, left: 0.28, right: 1   },
  ttl:       { top: 0.36,bottom: 0.50, left: 0.28, right: 1   },
  jk:        { top: 0.48,bottom: 0.58, left: 0.28, right: 0.65},
  goldar:    { top: 0.48,bottom: 0.58, left: 0.65, right: 1   },
  alamat:    { top: 0.56,bottom: 0.72, left: 0.28, right: 1   },
  rtrw:      { top: 0.68,bottom: 0.76, left: 0.28, right: 1   },
  keldesa:   { top: 0.74,bottom: 0.82, left: 0.28, right: 1   },
  kecamatan: { top: 0.80,bottom: 0.88, left: 0.28, right: 1   },
  agama:     { top: 0.83,bottom: 0.90, left: 0.28, right: 0.75},
  kawin:     { top: 0.87,bottom: 0.95, left: 0.28, right: 1   },
  pekerjaan: { top: 0.92,bottom: 1.00, left: 0.28, right: 1   },
};

async function cropZone(buffer: Buffer, w: number, h: number, zone: FieldZone): Promise<Buffer> {
  const left = Math.max(0, Math.floor(zone.left * w));
  const top = Math.max(0, Math.floor(zone.top * h));
  const width = Math.min(w - left, Math.floor((zone.right - zone.left) * w));
  const height = Math.min(h - top, Math.floor((zone.bottom - zone.top) * h));
  if (width < 10 || height < 5) return buffer;
  return sharp(buffer).extract({ left, top, width, height }).png().toBuffer();
}

// ─── OCR orchestration ────────────────────────────────────────────────────────

async function runAllOcr(
  buffers: { normal: Buffer; contrast: Buffer; threshold: Buffer },
  w: number,
  h: number,
  worker: Awaited<ReturnType<typeof createWorker>>
): Promise<{ merged: Record<string, string | null>; score: number }> {
  const results: Record<string, string | null>[] = [];

  // 1. Full image — PSM 6 (uniform block)
  await worker.setParameters({ tessedit_pageseg_mode: "6" as any });
  for (const buf of [buffers.normal, buffers.contrast]) {
    const { data } = await worker.recognize(buf);
    results.push(parseKtpText(data.text));
  }

  // 2. Full image — PSM 11 (sparse text, best for real-world photos)
  await worker.setParameters({ tessedit_pageseg_mode: "11" as any });
  const { data: sparse } = await worker.recognize(buffers.normal);
  results.push(parseKtpText(sparse.text));
  const { data: sparseCont } = await worker.recognize(buffers.contrast);
  results.push(parseKtpText(sparseCont.text));

  // 3. Per-zone crops — PSM 7 (single line) for individual field strips
  await worker.setParameters({ tessedit_pageseg_mode: "7" as any });
  const zoneResults: Record<string, string | null> = {
    nik: null, fullName: null, birthPlace: null, birthDate: null,
    gender: null, bloodType: null, address: null, rtRw: null,
    kelurahan: null, kecamatan: null, city: null, province: null,
    religion: null, maritalStatus: null, occupation: null, nationality: null, validUntil: null,
  };

  const zoneEntries = Object.entries(KTP_ZONES);
  for (const [zoneName, zone] of zoneEntries) {
    const crop = await cropZone(buffers.normal, w, h, zone);
    const cropContrast = await cropZone(buffers.contrast, w, h, zone);

    for (const cropBuf of [crop, cropContrast]) {
      const { data } = await worker.recognize(cropBuf);
      const parsed = parseKtpText(data.text);

      if (zoneName === "nik" && parsed.nik) {
        if (!zoneResults.nik || (/^\d{16}$/.test(parsed.nik) && !/^\d{16}$/.test(zoneResults.nik ?? ""))) {
          zoneResults.nik = parsed.nik;
        }
      }
      if (zoneName === "nama" && parsed.fullName && !zoneResults.fullName) zoneResults.fullName = parsed.fullName;
      if (zoneName === "ttl") {
        if (parsed.birthPlace && !zoneResults.birthPlace) zoneResults.birthPlace = parsed.birthPlace;
        if (parsed.birthDate && !zoneResults.birthDate) zoneResults.birthDate = parsed.birthDate;
      }
      if (zoneName === "jk" && parsed.gender && !zoneResults.gender) zoneResults.gender = parsed.gender;
      if (zoneName === "goldar" && parsed.bloodType && !zoneResults.bloodType) zoneResults.bloodType = parsed.bloodType;
      if (zoneName === "alamat" && parsed.address && !zoneResults.address) zoneResults.address = parsed.address;
      if (zoneName === "rtrw" && parsed.rtRw && !zoneResults.rtRw) zoneResults.rtRw = parsed.rtRw;
      if (zoneName === "keldesa" && parsed.kelurahan && !zoneResults.kelurahan) zoneResults.kelurahan = parsed.kelurahan;
      if (zoneName === "kecamatan" && parsed.kecamatan && !zoneResults.kecamatan) zoneResults.kecamatan = parsed.kecamatan;
      if (zoneName === "header") {
        if (parsed.city && !zoneResults.city) zoneResults.city = parsed.city;
        if (parsed.province && !zoneResults.province) zoneResults.province = parsed.province;
      }
      if (zoneName === "agama" && parsed.religion && !zoneResults.religion) zoneResults.religion = parsed.religion;
      if (zoneName === "kawin" && parsed.maritalStatus && !zoneResults.maritalStatus) zoneResults.maritalStatus = parsed.maritalStatus;
      if (zoneName === "pekerjaan" && parsed.occupation && !zoneResults.occupation) zoneResults.occupation = parsed.occupation;
    }
  }
  results.push(zoneResults);

  // Merge all results, preferring non-null values
  let merged = results[0];
  for (const r of results.slice(1)) {
    merged = mergeKtpData(merged, r);
  }

  const score = scoreKtpData(merged);
  return { merged, score };
}

// ─── Main OCR entry ───────────────────────────────────────────────────────────

async function ocrWithTesseract(imageBase64: string): Promise<{
  data: Record<string, string | null>;
  score: number;
  qualityWarning: QualityWarning;
}> {
  const inputBuffer = Buffer.from(imageBase64, "base64");
  const qualityWarning = await detectImageQuality(inputBuffer);

  const { buffers, width, height } = await preprocessKtpImage(imageBase64);

  const worker = await createWorker(["ind", "eng"], 1, {
    logger: () => {},
    langPath: TESSDATA_DIR,
    gzip: true,
  });

  try {
    const { merged, score } = await runAllOcr(buffers, width, height, worker);
    return { data: merged, score, qualityWarning };
  } finally {
    await worker.terminate();
  }
}

// ─── Main scan endpoint ───────────────────────────────────────────────────────

router.post("/scan", async (req, res) => {
  try {
    const { imageBase64 } = ScanBody.parse(req.body);
    const { data, score, qualityWarning } = await ocrWithTesseract(imageBase64);
    const lowConfidence = score < 65;
    req.log.info({ score, qualityWarning, lowConfidence }, "KTP scan via Tesseract OCR");
    return res.json({
      ...data,
      _meta: { tesseractScore: score, qualityWarning, lowConfidence },
    });
  } catch (err) {
    req.log.error({ err }, "Error scanning KTP");
    return res.status(500).json({ error: "Gagal membaca KTP" });
  }
});

// ─── Register endpoint ────────────────────────────────────────────────────────

router.post("/register", async (req, res) => {
  try {
    const body = RegisterBody.parse(req.body);
    const { eventId, staffId, staffName, phone, email, notes, tags, nik, fullName, ...rest } = body;

    let participant = await db.query.participantsTable.findFirst({
      where: eq(participantsTable.nik, nik),
    });

    const isNewParticipant = !participant;

    if (!participant) {
      const [p] = await db.insert(participantsTable).values({ nik, fullName, ...rest }).returning();
      participant = p;
    } else {
      await db.update(participantsTable)
        .set({ fullName, ...rest, updatedAt: new Date() })
        .where(eq(participantsTable.id, participant.id));
    }

    const existing = await db.query.eventRegistrationsTable.findFirst({
      where: (t, { and, eq }) => and(eq(t.eventId, eventId), eq(t.participantId, participant!.id)),
    });

    const totalEventsJoined = await db.$count(
      eventRegistrationsTable,
      eq(eventRegistrationsTable.participantId, participant.id)
    );

    if (existing) {
      return res.status(409).json({
        error: "Peserta sudah terdaftar di event ini",
        nik, eventId, totalEventsJoined,
      });
    }

    const [registration] = await db.insert(eventRegistrationsTable).values({
      eventId, participantId: participant.id,
      staffName: staffName ?? null, staffId: staffId ?? null,
      phone: phone ?? null, email: email ?? null,
      notes: notes ?? null, tags: tags ?? null,
    }).returning();

    return res.status(201).json({
      success: true,
      participantId: participant.id,
      registrationId: registration.id,
      isNewParticipant,
      totalEventsJoined: totalEventsJoined + 1,
      message: isNewParticipant
        ? "Peserta baru berhasil didaftarkan"
        : `Peserta berhasil didaftarkan. Total event: ${totalEventsJoined + 1}`,
    });
  } catch (err) {
    req.log.error({ err }, "Error registering KTP");
    return res.status(400).json({ error: "Data tidak valid" });
  }
});

export default router;
