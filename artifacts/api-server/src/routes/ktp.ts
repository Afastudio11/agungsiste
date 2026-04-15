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

// ─── Persistent Tesseract worker (created once, reused for all scans) ─────────
// Serializes concurrent scans so only one runs at a time.

let _workerInstance: Awaited<ReturnType<typeof createWorker>> | null = null;
let _workerStarting: Promise<Awaited<ReturnType<typeof createWorker>>> | null = null;
// Simple serial queue: each scan waits for the previous one to finish
let _scanChain: Promise<unknown> = Promise.resolve();

async function getWorker(): Promise<Awaited<ReturnType<typeof createWorker>>> {
  if (_workerInstance) return _workerInstance;
  if (_workerStarting) return _workerStarting;
  _workerStarting = createWorker(["ind", "eng"], 1, {
    logger: () => {},
    langPath: TESSDATA_DIR,
    gzip: true,
  }).then(w => {
    _workerInstance = w;
    _workerStarting = null;
    return w;
  }).catch(err => {
    _workerStarting = null;
    throw err;
  });
  return _workerStarting;
}

// Warm up worker at module load so first scan is faster
getWorker().catch(() => {});

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

// ─── Deskew via horizontal projection variance ────────────────────────────────

async function detectSkewAngle(grayscaleBuf: Buffer): Promise<number> {
  const AW = 250;
  const { data, info } = await sharp(grayscaleBuf)
    .resize({ width: AW, kernel: "nearest" })
    .threshold(128)
    .raw()
    .toBuffer({ resolveWithObject: true });

  const w = info.width;
  const h = info.height;
  const cx = w / 2;
  const cy = h / 2;

  let bestAngle = 0;
  let bestScore = -Infinity;

  for (let deg = -12; deg <= 12; deg += 1) {
    const rad = (deg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const proj = new Float32Array(h + 30).fill(0);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (data[y * w + x] > 128) continue;
        const ry = Math.round(sin * (x - cx) + cos * (y - cy) + cy + 15);
        if (ry >= 0 && ry < proj.length) proj[ry]++;
      }
    }

    let mean = 0;
    for (let i = 0; i < proj.length; i++) mean += proj[i];
    mean /= proj.length;
    let variance = 0;
    for (let i = 0; i < proj.length; i++) variance += (proj[i] - mean) ** 2;

    if (variance > bestScore) {
      bestScore = variance;
      bestAngle = deg;
    }
  }

  return bestAngle;
}

// ─── Image preprocessing ──────────────────────────────────────────────────────

async function preprocessKtpImage(imageBase64: string): Promise<{
  normal: Buffer;
  enhanced: Buffer;
  width: number;
  height: number;
}> {
  const inputBuf = Buffer.from(imageBase64, "base64");

  // Step 1: Auto-orient + grayscale + normalize at target size
  const rotated = await sharp(inputBuf).rotate().toBuffer();
  const meta = await sharp(rotated).metadata();
  const origW = meta.width ?? 800;
  const targetW = Math.max(origW, 1600);

  const base = await sharp(rotated)
    .resize({ width: targetW, kernel: sharp.kernel.lanczos3 })
    .grayscale()
    .normalize()
    .toBuffer();

  // Step 2: Deskew
  const angle = await detectSkewAngle(base);
  const deskewed = Math.abs(angle) > 0.5
    ? await sharp(base).rotate(-angle, { background: { r: 255, g: 255, b: 255, alpha: 1 } }).toBuffer()
    : base;

  const finalMeta = await sharp(deskewed).metadata();
  const w = finalMeta.width ?? targetW;
  const h = finalMeta.height ?? 500;

  // Step 3: Two processing variants
  const [normal, enhanced] = await Promise.all([
    // Normal: gentle sharpening + mild contrast
    sharp(deskewed).sharpen({ sigma: 1.5, m1: 0.8, m2: 2.0 }).linear(1.2, -10).png().toBuffer(),
    // Enhanced: stronger contrast for faded/photocopy
    sharp(deskewed).sharpen({ sigma: 2.5, m1: 1.5, m2: 4.0 }).linear(1.6, -35).png().toBuffer(),
  ]);

  return { normal, enhanced, width: w, height: h };
}

