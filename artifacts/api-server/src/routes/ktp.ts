import { Router } from "express";
import { db } from "@workspace/db";
import { participantsTable, eventRegistrationsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { createWorker } from "tesseract.js";
import type { Word } from "tesseract.js";
import sharp from "sharp";
import path from "path";
import { fileURLToPath } from "url";

const _thisDir = path.dirname(fileURLToPath(import.meta.url));
const TESSDATA_DIR = path.resolve(_thisDir, "..", "tessdata");

const router = Router();

// ─── Dual persistent workers for parallel OCR passes ──────────────────────────
type TessWorker = Awaited<ReturnType<typeof createWorker>>;

const workers: { a: TessWorker | null; b: TessWorker | null } = { a: null, b: null };
const workerInits: { a: Promise<TessWorker> | null; b: Promise<TessWorker> | null } = { a: null, b: null };

function initWorker(key: "a" | "b"): Promise<TessWorker> {
  if (workers[key]) return Promise.resolve(workers[key]!);
  if (workerInits[key]) return workerInits[key]!;
  workerInits[key] = createWorker(["ind", "eng"], 1, {
    logger: () => {},
    langPath: TESSDATA_DIR,
    gzip: true,
  }).then(w => {
    workers[key] = w;
    workerInits[key] = null;
    return w;
  }).catch(err => {
    workerInits[key] = null;
    throw err;
  });
  return workerInits[key]!;
}

initWorker("a").catch(() => {});
initWorker("b").catch(() => {});

let _scanChain: Promise<unknown> = Promise.resolve();

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

// ─── Lean preprocessing (no deskew, adaptive resolution) ──────────────────────

async function preprocessKtpImage(imageBase64: string): Promise<{
  normal: Buffer;
  enhanced: Buffer;
}> {
  const inputBuf = Buffer.from(imageBase64, "base64");
  const rotated = await sharp(inputBuf).rotate().toBuffer();
  const meta = await sharp(rotated).metadata();
  const origW = meta.width ?? 800;

  // 1200px is fast + accurate for most phone photos. Cap at 1400 for small images.
  const targetW = origW < 800 ? 1400 : 1200;

  const base = await sharp(rotated)
    .resize({ width: targetW, kernel: sharp.kernel.lanczos2 })
    .grayscale()
    .normalize()
    .toBuffer();

  const [normal, enhanced] = await Promise.all([
    sharp(base).sharpen({ sigma: 1.2 }).linear(1.2, -10).png().toBuffer(),
    sharp(base).sharpen({ sigma: 2.0 }).linear(1.5, -25).png().toBuffer(),
  ]);

  return { normal, enhanced };
}

// ─── Word-confidence filtering ────────────────────────────────────────────────

function filterByConfidence(words: Word[] | undefined, rawText: string, minConf = 30): string {
  if (!words?.length) return rawText;

  const lineMap = new Map<number, string[]>();
  for (const word of words) {
    if (word.confidence < minConf || !word.text.trim()) continue;
    const lineKey = Math.round(word.bbox.y0 / 16);
    if (!lineMap.has(lineKey)) lineMap.set(lineKey, []);
    lineMap.get(lineKey)!.push(word.text);
  }

  const filtered = [...lineMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, ws]) => ws.join(" "))
    .join("\n");

  return filtered.trim() ? filtered : rawText;
}

// ─── NIK extraction ──────────────────────────────────────────────────────────

const OCR_DIGIT_MAP: Record<string, string[]> = {
  I: ["1"], i: ["1"], l: ["1"], "|": ["1"], "!": ["1"],
  ")": ["1"], "(": ["1"], "[": ["1"], "]": ["1"],
  L: ["1", "6"], O: ["0"], o: ["0"], D: ["0"], Q: ["0"], q: ["0"],
  B: ["8"], S: ["5"], s: ["5"], G: ["9", "6"],
  Z: ["2"], z: ["2"], "?": ["7"], b: ["6"],
  Y: ["4", "7"], A: ["4"], h: ["4"], T: ["7", "1"],
};

