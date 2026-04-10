import { Router } from "express";
import { db } from "@workspace/db";
import { participantsTable, eventRegistrationsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import OpenAI from "openai";
import { createWorker } from "tesseract.js";
import sharp from "sharp";

const router = Router();

const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
});

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

// ─── Image preprocessing with Sharp ─────────────────────────────────────────

async function preprocessKtpImage(imageBase64: string): Promise<Buffer> {
  const inputBuffer = Buffer.from(imageBase64, "base64");

  const meta = await sharp(inputBuffer).metadata();
  const width = meta.width ?? 800;

  // Scale up small images for better OCR accuracy
  const targetWidth = Math.max(width, 1600);

  const processed = await sharp(inputBuffer)
    // Scale up if needed
    .resize({ width: targetWidth, kernel: sharp.kernel.lanczos3 })
    // Convert to grayscale
    .grayscale()
    // Normalize contrast (stretch histogram)
    .normalize()
    // Sharpen text edges
    .sharpen({ sigma: 1.5, m1: 1.0, m2: 2.0 })
    // Boost contrast further with linear adjustment
    .linear(1.3, -20)
    // Denoise slightly
    .median(1)
    // Output as high-quality PNG for OCR
    .png({ quality: 100 })
    .toBuffer();

  return processed;
}

// ─── Tesseract OCR helper ────────────────────────────────────────────────────