// ─── Word-confidence filtering ────────────────────────────────────────────────
// When word-level data is available, filter below threshold.
// Falls back to raw text if tesseract doesn't return word data.

function filterByConfidence(words: Word[] | undefined, rawText: string, minConf = 35): string {
  if (!words?.length) return rawText; // no word data → use raw text

  // Group words by approximate line (bin y0 into 20px rows)
  const lineMap = new Map<number, string[]>();
  for (const word of words) {
    if (word.confidence < minConf || !word.text.trim()) continue;
    const lineKey = Math.round(word.bbox.y0 / 20);
    if (!lineMap.has(lineKey)) lineMap.set(lineKey, []);
    lineMap.get(lineKey)!.push(word.text);
  }

  const filtered = [...lineMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, ws]) => ws.join(" "))
    .join("\n");

  // If filtering removed everything, fall back to raw text
  return filtered.trim() ? filtered : rawText;
}

// ─── Character correction for NIK ────────────────────────────────────────────

// All chars that can be misread as digits in OCR, with their possible digit values
const OCR_DIGIT_MAP: Record<string, string[]> = {
  I: ["1"], i: ["1"], l: ["1"], "|": ["1"], "!": ["1"],
  ")": ["1"], "(": ["1"], "[": ["1"], "]": ["1"],
  L: ["1", "6"],    // ambiguous: L looks like 1 or stylized 6
  O: ["0"], o: ["0"], D: ["0"], Q: ["0"], q: ["0"],
  B: ["8"],
  S: ["5"], s: ["5"],
  G: ["9", "6"],    // ambiguous
  Z: ["2"], z: ["2"],
  "?": ["7"],
  b: ["6"],
  Y: ["4", "7"],    // ambiguous: stylized 4 can look like Y
  A: ["4"],
  h: ["4"],
};

// Candidate NIK chars: digits + all OCR-confusable chars
const NIK_RE = /[0-9IilOoBbDSGZqQzY?|!()\[\]LAh]{14,18}/g;

function correctNikWithMap(raw: string, choices: number[] = []): string {
  // Build list of ambiguous positions
  const result: string[] = [];
  const ambig: number[] = [];
  for (const ch of raw.replace(/\s/g, "")) {
    const opts = OCR_DIGIT_MAP[ch];
    if (!opts) {
      result.push(/\d/.test(ch) ? ch : "?"); // unknown char → placeholder
    } else if (opts.length === 1) {
      result.push(opts[0]);
    } else {
      const choice = choices[ambig.length] ?? 0;
      result.push(opts[Math.min(choice, opts.length - 1)]);
      ambig.push(ambig.length);
    }
  }
  return result.join("");
}

function extractNik(text: string): string | null {
  const flat = text.replace(/\n/g, " ");

  // 1. Plain 16-digit sequence (ideal case)
  const seq16 = flat.match(/\b(\d{16})\b/);
  if (seq16) return seq16[1];

  // 1b. Digit sequence with a single embedded period or hyphen (e.g. "3509171.708630004")
  //     Only strip the separator if it produces exactly 16 digits
  const singleSep = flat.match(/(\d{6,})[.\-](\d{6,})/);
  if (singleSep) {
    const joined = singleSep[1] + singleSep[2];
    if (/^\d{16}$/.test(joined)) return joined;
  }

  // 2. Labeled NIK followed by correctable sequence
  const labeled = flat.match(/NIK\s*[:\-]?\s*([0-9IilOoBbDSGZqQzY?|!()\[\]LAh\s]{14,20})/i);
  if (labeled) {
    // Try all ambiguous combinations (max 2 ambiguous positions → 4 tries)
    for (let c0 = 0; c0 < 3; c0++) {
      for (let c1 = 0; c1 < 3; c1++) {
        const fixed = correctNikWithMap(labeled[1], [c0, c1]);
        if (/^\d{16}$/.test(fixed)) return fixed;
      }
    }
  }

  // 3. Any correctable 14-18 char sequence
  const candidates = flat.match(NIK_RE) ?? [];
  for (const c of candidates) {
    for (let c0 = 0; c0 < 3; c0++) {
      for (let c1 = 0; c1 < 3; c1++) {
        const fixed = correctNikWithMap(c, [c0, c1]);
        if (/^\d{16}$/.test(fixed)) return fixed;
      }
    }
  }

  return null;
}