const NIK_CHARS_RE = /[0-9IilOoBbDSGZqQzY?|!()\[\]LAhT]{14,18}/g;

function correctNikWithMap(raw: string, choices: number[] = []): string {
  const result: string[] = [];
  let ambIdx = 0;
  for (const ch of raw.replace(/\s/g, "")) {
    const opts = OCR_DIGIT_MAP[ch];
    if (!opts) {
      if (/\d/.test(ch)) result.push(ch);
      else return "X".repeat(20);
    } else if (opts.length === 1) {
      result.push(opts[0]);
    } else {
      const choice = choices[ambIdx] ?? 0;
      result.push(opts[Math.min(choice, opts.length - 1)]);
      ambIdx++;
    }
  }
  return result.join("");
}

function extractNik(text: string): string | null {
  const flat = text.replace(/\n/g, " ");

  const seq16 = flat.match(/\b(\d{16})\b/);
  if (seq16) return seq16[1];

  const singleSep = flat.match(/(\d{6,})[.\-](\d{6,})/);
  if (singleSep) {
    const joined = singleSep[1] + singleSep[2];
    if (/^\d{16}$/.test(joined)) return joined;
  }

  const labeled = flat.match(/NIK\s*[:\-]?\s*([0-9IilOoBbDSGZqQzY?|!()\[\]LAhT\s]{14,20})/i);
  if (labeled) {
    for (let c0 = 0; c0 < 3; c0++)
      for (let c1 = 0; c1 < 3; c1++) {
        const fixed = correctNikWithMap(labeled[1], [c0, c1]);
        if (/^\d{16}$/.test(fixed)) return fixed;
      }
  }

  const candidates = flat.match(NIK_CHARS_RE) ?? [];
  for (const c of candidates) {
    for (let c0 = 0; c0 < 3; c0++)
      for (let c1 = 0; c1 < 3; c1++) {
        const fixed = correctNikWithMap(c, [c0, c1]);
        if (/^\d{16}$/.test(fixed)) return fixed;
      }
  }

  // Last resort: find 16-digit segments only near NIK label context
  const nikLabelIdx = flat.search(/NIK/i);
  if (nikLabelIdx >= 0) {
    const nearby = flat.substring(nikLabelIdx, nikLabelIdx + 60);
    const longDigits = nearby.match(/\d{14,18}/g) ?? [];
    for (const seg of longDigits) {
      if (seg.length >= 16) {
        for (let i = 0; i <= seg.length - 16; i++) {
          const sub = seg.substring(i, i + 16);
          if (validateNik(sub)) return sub;
        }
      }
    }
  }

  return null;
}

function validateNik(nik: string | null): string | null {
  if (!nik) return null;
  if (!/^\d{16}$/.test(nik)) return null;
  const dd = parseInt(nik.substring(6, 8));
  const mm = parseInt(nik.substring(8, 10));
  if (dd < 1 || dd > 71) return null;
  if (mm < 1 || mm > 12) return null;
  return nik;
}

// ─── Field validators ─────────────────────────────────────────────────────────

function validateName(raw: string | null): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[^A-Z\s'.-]/gi, "").trim().toUpperCase();
  if (cleaned.length < 4 || cleaned.length > 60) return null;
  if (/\d/.test(cleaned)) return null;
  return cleaned;
}

function validateDate(raw: string | null): string | null {
  if (!raw) return null;
  const m = raw.match(/(\d{1,2})[-\/.\s](\d{1,2})[-\/.\s](\d{4})/);
  if (!m) return null;
  const day = parseInt(m[1]), month = parseInt(m[2]), year = parseInt(m[3]);
  if (day < 1 || day > 31 || month < 1 || month > 12 || year < 1930 || year > 2015) return null;
  return `${String(day).padStart(2, "0")}-${String(month).padStart(2, "0")}-${year}`;
}