function parseKtpText(text: string): Record<string, string | null> {
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  const raw = lines.join("\n");

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
    /(\d{14,15})/,
  ]);

  const fullName = find([
    /Nama\s*[:\-]?\s*([A-Z][A-Z\s'\.]{2,40})/i,
    /Name\s*[:\-]?\s*([A-Z][A-Z\s'\.]{2,40})/i,
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
    /Alamat\s*[:\-]?\s*([A-Za-z0-9\s\.,\/\-\#]{5,80})/i,
  ]);

  const rtRw = find([
    /RT\s*[\/\-]?\s*RW\s*[:\-]?\s*(\d{3}\s*[\/\-]\s*\d{3})/i,
    /(\d{3})[\/\-](\d{3})/,
  ]);

  const kelurahan = find([
    /(?:Kel\.?\/Desa|Kelurahan|Desa)\s*[:\-]?\s*([A-Za-z\s]{3,40})/i,
  ]);

  const kecamatan = find([
    /Kecamatan\s*[:\-]?\s*([A-Za-z\s]{3,40})/i,
  ]);

  const city = find([
    /(?:Kab(?:upaten)?\.?|Kota)\s*[:\-]?\s*([A-Za-z\s]{3,40})/i,
  ]);

  const province = find([
    /Provinsi\s*[:\-]?\s*([A-Za-z\s]{3,40})/i,
    /(?:PROVINSI|PROV)\s+([A-Za-z\s]+)/i,
  ]);

  const religion = find([
    /Agama\s*[:\-]?\s*(Islam|Kristen|Katolik|Hindu|Buddha|Konghucu)/i,
  ]);

  const maritalStatus = find([
    /Status\s*Perkawinan\s*[:\-]?\s*(Kawin|Belum Kawin|Cerai Hidup|Cerai Mati)/i,
    /Perkawinan\s*[:\-]?\s*(Kawin|Belum Kawin|Cerai)/i,
  ]);

  const occupation = find([
    /Pekerjaan\s*[:\-]?\s*([A-Za-z\s\/\-]{3,50})/i,
  ]);

  const bloodType = find([
    /Gol(?:\.?\s*Darah)?\s*[:\-]?\s*([ABO]{1,2}[+-]?)/i,
    /\b([ABO]{1,2}[+-])\b/,
  ]);

  const validUntil = find([
    /Berlaku\s*Hingga\s*[:\-]?\s*([\d\-\/]+|SEUMUR\s*HIDUP)/i,
  ]);

  const nationality = find([
    /Kewarganegaraan\s*[:\-]?\s*([A-Za-z\s]{2,20})/i,
  ]);

  return {
    nik,
    fullName,
    address,
    birthPlace,
    birthDate,
    gender,
    religion,
    maritalStatus,
    occupation,
    nationality,
    rtRw,
    kelurahan,
    kecamatan,
    province,
    city,
    bloodType,
    validUntil,
  };
}

function scoreKtpData(data: Record<string, string | null>): number {
  const critical = ["nik", "fullName"];
  const important = ["address", "birthDate", "gender", "kecamatan", "city"];
  const bonus = ["religion", "maritalStatus", "occupation", "bloodType"];

  let score = 0;
  for (const f of critical) if (data[f]) score += 40;
  for (const f of important) if (data[f]) score += 8;
  for (const f of bonus) if (data[f]) score += 2;

  // NIK must be exactly 16 digits
  if (data.nik && !/^\d{16}$/.test(data.nik)) score -= 30;

  return Math.min(score, 100);
}

async function ocrWithTesseract(
  imageBase64: string
): Promise<{ data: Record<string, string | null>; score: number; rawText: string }> {
  // Preprocess image first for better accuracy
  const processedBuffer = await preprocessKtpImage(imageBase64);

  const worker = await createWorker(["ind", "eng"], 1, {
    workerPath: undefined,
    langPath: undefined,
    corePath: undefined,
    logger: () => {},
  });

  try {
    await worker.setParameters({
      tessedit_pageseg_mode: "6" as any, // Assume uniform block of text
    });

    const { data } = await worker.recognize(processedBuffer);
    const parsed = parseKtpText(data.text);
    const score = scoreKtpData(parsed);

    return { data: parsed, score, rawText: data.text };
  } finally {
    await worker.terminate();
  }
}

async function ocrWithLLM(
  imageBase64: string,
  rawText?: string
): Promise<Record<string, string | null>> {
  const contextHint = rawText
    ? `\n\nBelow is a partial OCR result from Tesseract (may have errors, use as hint only):\n${rawText.substring(0, 800)}`
    : "";

  const response = await openai.chat.completions.create({
    model: "gpt-5.2",
    max_completion_tokens: 2000,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Extract all data from this Indonesian KTP (Identity Card) image. Return ONLY a valid JSON object with these exact fields (use null if not found):
{
  "nik": string or null,
  "fullName": string or null,
  "address": string or null,
  "birthPlace": string or null,
  "birthDate": string or null,
  "gender": string or null,
  "religion": string or null,
  "maritalStatus": string or null,
  "occupation": string or null,
  "nationality": string or null,
  "rtRw": string or null,
  "kelurahan": string or null,
  "kecamatan": string or null,
  "province": string or null,
  "city": string or null,
  "bloodType": string or null,
  "validUntil": string or null
}
Return only the JSON, no explanation, no markdown.${contextHint}`,
          },
          {
            type: "image_url",
            image_url: { url: `data:image/jpeg;base64,${imageBase64}`, detail: "high" },
          },
        ],
      },
    ],
  });

  const content = response.choices[0]?.message?.content ?? "{}";
  try {
    return JSON.parse(content.replace(/```json\n?|```/g, "").trim());
  } catch {
    return {};
  }
}

// ─── Main scan endpoint ───────────────────────────────────────────────────────

router.post("/scan", async (req, res) => {
  try {
    const { imageBase64 } = ScanBody.parse(req.body);

    // Stage 1: Try Tesseract.js (free, no API call)
    let ktpData: Record<string, string | null> = {};
    let usedLLM = false;
    let tesseractScore = 0;

    try {
      const { data, score, rawText } = await ocrWithTesseract(imageBase64);
      tesseractScore = score;

      if (score >= 70) {
        // Tesseract succeeded — use result directly
        ktpData = data;
        req.log.info({ score }, "KTP scan via Tesseract.js");
      } else {
        // Score too low — fall back to LLM with raw text as hint
        req.log.info({ score }, "Tesseract score low, falling back to LLM");
        ktpData = await ocrWithLLM(imageBase64, rawText);
        usedLLM = true;
      }
    } catch (tessErr) {
      req.log.warn({ tessErr }, "Tesseract failed, falling back to LLM");
      ktpData = await ocrWithLLM(imageBase64);
      usedLLM = true;
    }

    return res.json({ ...ktpData, _meta: { usedLLM, tesseractScore } });
  } catch (err) {
    req.log.error({ err }, "Error scanning KTP");
    return res.status(500).json({ error: "Failed to scan KTP" });
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
      staffName: staffName ?? null,
      staffId: staffId ?? null,
      phone: phone ?? null,
      email: email ?? null,
      notes: notes ?? null,
      tags: tags ?? null,
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