function validateNik(nik: string | null): string | null {
  if (!nik) return null;
  if (!/^\d{16}$/.test(nik)) return null;

  // Basic NIK structure check: PPKKCC DDMMYY XXXX
  // Province code 11-94, dd 01-71 (females add 40), mm 01-12, year 00-99
  const dd = parseInt(nik.substring(6, 8));
  const mm = parseInt(nik.substring(8, 10));
  if (dd < 1 || dd > 71) return null; // 71 = 40+31 for female
  if (mm < 1 || mm > 12) return null;
  return nik;
}

// ─── Field validators (prevents garbage fill) ─────────────────────────────────

function validateName(raw: string | null): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[^A-Z\s'.-]/gi, "").trim().toUpperCase();
  // Must be mostly letters, at least 2 words or 4 chars, not too long
  if (cleaned.length < 4 || cleaned.length > 60) return null;
  if (/\d/.test(cleaned)) return null;
  return cleaned;
}

function validateDate(raw: string | null): string | null {
  if (!raw) return null;
  const m = raw.match(/(\d{1,2})[-\/.\s](\d{1,2})[-\/.\s](\d{4})/);
  if (!m) return null;
  const day = parseInt(m[1]);
  const month = parseInt(m[2]);
  const year = parseInt(m[3]);
  if (day < 1 || day > 31) return null;
  if (month < 1 || month > 12) return null;
  if (year < 1930 || year > 2015) return null;
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
  const up = raw.toUpperCase().trim();
  return valid.find(v => up.includes(v)) ?? null;
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
// RESERVED words that are never a person's name
const NOT_A_NAME = new Set([
  "LAKI", "LAKI-LAKI", "PEREMPUAN", "ISLAM", "KRISTEN", "KATOLIK", "HINDU",
  "BUDDHA", "KONGHUCU", "WNI", "WNA", "KAWIN", "BELUM KAWIN", "CERAI",
  "SEUMUR HIDUP", "PROVINSI", "KABUPATEN", "KECAMATAN", "KELURAHAN",
  "KOTA", "NIK", "NAMA", "ALAMAT", "AGAMA", "PEKERJAAN",
]);

function parseKtpText(text: string): Record<string, string | null> {
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  const flat = lines.join(" ");

  // Find a line that matches a strict or fuzzy label pattern
  const findLabel = (labelRe: RegExp): string | null => {
    for (const line of lines) {
      const m = line.match(labelRe);
      if (m?.[1]?.trim()) return m[1].trim();
    }
    return null;
  };

  // Find value on same line as a fuzzy label (Levenshtein-style substring check)
  // Tolerates 1-2 garbled chars in the label
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

  // ── NIK ─────────────────────────────────────────────────────────────────────
  const nik = validateNik(extractNik(text));

  // ── Name ────────────────────────────────────────────────────────────────────
  // 1. Try strict "Nama" label
  let nameRaw = findLabel(/^Nama\s*[:\-]?\s*(.{3,60})$/i);
  // 2. Fuzzy: line containing "Nama" or similar OCR garble with a value after it
  if (!nameRaw) {
    nameRaw = findFuzzy(["Nama", "Nam", "ama"], /(?:Nama|Nam\.?|[Nn]am[ae])\s*[:\-\*]?\s*([A-Z][A-Za-z\s\-'.]{2,55})/);
  }
  // 3. Pattern fallback: first ALL-CAPS-only line that looks like a name
  //    (appears after the NIK in the text, 8-50 chars, only letters/spaces/hyphens)
  //    Requires ≥2 words, each ≥3 chars, first word not a reserved keyword
  if (!nameRaw) {
    const nikLineIdx = lines.findIndex(l => /[0-9IL]{14,}/.test(l.replace(/[.\- ]/g, "")));
    const searchFrom = nikLineIdx >= 0 ? nikLineIdx + 1 : 0;
    for (let i = searchFrom; i < Math.min(searchFrom + 8, lines.length); i++) {
      const l = lines[i];
      const words = l.trim().split(/\s+/);
      const allCaps = /^[A-Z][A-Z\s\-'.]{4,49}$/.test(l);
      const minWordLen = words.every(w => w.replace(/['.]/g, "").length >= 3);
      const minWords = words.length >= 2;
      const notReserved = !NOT_A_NAME.has(words[0]);
      if (allCaps && minWordLen && minWords && notReserved) {
        nameRaw = l; break;
      }
    }
  }
  const fullName = validateName(nameRaw);

  // ── Birth ────────────────────────────────────────────────────────────────────
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
  // Date fallback: any DD-MM-YYYY or DD/MM/YYYY pattern in text
  if (!birthDate) {
    const dateMatch = flat.match(/\b(\d{2}[-\/]\d{2}[-\/]\d{4})\b/);
    if (dateMatch) birthDate = validateDate(dateMatch[1]);
  }

  // ── Gender ───────────────────────────────────────────────────────────────────
  const genderRaw = findLabel(/Jenis\s*Kelamin\s*[:\-]?\s*(.+)/i)
    ?? flat.match(/\b(LAKI[- ]LAKI|PEREMPUAN)\b/i)?.[1] ?? null;
  const gender = validateGender(genderRaw);

  // ── Address ──────────────────────────────────────────────────────────────────
  const addressRaw = findLabel(/^Alamat\s*[:\-]?\s*(.{5,120})$/i);
  const address = validateAddress(addressRaw);

  // ── RT/RW ────────────────────────────────────────────────────────────────────
  const rtRwRaw = findLabel(/RT\s*[\/\-]?\s*RW\s*[:\-]?\s*([\d]{1,3}\s*[\/\-]\s*[\d]{1,3})/i);
  const rtRw = rtRwRaw ?? flat.match(/\b(\d{3})\s*[\/\-]\s*(\d{3})\b/)?.slice(1, 3).join("/") ?? null;

  // ── Kelurahan ────────────────────────────────────────────────────────────────
  const kelurahan = validatePlace(findLabel(/(?:Kel\.?\/?Desa|Kelurahan)\s*[:\-]?\s*(.+)/i)
    ?? findFuzzy(["Kelurahan", "Kel.", "Desa"], /(?:Kel|Desa)\S*\s*[:\-]?\s*([A-Z][A-Za-z\s]{2,40})/i));

  // ── Kecamatan ────────────────────────────────────────────────────────────────
  // "Kocamalan", "Kecamalan", "Kecamatan" — all fuzzy match
  const kecamatan = validatePlace(
    findFuzzy(["Kecamatan", "Kocamatan", "Kocamalan", "Kecamalan", "ecamat"],
      /[Kk][eo]c?amata?n\s*[:\-]?\s*([A-Z][A-Za-z\s]{2,40})/i)
    ?? findLabel(/Kecamatan\s*[:\-]?\s*(.+)/i)
  );

  // ── City ─────────────────────────────────────────────────────────────────────
  const cityRaw = findLabel(/(?:KABUPATEN|KOTA)\s+([A-Z][A-Za-z\s]{2,35})/i)
    ?? findLabel(/Kab(?:upaten)?\s*[:\-]?\s*(.+)/i)
    ?? flat.match(/(?:KABUPATEN|KOTA)\s+([A-Z][A-Za-z\s]{2,35})/i)?.[1] ?? null;
  const city = validatePlace(cityRaw, 50);

  // ── Province ─────────────────────────────────────────────────────────────────
  const provinceRaw = lines.find(l => /^PROVINSI\s/i.test(l))?.replace(/^PROVINSI\s+/i, "").trim()
    ?? findLabel(/Provinsi\s*[:\-]?\s*(.+)/i)
    ?? flat.match(/PROVINSI\s+([A-Z][A-Za-z\s]{2,40})/i)?.[1] ?? null;
  const province = validatePlace(provinceRaw, 50);

  // ── Religion ─────────────────────────────────────────────────────────────────
  const religion = validateReligion(findLabel(/Agama\s*[:\-]?\s*(.+)/i)
    ?? flat.match(/\b(Islam|Kristen|Katolik|Hindu|Buddha|Konghucu)\b/i)?.[1] ?? null);

  // ── Marital status ───────────────────────────────────────────────────────────
  const maritalStatus = validateMarital(
    findLabel(/(?:Status\s*)?Perkawinan\s*[:\-]?\s*(.+)/i)
    ?? flat.match(/\b(KAWIN|BELUM KAWIN|CERAI HIDUP|CERAI MATI)\b/i)?.[1] ?? null
  );

  // ── Occupation ───────────────────────────────────────────────────────────────
  const occupation = (() => {
    const raw = findLabel(/Pekerjaan\s*[:\-]?\s*(.+)/i)
      ?? findFuzzy(["Pekerjaan", "Peke", "kerja"], /(?:Pekerjaan|Peke\S*)\s*[:\-]?\s*([A-Za-z\s]{3,60})/i);
    // Flat-text fallback: known Indonesian occupation keywords
    const occupationKeywords = [
      "WIRASWASTA", "KARYAWAN SWASTA", "PNS", "TNI", "POLRI", "PETANI",
      "PEDAGANG", "GURU", "DOKTER", "MAHASISWA", "PELAJAR", "IBU RUMAH TANGGA",
      "BURUH", "NELAYAN", "TIDAK BEKERJA",
    ];
    const kwMatch = occupationKeywords.find(kw =>
      flat.toUpperCase().replace(/[^A-Z\s]/g, " ").includes(kw)
    );
    const finalRaw = raw ?? kwMatch ?? null;
    if (!finalRaw) return null;
    const cleaned = finalRaw.trim().toUpperCase();
    if (cleaned.length < 3 || cleaned.length > 60) return null;
    if (/\d{3,}/.test(cleaned)) return null;
    return cleaned;
  })();

  // ── Blood type ───────────────────────────────────────────────────────────────
  const bloodType = validateBloodType(
    findLabel(/Gol(?:\.?\s*Darah)?\s*[:\-]?\s*([ABO]{1,2}[+-]?)/i)
    ?? flat.match(/\bGol\S*\s*[:\-]?\s*([ABO]{1,2}[+-]?)/i)?.[1]
    ?? flat.match(/\b([ABO]{1,2}[+-])\b/i)?.[1] ?? null
  );

  // ── Valid until ───────────────────────────────────────────────────────────────
  const validUntil = findLabel(/Berlaku\s*Hingga\s*[:\-]?\s*([\d\-\/]+|SEUMUR\s*HIDUP)/i)
    ?? findFuzzy(["Berlaku", "Hingga", "Hingge"],
      /(?:Berlaku|Hingga|Hingge)\s*[:\-\*]?\s*([\d\-\/]{8,10}|SEUMUR\s*HIDUP)/i);

  // ── Nationality ───────────────────────────────────────────────────────────────
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

// ─── OCR orchestration (3 passes max) ────────────────────────────────────────

async function runOcrPasses(
  imageBase64: string
): Promise<{ data: Record<string, string | null>; score: number; qualityWarning: QualityWarning }> {
  const inputBuf = Buffer.from(imageBase64, "base64");
  const qualityWarning = await detectImageQuality(inputBuf);
  const { normal, enhanced } = await preprocessKtpImage(imageBase64);

  const worker = await getWorker();

  // Pass 1 — PSM 6 (uniform block) on normal image
  await worker.setParameters({ tessedit_pageseg_mode: "6" as any });
  const { data: d1 } = await worker.recognize(normal);
  const text1 = filterByConfidence(d1.words, d1.text, 35);
  let merged = parseKtpText(text1);
  let score = scoreKtpData(merged);

  // Pass 2 — PSM 11 (sparse text) on enhanced; great for real photos & photocopies
  await worker.setParameters({ tessedit_pageseg_mode: "11" as any });
  const { data: d2 } = await worker.recognize(enhanced);
  const text2 = filterByConfidence(d2.words, d2.text, 35);
  merged = mergeKtpData(merged, parseKtpText(text2));
  score = scoreKtpData(merged);

  // Pass 3 — only if score still low; PSM 6 on enhanced with low confidence bar
  if (score < 40) {
    await worker.setParameters({ tessedit_pageseg_mode: "6" as any });
    const { data: d3 } = await worker.recognize(enhanced);
    const text3 = filterByConfidence(d3.words, d3.text, 20);
    merged = mergeKtpData(merged, parseKtpText(text3));
    score = scoreKtpData(merged);
  }

  return { data: merged, score, qualityWarning };
}

async function ocrWithTesseract(imageBase64: string): Promise<{
  data: Record<string, string | null>;
  score: number;
  qualityWarning: QualityWarning;
}> {
  // Serialize scans through the persistent worker
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