function validateGender(raw: string | null): string | null {
  if (!raw) return null;
  if (/laki/i.test(raw)) return "LAKI-LAKI";
  if (/perem/i.test(raw)) return "PEREMPUAN";
  return null;
}

function validateReligion(raw: string | null): string | null {
  const valid = ["ISLAM", "KRISTEN", "KATOLIK", "HINDU", "BUDDHA", "KONGHUCU"];
  if (!raw) return null;
  return valid.find(v => raw.toUpperCase().includes(v)) ?? null;
}

function validateMarital(raw: string | null): string | null {
  if (!raw) return null;
  const up = raw.toUpperCase();
  if (/BELUM/.test(up)) return "BELUM KAWIN";
  if (/CERAI MATI/.test(up)) return "CERAI MATI";
  if (/CERAI HIDUP/.test(up)) return "CERAI HIDUP";
  if (/KAWIN/.test(up)) return "KAWIN";
  return null;
}

function validateBloodType(raw: string | null): string | null {
  if (!raw) return null;
  const m = raw.match(/^[ABO]{1,2}[+-]?$/i);
  return m ? raw.toUpperCase() : null;
}

function validatePlace(raw: string | null, maxLen = 40): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[^A-Z\s.-]/gi, "").trim().toUpperCase();
  if (cleaned.length < 3 || cleaned.length > maxLen) return null;
  if (/\d/.test(cleaned)) return null;
  return cleaned;
}

function validateAddress(raw: string | null): string | null {
  if (!raw) return null;
  const cleaned = raw.trim().toUpperCase();
  if (cleaned.length < 5 || cleaned.length > 150) return null;
  return cleaned;
}

// ─── KTP text parser ──────────────────────────────────────────────────────────

const NOT_A_NAME = new Set([
  "LAKI", "LAKI-LAKI", "PEREMPUAN", "ISLAM", "KRISTEN", "KATOLIK", "HINDU",
  "BUDDHA", "KONGHUCU", "WNI", "WNA", "KAWIN", "BELUM KAWIN", "CERAI",
  "SEUMUR HIDUP", "PROVINSI", "KABUPATEN", "KECAMATAN", "KELURAHAN",
  "KOTA", "NIK", "NAMA", "ALAMAT", "AGAMA", "PEKERJAAN",
]);

const OCCUPATION_KW = [
  "WIRASWASTA", "KARYAWAN SWASTA", "KARYAWAN", "PNS", "TNI", "POLRI",
  "PETANI", "PEDAGANG", "GURU", "DOKTER", "MAHASISWA", "PELAJAR",
  "IBU RUMAH TANGGA", "BURUH", "NELAYAN", "TIDAK BEKERJA", "SWASTA",
  "PENSIUNAN", "PERANGKAT DESA",
];

