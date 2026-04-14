import { Router } from "express";
import { db } from "@workspace/db";
import { participantsTable, eventRegistrationsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { createWorker } from "tesseract.js";
import sharp from "sharp";

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

// ─── Image preprocessing with Sharp ──────────────────────────────────────────

async function preprocessKtpImage(imageBase64: string): Promise<{ buffer: Buffer; width: number; height: number }> {
  const inputBuffer = Buffer.from(imageBase64, "base64");

  // Auto-rotate based on EXIF orientation (fixes rotated phone photos)
  const rotated = await sharp(inputBuffer).rotate().toBuffer();
  const meta = await sharp(rotated).metadata();
  const width = meta.width ?? 800;
  const height = meta.height ?? 500;

  // Scale up to at least 1600px wide for better OCR
  const targetWidth = Math.max(width, 1600);

  const processed = await sharp(rotated)
    .resize({ width: targetWidth, kernel: sharp.kernel.lanczos3 })
    .grayscale()
    .normalize()
    .sharpen({ sigma: 1.5, m1: 1.0, m2: 2.0 })
    .linear(1.3, -20)
    .median(1)
    .png({ quality: 100 })
    .toBuffer();

  const finalMeta = await sharp(processed).metadata();
  return { buffer: processed, width: finalMeta.width ?? targetWidth, height: finalMeta.height ?? height };
}

// ─── Extra preprocessing pass for low-confidence results ─────────────────────

async function preprocessKtpImageEnhanced(imageBase64: string): Promise<{ buffer: Buffer; width: number; height: number }> {
  const inputBuffer = Buffer.from(imageBase64, "base64");
  const rotated = await sharp(inputBuffer).rotate().toBuffer();
  const meta = await sharp(rotated).metadata();
  const width = meta.width ?? 800;
  const targetWidth = Math.max(width, 2000);

  const processed = await sharp(rotated)
    .resize({ width: targetWidth, kernel: sharp.kernel.lanczos3 })
    .grayscale()
    .normalize()
    .sharpen({ sigma: 2.5, m1: 2.0, m2: 4.0 })
    .linear(1.5, -30)
    .median(1)
    .threshold(128)
    .png({ quality: 100 })
    .toBuffer();

  const finalMeta = await sharp(processed).metadata();
  return { buffer: processed, width: finalMeta.width ?? targetWidth, height: finalMeta.height ?? (meta.height ?? 500) };
}

// ─── Zone-based crop helpers ──────────────────────────────────────────────────

async function cropTextZone(buffer: Buffer, w: number, h: number): Promise<Buffer> {
  const left = Math.floor(w * 0.28);
  return sharp(buffer)
    .extract({ left, top: 0, width: w - left, height: h })
    .toBuffer();
}

async function cropNikZone(buffer: Buffer, w: number, h: number): Promise<Buffer> {
  const left = Math.floor(w * 0.28);
  const zoneH = Math.floor(h * 0.22);
  return sharp(buffer)
    .extract({ left, top: 0, width: w - left, height: zoneH })
    .sharpen({ sigma: 2, m1: 1.5, m2: 3 })
    .toBuffer();
}

// ─── KTP text parser ──────────────────────────────────────────────────────────

function parseKtpText(text: string): Record<string, string | null> {
  const raw = text.split("\n").map(l => l.trim()).filter(Boolean).join("\n");

  const find = (patterns: RegExp[]): string | null => {
    for (const re of patterns) {
      const m = raw.match(re);
      if (m?.[1]?.trim()) return m[1].trim();
    }
    return null;
  };

  const nik = find([
    /NIK\s*[:\-]?\s*(\d{14,16})/i,
    /(\d{16})/,
    /(\d{15})/,
    /(\d{14})/,
  ]);

  const fullName = find([
    /Nama\s*[:\-]?\s*([A-Z][A-Z\s'\.]{2,50})/i,
    /Name\s*[:\-]?\s*([A-Z][A-Z\s'\.]{2,50})/i,
  ]);

  const birthRaw = find([
    /Tempat\s*[\/\-]?\s*Tgl\.?\s*Lahir\s*[:\-]?\s*([A-Za-z,\s\d\-\/]+)/i,
    /Lahir\s*[:\-]?\s*([A-Za-z,\s\d\-\/]+)/i,
  ]);
  let birthPlace: string | null = null;
  let birthDate: string | null = null;
  if (birthRaw) {
    const parts = birthRaw.split(/[,\/]/);
    if (parts.length >= 2) {
      birthPlace = parts[0].trim();
      birthDate = parts.slice(1).join("-").trim();
    } else {
      birthPlace = birthRaw;
    }
  }

  const gender = find([
    /Jenis\s*Kelamin\s*[:\-]?\s*(Laki[- ]Laki|Perempuan)/i,
    /(Laki[- ]Laki|Perempuan)/i,
  ]);

  const address = find([
    /Alamat\s*[:\-]?\s*([A-Za-z0-9\s\.,\/\-\#]{5,120})/i,
  ]);

  const rtRw = find([
    /RT\s*[\/\-]?\s*RW\s*[:\-]?\s*(\d{3}\s*[\/\-]\s*\d{3})/i,
    /\b(\d{3})[\/\-](\d{3})\b/,
  ]);

  const kelurahan = find([
    /(?:Kel\.?\/Desa|Kelurahan|Desa)\s*[:\-]?\s*([A-Za-z\s]{3,50})/i,
  ]);

  const kecamatan = find([
    /Kecamatan\s*[:\-]?\s*([A-Za-z\s]{3,50})/i,
  ]);

  const city = find([
    /(?:Kab(?:upaten)?\.?|Kota)\s*[:\-]?\s*([A-Za-z\s]{3,50})/i,
  ]);

  const province = find([
    /Provinsi\s*[:\-]?\s*([A-Za-z\s]{3,50})/i,
    /(?:PROVINSI|PROV)\.?\s+([A-Za-z\s]+)/i,
  ]);

  const religion = find([
    /Agama\s*[:\-]?\s*(Islam|Kristen|Katolik|Hindu|Buddha|Konghucu)/i,
  ]);

  const maritalStatus = find([
    /Status\s*Perkawinan\s*[:\-]?\s*(Kawin|Belum Kawin|Cerai Hidup|Cerai Mati)/i,
    /Perkawinan\s*[:\-]?\s*(Kawin|Belum Kawin|Cerai)/i,
  ]);

  const occupation = find([
    /Pekerjaan\s*[:\-]?\s*([A-Za-z\s\/\-]{3,60})/i,
  ]);

  const bloodType = find([
    /Gol(?:\.?\s*Darah)?\s*[:\-]?\s*([ABO]{1,2}[+-]?)/i,
    /\b([ABO]{1,2}[+-])\b/,
  ]);

  const validUntil = find([
    /Berlaku\s*Hingga\s*[:\-]?\s*([\d\-\/]+|SEUMUR\s*HIDUP)/i,
  ]);

  const nationality = find([
    /Kewarganegaraan\s*[:\-]?\s*([A-Za-z\s]{2,25})/i,
  ]);

  return { nik, fullName, address, birthPlace, birthDate, gender, religion, maritalStatus, occupation, nationality, rtRw, kelurahan, kecamatan, province, city, bloodType, validUntil };
}

function scoreKtpData(data: Record<string, string | null>): number {
  let score = 0;
  if (data.nik) score += 40;
  if (data.fullName) score += 30;
  for (const f of ["address", "birthDate", "gender", "kecamatan", "city"]) if (data[f]) score += 5;
  for (const f of ["religion", "maritalStatus", "occupation", "bloodType"]) if (data[f]) score += 2;
  if (data.nik && !/^\d{16}$/.test(data.nik)) score -= 35;
  return Math.min(score, 100);
}

function mergeKtpData(a: Record<string, string | null>, b: Record<string, string | null>): Record<string, string | null> {
  const result = { ...a };
  for (const key of Object.keys(b)) {
    if (!result[key] && b[key]) result[key] = b[key];
    if (key === "nik" && b[key] && /^\d{16}$/.test(b[key]!) && (!result[key] || !/^\d{16}$/.test(result[key]!))) {
      result[key] = b[key];
    }
  }
  return result;
}

// ─── OCR with Tesseract ───────────────────────────────────────────────────────

async function runTesseractOcr(buffer: Buffer, worker: Awaited<ReturnType<typeof createWorker>>, width: number, height: number): Promise<{
  merged: Record<string, string | null>;
  score: number;
  rawText: string;
}> {
  await worker.setParameters({ tessedit_pageseg_mode: "6" as any });

  const { data: fullData } = await worker.recognize(buffer);
  const fullParsed = parseKtpText(fullData.text);

  const textZone = await cropTextZone(buffer, width, height);
  const { data: zoneData } = await worker.recognize(textZone);
  const zoneParsed = parseKtpText(zoneData.text);

  const nikZone = await cropNikZone(buffer, width, height);
  const { data: nikData } = await worker.recognize(nikZone);
  const nikParsed = parseKtpText(nikData.text);

  const merged = mergeKtpData(mergeKtpData(fullParsed, zoneParsed), { nik: nikParsed.nik });
  const score = scoreKtpData(merged);
  const rawText = [fullData.text, zoneData.text].join("\n---\n");

  return { merged, score, rawText };
}

async function ocrWithTesseract(imageBase64: string): Promise<{
  data: Record<string, string | null>;
  score: number;
  rawText: string;
  qualityWarning: QualityWarning;
}> {
  const inputBuffer = Buffer.from(imageBase64, "base64");
  const qualityWarning = await detectImageQuality(inputBuffer);

  const { buffer, width, height } = await preprocessKtpImage(imageBase64);

  const worker = await createWorker(["ind", "eng"], 1, {
    logger: () => {},
  });

  try {
    const { merged, score, rawText } = await runTesseractOcr(buffer, worker, width, height);

    // If score is low, try a second pass with enhanced preprocessing
    if (score < 50) {
      try {
        const enhanced = await preprocessKtpImageEnhanced(imageBase64);
        const { merged: merged2, score: score2 } = await runTesseractOcr(enhanced.buffer, worker, enhanced.width, enhanced.height);
        if (score2 > score) {
          return { data: mergeKtpData(merged, merged2), score: score2, rawText, qualityWarning };
        }
      } catch {
        // ignore enhanced pass error, use original
      }
    }

    return { data: merged, score, rawText, qualityWarning };
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