function parseKtpText(text: string): Record<string, string | null> {
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  const flat = lines.join(" ");

  const findLabel = (labelRe: RegExp): string | null => {
    for (const line of lines) {
      const m = line.match(labelRe);
      if (m?.[1]?.trim()) return m[1].trim();
    }
    return null;
  };

  const findFuzzy = (keywords: string[], valueRe: RegExp): string | null => {
    for (const line of lines) {
      const upper = line.toUpperCase();
      if (keywords.some(kw => upper.includes(kw.toUpperCase()))) {
        const m = line.match(valueRe);
        if (m?.[1]?.trim()) return m[1].trim();
      }
    }
    return null;
  };

  const nik = validateNik(extractNik(text));

  // ── Name
  let nameRaw = findLabel(/^Nama\s*[:\-]?\s*(.{3,60})$/i);
  if (!nameRaw) {
    nameRaw = findFuzzy(["Nama", "Nam", "ama"],
      /(?:Nama|Nam\.?|[Nn]am[ae])\s*[:\-\*]?\s*([A-Z][A-Za-z\s\-'.]{2,55})/);
  }
  if (!nameRaw) {
    for (const line of lines) {
      const m = line.match(/[:\-\*]\s*([A-Z][A-Z\s\-'.]{5,50})$/);
      if (m) {
        const candidate = m[1].trim();
        const words = candidate.split(/\s+/);
        if (words.length >= 2 && words.every(w => w.length >= 2) && !NOT_A_NAME.has(words[0])) {
          nameRaw = candidate;
          break;
        }
      }
    }
  }
  if (!nameRaw) {
    const nikLineIdx = lines.findIndex(l => /\d{10,}/.test(l.replace(/[.\- ]/g, "")));
    const from = nikLineIdx >= 0 ? nikLineIdx + 1 : 0;
    for (let i = from; i < Math.min(from + 6, lines.length); i++) {
      const l = lines[i];
      const words = l.trim().split(/\s+/);
      if (/^[A-Z][A-Z\s\-'.]{5,49}$/.test(l) && words.length >= 2
          && words.every(w => w.replace(/['.]/g, "").length >= 3)
          && !NOT_A_NAME.has(words[0])) {
        nameRaw = l;
        break;
      }
    }
  }
  const fullName = validateName(nameRaw);

  // ── Birth
  const birthRaw = findLabel(/(?:Tempat[\/\s]?Tgl\.?\s*Lahir|Lahir|Tgl\.?\s*Lahir)\s*[:\-]?\s*(.+)/i)
    ?? findFuzzy(["Lahir", "Tgl", "Tempat"], /(?:Lahir|Tgl|Tempat)\s*[:\-]?\s*(.+)/i);
  let birthPlace: string | null = null;
  let birthDate: string | null = null;
  if (birthRaw) {
    const commaIdx = birthRaw.search(/[,\/]/);
    if (commaIdx > 0) {
      birthPlace = validatePlace(birthRaw.substring(0, commaIdx));
      birthDate = validateDate(birthRaw.substring(commaIdx + 1));
    }
  }
  if (!birthDate) {
    const dateMatch = flat.match(/\b(\d{2}[-\/]\d{2}[-\/]\d{4})\b/);
    if (dateMatch) birthDate = validateDate(dateMatch[1]);
  }

  // ── Gender
  const gender = validateGender(
    findLabel(/Jenis\s*Kelamin\s*[:\-]?\s*(.+)/i)
    ?? flat.match(/\b(LAKI[- ]LAKI|PEREMPUAN)\b/i)?.[1] ?? null
  );

  // ── Address
  const address = validateAddress(findLabel(/^Alamat\s*[:\-]?\s*(.{5,120})$/i));

  // ── RT/RW
  const rtRwRaw = findLabel(/RT\s*[\/\-]?\s*RW\s*[:\-]?\s*([\d]{1,3}\s*[\/\-]\s*[\d]{1,3})/i);
  const rtRw = rtRwRaw ?? flat.match(/\b(\d{3})\s*[\/\-]\s*(\d{3})\b/)?.slice(1, 3).join("/") ?? null;

  // ── Kelurahan
  const kelurahan = validatePlace(findLabel(/(?:Kel\.?\/?Desa|Kelurahan)\s*[:\-]?\s*(.+)/i)
    ?? findFuzzy(["Kelurahan", "Kel.", "Desa"], /(?:Kel|Desa)\S*\s*[:\-]?\s*([A-Z][A-Za-z\s]{2,40})/i));

  // ── Kecamatan
  const kecamatan = validatePlace(
    findFuzzy(["Kecamatan", "Kocamatan", "Kocamalan", "Kecamalan", "ecamat"],
      /[Kk][eo]c?amata?[nl]?\s*[:\-]?\s*([A-Z][A-Za-z\s]{2,40})/i)
    ?? findLabel(/Kecamatan\s*[:\-]?\s*(.+)/i)
  );

  // ── City
  const cityRaw = findLabel(/(?:KABUPATEN|KOTA)\s+([A-Z][A-Za-z\s]{2,35})/i)
    ?? findLabel(/Kab(?:upaten)?\s*[:\-]?\s*(.+)/i)
    ?? flat.match(/(?:KABUPATEN|KOTA)\s+([A-Z][A-Za-z\s]{2,35})/i)?.[1] ?? null;
  const city = validatePlace(cityRaw, 50);

  // ── Province (handle OCR: "PROVINS|", "PROVINS1", "PROVINSI")
  const provRe = /PROVINS[I|1l]\s+([A-Z][A-Za-z\s|]{2,40})/i;
  const provLine = lines.find(l => /PROVINS[I|1l]\s/i.test(l));
  const provinceRaw = provLine?.replace(/^.*PROVINS[I|1l]\s+/i, "").replace(/[|]/g, "I").trim()
    ?? findLabel(/Provinsi\s*[:\-]?\s*(.+)/i)
    ?? flat.match(provRe)?.[1]?.replace(/[|]/g, "I") ?? null;
  const province = validatePlace(provinceRaw, 50);

  // ── Religion
  const religion = validateReligion(
    findLabel(/Agama\s*[:\-]?\s*(.+)/i)
    ?? flat.match(/\b(Islam|Kristen|Katolik|Hindu|Buddha|Konghucu)\b/i)?.[1] ?? null
  );

  // ── Marital
  const maritalStatus = validateMarital(
    findLabel(/(?:Status\s*)?Perkawinan\s*[:\-]?\s*(.+)/i)
    ?? flat.match(/\b(KAWIN|BELUM KAWIN|CERAI HIDUP|CERAI MATI)\b/i)?.[1] ?? null
  );

  // ── Occupation
  const occupation = (() => {
    const raw = findLabel(/Pekerjaan\s*[:\-]?\s*(.+)/i)
      ?? findFuzzy(["Pekerjaan", "Peke", "kerja"], /(?:Pekerjaan|Peke\S*)\s*[:\-]?\s*([A-Za-z\s]{3,60})/i);
    const flatUp = flat.toUpperCase().replace(/[^A-Z\s]/g, " ");
    const kwMatch = OCCUPATION_KW.find(kw => flatUp.includes(kw));
    const finalRaw = raw ?? kwMatch ?? null;
    if (!finalRaw) return null;
    const cleaned = finalRaw.trim().toUpperCase();
    if (cleaned.length < 2 || cleaned.length > 60 || /\d{3,}/.test(cleaned)) return null;
    return cleaned;
  })();

  // ── Blood type
  const bloodType = validateBloodType(
    findLabel(/Gol(?:\.?\s*Darah)?\s*[:\-]?\s*([ABO]{1,2}[+-]?)/i)
    ?? flat.match(/\bGol\S*\s*[:\-]?\s*([ABO]{1,2}[+-]?)/i)?.[1]
    ?? flat.match(/\b([ABO]{1,2}[+-])\b/i)?.[1] ?? null
  );

  // ── Valid until
  const validUntil = findLabel(/Berlaku\s*Hingga\s*[:\-]?\s*([\d\-\/]+|SEUMUR\s*HIDUP)/i)
    ?? findFuzzy(["Berlaku", "Hingga", "Hingge"],
      /(?:Berlaku|Hingga|Hingge)\s*[:\-\*]?\s*([\d\-\/]{8,10}|SEUMUR\s*HIDUP)/i);

  // ── Nationality
  const nationality = (() => {
    const raw = findLabel(/Kewarganegaraan\s*[:\-]?\s*(.+)/i)
      ?? flat.match(/\b(WNI|WNA)\b/i)?.[1] ?? null;
    if (!raw) return null;
    const up = raw.trim().toUpperCase();
    if (up === "WNI" || up === "WNA") return up;
    if (/^[A-Z\s]{2,20}$/.test(up)) return up;
    return null;
  })();

  return {
    nik, fullName, address, birthPlace, birthDate,
    gender, religion, maritalStatus, occupation, nationality,
    rtRw, kelurahan, kecamatan, province, city, bloodType, validUntil,
  };
}

function scoreKtpData(d: Record<string, string | null>): number {
  let s = 0;
  if (d.nik && /^\d{16}$/.test(d.nik)) s += 40;
  if (d.fullName) s += 20;
  if (d.birthDate) s += 8;
  if (d.birthPlace) s += 3;
  if (d.gender) s += 5;
  if (d.city) s += 5;
  if (d.province) s += 3;
  if (d.address) s += 4;
  if (d.kecamatan) s += 3;
  if (d.religion) s += 2;
  if (d.maritalStatus) s += 2;
  if (d.bloodType) s += 2;
  if (d.occupation) s += 1;
  return Math.min(s, 100);
}

function mergeKtpData(
  a: Record<string, string | null>,
  b: Record<string, string | null>
): Record<string, string | null> {
  const r = { ...a };
  for (const k of Object.keys(b)) {
    if (!r[k] && b[k]) r[k] = b[k];
    if (k === "nik" && b[k] && /^\d{16}$/.test(b[k]!)) {
      if (!r[k] || !/^\d{16}$/.test(r[k]!)) r[k] = b[k];
    }
  }
  return r;
}

// ─── OCR orchestration — 2 PARALLEL passes ────────────────────────────────────

async function runOcrPasses(
  imageBase64: string
): Promise<{ data: Record<string, string | null>; score: number; qualityWarning: QualityWarning }> {
  const inputBuf = Buffer.from(imageBase64, "base64");

  const [qualityWarning, { normal, enhanced }] = await Promise.all([
    detectImageQuality(inputBuf),
    preprocessKtpImage(imageBase64),
  ]);

  const [workerA, workerB] = await Promise.all([initWorker("a"), initWorker("b")]);

  // Run BOTH passes in parallel using 2 workers
  await Promise.all([
    workerA.setParameters({ tessedit_pageseg_mode: "6" as any }),
    workerB.setParameters({ tessedit_pageseg_mode: "11" as any }),
  ]);

  const [r1, r2] = await Promise.all([
    workerA.recognize(normal),
    workerB.recognize(enhanced),
  ]);

  const text1 = filterByConfidence(r1.data.words, r1.data.text, 30);
  const text2 = filterByConfidence(r2.data.words, r2.data.text, 30);

  const parsed1 = parseKtpText(text1);
  const parsed2 = parseKtpText(text2);
  const merged = mergeKtpData(parsed1, parsed2);
  const score = scoreKtpData(merged);

  return { data: merged, score, qualityWarning };
}

async function ocrWithTesseract(imageBase64: string): Promise<{
  data: Record<string, string | null>;
  score: number;
  qualityWarning: QualityWarning;
}> {
  const result = _scanChain.then(() => runOcrPasses(imageBase64));
  _scanChain = result.catch(() => {});
  return result;
}

// ─── Scan endpoint ────────────────────────────────────────────────────────────

router.post("/scan", async (req, res) => {
  try {
    const { imageBase64 } = ScanBody.parse(req.body);
    const { data, score, qualityWarning } = await ocrWithTesseract(imageBase64);
    const lowConfidence = score < 65;
    req.log.info({ score, qualityWarning, lowConfidence }, "KTP scan");
    return res.json({
      ...data,
      _meta: { tesseractScore: score, qualityWarning, lowConfidence },
    });
  } catch (err) {
    req.log.error({ err }, "KTP scan error");
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
    req.log.error({ err }, "Register error");
    return res.status(400).json({ error: "Data tidak valid" });
  }
});

export default router;
