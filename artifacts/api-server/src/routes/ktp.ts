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
import { spawn } from "child_process";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import {
  resolveRegions, matchProvince, matchKabupaten, matchBirthPlace,
  lookupProvinceByNik, lookupKabupatenByNik,
  PROVINCES, KABUPATEN,
} from "../data/regions.js";
import { requireAuth } from "../middlewares/auth";
import { GoogleGenAI } from "@google/genai";
import { Client as GradioClient } from "@gradio/client";

const _thisDir = path.dirname(fileURLToPath(import.meta.url));
const _objectStorage = new ObjectStorageService();
const _gemini = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  : null;

const TESSDATA_DIR = path.resolve(_thisDir, "..", "tessdata");
const router = Router();

type TessWorker = Awaited<ReturnType<typeof createWorker>>;
const workers: Record<string, TessWorker | null> = { a: null, b: null, c: null, d: null };
const workerInits: Record<string, Promise<TessWorker> | null> = { a: null, b: null, c: null, d: null };
function initWorker(key: string, langs: string[] = ["ind", "eng"]): Promise<TessWorker> {
  if (workers[key]) return Promise.resolve(workers[key]!);
  if (workerInits[key]) return workerInits[key]!;
  workerInits[key] = createWorker(langs, 1, {
    logger: () => {},
    langPath: TESSDATA_DIR,
    gzip: true,
  }).then(w => { workers[key] = w; workerInits[key] = null; return w; })
    .catch(err => { workerInits[key] = null; throw err; });
  return workerInits[key]!;
}
let _scanChain: Promise<unknown> = Promise.resolve();

function filterByConfidence(words: Word[] | undefined, rawText: string, minConf = 5): string {
  if (!words?.length) return rawText;
  const lineMap = new Map<number, string[]>();
  for (const word of words) {
    if (word.confidence < minConf || !word.text.trim()) continue;
    if (word.text.trim().length < 1) continue;
    const lineKey = Math.round(word.bbox.y0 / 12);
    if (!lineMap.has(lineKey)) lineMap.set(lineKey, []);
    lineMap.get(lineKey)!.push(word.text);
  }
  const filtered = [...lineMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, ws]) => ws.join(" "))
    .join("\n");
  return filtered.trim().length > rawText.length * 0.2 ? filtered : rawText;
}

const ScanBody = z.object({ imageBase64: z.string() });
const RegisterBody = z.object({
  eventId: z.number(),
  staffId: z.number().optional(),
  staffName: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  socialStatus: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  tags: z.string().nullable().optional(),
  nik: z.string(),
  fullName: z.string(),
  address: z.string().nullable().optional(),
  birthPlace: z.string().nullable().optional(),
  birthDate: z.string().nullable().optional(),
  gender: z.string().nullable().optional(),
  religion: z.string().nullable().optional(),
  maritalStatus: z.string().nullable().optional(),
  occupation: z.string().nullable().optional(),
  nationality: z.string().nullable().optional(),
  rtRw: z.string().nullable().optional(),
  kelurahan: z.string().nullable().optional(),
  kecamatan: z.string().nullable().optional(),
  province: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  bloodType: z.string().nullable().optional(),
});

// ─── Quality detection ────────────────────────────────────────────────────────
type QualityWarning = "dark" | "overexposed" | "blurry" | "low_contrast" | null;

async function detectImageQuality(buffer: Buffer): Promise<{ warning: QualityWarning; mean: number; stdev: number }> {
  try {
    const stats = await sharp(buffer).grayscale().stats();
    const m = stats.channels[0].mean;
    const s = stats.channels[0].stdev;
    let w: QualityWarning = null;
    if (m < 35) w = "dark";
    else if (m > 230) w = "overexposed";
    else if (s < 12) w = "blurry";
    else if (s < 20) w = "low_contrast";
    return { warning: w, mean: m, stdev: s };
  } catch { return { warning: null, mean: 128, stdev: 50 }; }
}

// ─── Preprocessing with zone-based field extraction ──────────────────────────
// KTP has a fixed layout:
//   - Header (province, kabupaten): top ~12%
//   - Photo area: left ~28%, top 12%-85%
//   - NIK: right ~72%, row ~12%-20%
//   - Text fields (name, birth, etc.): right ~72%, rows 20%-85%
//   - The entire right side for general text parsing

interface KtpZones {
  full: Buffer;
  header: Buffer;
  nikZone: Buffer;
  textFields: Buffer;
  rightSide: Buffer;
}

async function buildBaseImage(imageBase64: string): Promise<{ base: Buffer; w: number; h: number }> {
  let raw = imageBase64;
  const dataUrlMatch = raw.match(/^data:[^;]+;base64,(.+)$/);
  if (dataUrlMatch) raw = dataUrlMatch[1];
  const inputBuf = Buffer.from(raw, "base64");
  const rotated = await sharp(inputBuf).rotate().toBuffer();
  const meta = await sharp(rotated).metadata();
  const origW = meta.width ?? 800;
  const origH = meta.height ?? 600;

  let oriented = rotated;
  if (origH > origW * 1.3) {
    oriented = await sharp(rotated).rotate(90).toBuffer();
  }

  const targetW = Math.max(2400, origW < 800 ? 2800 : origW < 1200 ? 2400 : 2200);

  const base = await sharp(oriented)
    .resize({ width: targetW, kernel: sharp.kernel.lanczos3 })
    .grayscale()
    .toBuffer();

  const baseMeta = await sharp(base).metadata();
  return { base, w: baseMeta.width!, h: baseMeta.height! };
}

function safeExtract(w: number, h: number, left: number, top: number, width: number, height: number) {
  const l = Math.max(0, Math.min(left, w - 1));
  const t = Math.max(0, Math.min(top, h - 1));
  const ew = Math.max(1, Math.min(width, w - l));
  const eh = Math.max(1, Math.min(height, h - t));
  return { left: l, top: t, width: ew, height: eh };
}

async function extractZones(base: Buffer, w: number, h: number): Promise<KtpZones> {
  // KTP layout (landscape):
  //   Header: top ~14% (Province / Kabupaten)
  //   NIK row: ~8%-28% height, FULL WIDTH (NIK label is on left, number follows)
  //   Photo: ~12%-90% height, RIGHT side (~63%-95% width)
  //   Text fields: ~15%-90% height, LEFT-CENTER (~2%-63% width)
  const headerH = Math.floor(h * 0.16);

  // NIK zone: full width, tall band — 6% to 32% of height
  const nikTop = Math.floor(h * 0.06);
  const nikH = Math.floor(h * 0.26);

  // Text fields: left-center strip (avoids photo on right), 13%-92% height
  const textLeft = Math.floor(w * 0.02);
  const textW = Math.floor(w * 0.63);
  const textTop = Math.floor(h * 0.13);
  const textH = Math.floor(h * 0.79);

  // Right side: still useful for some layouts, 25%-100% width
  const rightLeft = Math.floor(w * 0.25);
  const rightW = w - rightLeft;

  const [header, nikZone, textFields, rightSide] = await Promise.all([
    sharp(base).extract(safeExtract(w, h, 0, 0, w, headerH)).toBuffer(),
    // Full width NIK band — don't crop horizontally so NIK label guides extraction
    sharp(base).extract(safeExtract(w, h, 0, nikTop, w, nikH)).toBuffer(),
    // Left-center text area — avoids photo on right side
    sharp(base).extract(safeExtract(w, h, textLeft, textTop, textW, textH)).toBuffer(),
    sharp(base).extract(safeExtract(w, h, rightLeft, 0, rightW, h)).toBuffer(),
  ]);

  return { full: base, header, nikZone, textFields, rightSide };
}

async function makeVariants(buf: Buffer): Promise<{
  normal: Buffer; highContrast: Buffer; binary: Buffer; binaryLow: Buffer; enhanced: Buffer;
}> {
  const [normal, highContrast, binary, binaryLow, enhanced] = await Promise.all([
    sharp(buf).normalize().sharpen({ sigma: 1.0 }).png().toBuffer(),
    sharp(buf).normalize().linear(1.6, -30).sharpen({ sigma: 1.2 }).png().toBuffer(),
    sharp(buf).normalize().sharpen({ sigma: 1.0 }).threshold(140).png().toBuffer(),
    sharp(buf).normalize().sharpen({ sigma: 1.0 }).threshold(110).png().toBuffer(),
    sharp(buf).normalize().linear(1.3, -10).sharpen({ sigma: 1.5 }).png().toBuffer(),
  ]);
  return { normal, highContrast, binary, binaryLow, enhanced };
}

async function preprocessKtpImage(imageBase64: string): Promise<{
  fullNormal: Buffer; fullBinary: Buffer; fullEnhanced: Buffer;
  cropNormal: Buffer; cropBinary: Buffer; cropBinaryLow: Buffer;
  nikNormal: Buffer; nikBinary: Buffer; nikHighContrast: Buffer;
  headerNormal: Buffer; headerBinary: Buffer;
  textNormal: Buffer; textHighContrast: Buffer; textBinary: Buffer;
}> {
  const { base, w, h } = await buildBaseImage(imageBase64);
  const zones = await extractZones(base, w, h);

  const [fullV, nikV, headerV, textV, rightV] = await Promise.all([
    makeVariants(zones.full),
    makeVariants(zones.nikZone),
    makeVariants(zones.header),
    makeVariants(zones.textFields),
    makeVariants(zones.rightSide),
  ]);

  return {
    fullNormal: fullV.normal,
    fullBinary: fullV.binary,
    fullEnhanced: fullV.enhanced,
    cropNormal: rightV.normal,
    cropBinary: rightV.binary,
    cropBinaryLow: rightV.binaryLow,
    nikNormal: nikV.normal,
    nikBinary: nikV.binary,
    nikHighContrast: nikV.highContrast,
    headerNormal: headerV.normal,
    headerBinary: headerV.binary,
    textNormal: textV.normal,
    textHighContrast: textV.highContrast,
    textBinary: textV.binary,
  };
}


// ─── NIK extraction (aggressive) ─────────────────────────────────────────────
const OCR_DIGIT_MAP: Record<string, string[]> = {
  I: ["1"], i: ["1"], l: ["1"], "|": ["1"], "!": ["1"],
  ")": ["1"], "(": ["1"], "[": ["1"], "]": ["1"],
  L: ["1", "6"], O: ["0"], o: ["0"], D: ["0"], Q: ["0"], q: ["0"],
  B: ["8", "6"], S: ["5"], s: ["5"], G: ["9", "6"],
  Z: ["2"], z: ["2"], "?": ["7"], b: ["6"],
  Y: ["4", "7"], A: ["4"], h: ["4"], T: ["7", "1"],
  g: ["9"], J: ["1"], j: ["1"], t: ["1", "7"],
  C: ["0"], c: ["0"], U: ["0"], u: ["0"],
  R: ["2"], r: ["2"], P: ["9"], p: ["9"],
};

const NIK_CHARS_RE = /[0-9IilOoBbDSGZqQzY?|!()\[\]LAhTgJjtCcUuRrPp\s]{14,20}/g;

function correctNikWithMap(raw: string, choices: number[] = []): string {
  const result: string[] = [];
  let ambIdx = 0;
  for (const ch of raw.replace(/[\s.,:;-]/g, "")) {
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

function validateNik(nik: string | null, strict = true): string | null {
  if (!nik) return null;
  if (!/^\d{16}$/.test(nik)) return null;
  if (!strict) return nik; // loose mode: just trust 16 digits from whitelist OCR
  const dd = parseInt(nik.substring(6, 8));
  const mm = parseInt(nik.substring(8, 10));
  if ((dd < 1 || dd > 31) && (dd < 41 || dd > 71)) return null;
  if (mm < 1 || mm > 12) return null;
  return nik;
}

function extractNik(text: string): string | null {
  const flat = text.replace(/\n/g, " ");

  // Try strict validation first across all strategies
  const seq16 = flat.match(/\b(\d{16})\b/);
  if (seq16 && validateNik(seq16[1])) return seq16[1];

  const joined = flat.replace(/(\d)\s+(\d)/g, "$1$2");
  const seq16j = joined.match(/\b(\d{16})\b/);
  if (seq16j && validateNik(seq16j[1])) return seq16j[1];

  const singleSep = flat.match(/(\d{4,})[.\-\s]+(\d{4,})/g);
  if (singleSep) {
    for (const seg of singleSep) {
      const digits = seg.replace(/[^0-9]/g, "");
      if (digits.length >= 16) {
        for (let i = 0; i <= digits.length - 16; i++) {
          const sub = digits.substring(i, i + 16);
          if (validateNik(sub)) return sub;
        }
      }
    }
  }

  // Try labeled NIK match with correction
  const labeledResult = extractNikLabeled(text);
  if (labeledResult) return labeledResult;

  // Loose validation on all 16-digit sequences (accept if structurally OK)
  const allSeq16 = [...flat.matchAll(/\d{16}/g)];
  for (const m of allSeq16) {
    if (validateNik(m[0], false)) return m[0];
  }

  const labeled = flat.match(/NIK\s*[:\-\.=]?\s*([0-9IilOoBbDSGZqQzY?|!()\[\]LAhTgJjtCcUuRrPp\s.,\-]{14,26})/i);
  if (labeled) {
    const compacted = labeled[1].replace(/[\s.,\-]/g, "");
    if (/^\d{16}$/.test(compacted) && validateNik(compacted)) return compacted;
    for (let c0 = 0; c0 < 3; c0++)
      for (let c1 = 0; c1 < 3; c1++) {
        const fixed = correctNikWithMap(compacted, [c0, c1]);
        if (/^\d{16}$/.test(fixed) && validateNik(fixed)) return fixed;
      }
  }

  const candidates = flat.match(NIK_CHARS_RE) ?? [];
  for (const c of candidates) {
    const compacted = c.replace(/\s/g, "");
    if (compacted.length < 14 || compacted.length > 18) continue;
    for (let c0 = 0; c0 < 3; c0++)
      for (let c1 = 0; c1 < 3; c1++) {
        const fixed = correctNikWithMap(compacted, [c0, c1]);
        if (/^\d{16}$/.test(fixed) && validateNik(fixed)) return fixed;
      }
  }

  const anyLong = flat.match(/\d{14,20}/g) ?? [];
  for (const seg of anyLong) {
    for (let i = 0; i <= seg.length - 16; i++) {
      const sub = seg.substring(i, i + 16);
      if (validateNik(sub)) return sub;
    }
  }

  return null;
}

// ─── Known value lists for validation ─────────────────────────────────────────
const RELIGIONS = ["ISLAM", "KRISTEN", "KATOLIK", "HINDU", "BUDDHA", "KONGHUCU"];

const MARITAL_STATUSES = ["BELUM KAWIN", "KAWIN", "CERAI HIDUP", "CERAI MATI"];

const OCCUPATION_KW = [
  "WIRASWASTA", "KARYAWAN SWASTA", "KARYAWAN", "PNS", "TNI", "POLRI",
  "PETANI", "PEDAGANG", "GURU", "DOKTER", "MAHASISWA", "PELAJAR",
  "IBU RUMAH TANGGA", "BURUH", "NELAYAN", "TIDAK BEKERJA", "SWASTA",
  "PENSIUNAN", "PERANGKAT DESA", "PEGAWAI SWASTA", "PEGAWAI NEGERI",
  "WIRAUSAHA", "HONORER", "SOPIR", "MONTIR", "TUKANG", "SENIMAN",
  "WARTAWAN", "DOSEN", "PILOT", "APOTEKER", "BIDAN", "PERAWAT",
  "TENTARA", "PENELITI", "NOTARIS", "PENGACARA", "ARSITEK",
  "AKUNTAN", "KONSULTAN", "MEKANIK", "SATPAM", "CLEANING SERVICE",
  "OJEK", "DRIVER", "FREELANCER", "KONTRAKTOR", "TEKNISI",
  "PELAUT", "MENGURUS RUMAH TANGGA", "BELUM BEKERJA", "PURNAWIRAWAN",
];

const NOT_A_NAME = new Set([
  "LAKI", "LAKI-LAKI", "PEREMPUAN", "ISLAM", "KRISTEN", "KATOLIK", "HINDU",
  "BUDDHA", "KONGHUCU", "WNI", "WNA", "KAWIN", "BELUM KAWIN", "CERAI",
  "SEUMUR HIDUP", "PROVINSI", "KABUPATEN", "KECAMATAN", "KELURAHAN",
  "KOTA", "NIK", "NAMA", "ALAMAT", "AGAMA", "PEKERJAAN", "KEWARGANEGARAAN",
  "STATUS", "PERKAWINAN", "BERLAKU", "HINGGA", "JENIS", "KELAMIN",
  "TEMPAT", "LAHIR", "GOLONGAN", "DARAH", "DESA", "LENGKAP",
  "TIDAK", "TERDETEKSI", "DAFTARKAN", "PESERTA", "ERGKAO",
]);

const KTP_LABEL_NOISE = [
  "PROVINSI", "KABUPATEN", "KOTA", "NIK", "Nama", "Tempat", "Lahir",
  "Jenis", "Kelamin", "Alamat", "RT", "RW", "Kel", "Desa", "Kecamatan",
  "Agama", "Status", "Perkawinan", "Pekerjaan", "Kewarganegaraan",
  "Berlaku", "Hingga", "Gol", "Darah",
];

// ─── Field-specific cleaners ─────────────────────────────────────────────────

function cleanName(raw: string | null): string | null {
  if (!raw) return null;
  let c = raw.replace(/[^A-Z\s'.\-]/gi, "").trim().toUpperCase();
  c = c.replace(/^(LENGK\S*|LERGK\S*|NAMA\s*LENGK\S*|NAMA)\s+/i, "").trim();
  if (c.length < 3 || c.length > 60) return null;
  // Reject outright if the entire value is an occupation keyword
  const cup = c.trim().toUpperCase();
  if (OCCUPATION_KW.some(kw => cup === kw || cup.startsWith(kw) || kw.startsWith(cup))) return null;
  // Reject if it contains an occupation keyword phrase (multi-word match)
  if (OCCUPATION_KW.some(kw => kw.includes(" ") && cup.includes(kw))) return null;
  let words = c.split(/\s+/).filter(w => w.length >= 2);
  const LABEL_FUZZ = ["LENGKAP", "LERGKAO", "TENGKAP", "ENGKAP", "NAMA"];
  if (words.length >= 2) {
    const first = words[0];
    if (LABEL_FUZZ.some(lf => first.startsWith(lf.substring(0, 4)))) {
      words = words.slice(1);
    }
  }
  if (words.length >= 3) {
    const first = words[0];
    const consonants = (first.match(/[^AIUEO]/g) ?? []).length;
    if (consonants >= first.length * 0.7 && first.length >= 5) {
      words = words.slice(1);
    }
  }
  if (words.length < 1) return null;
  if (words.every(w => NOT_A_NAME.has(w))) return null;
  // Reject if too many words are occupation markers
  if (words.some(w => NOT_A_NAME.has(w) && OCCUPATION_KW.some(kw => kw.includes(w)))) return null;
  if (words.length === 1 && words[0].length < 4) return null;
  if (words.length === 1) {
    const w = words[0];
    const vowels = (w.match(/[AIUEO]/g) ?? []).length;
    if (vowels < w.length * 0.2) return null;
  }
  c = words.join(" ");
  if (c.length < 3) return null;
  return c;
}

function cleanDate(raw: string | null): string | null {
  if (!raw) return null;
  const m = raw.match(/(\d{1,2})[-\/.\s](\d{1,2})[-\/.\s](\d{4})/);
  if (!m) return null;
  const day = parseInt(m[1]), month = parseInt(m[2]), year = parseInt(m[3]);
  if (day < 1 || day > 31 || month < 1 || month > 12 || year < 1930 || year > 2020) return null;
  return `${String(day).padStart(2, "0")}-${String(month).padStart(2, "0")}-${year}`;
}

function cleanGender(raw: string | null): string | null {
  if (!raw) return null;
  if (/laki/i.test(raw)) return "LAKI-LAKI";
  if (/perem/i.test(raw)) return "PEREMPUAN";
  return null;
}

function cleanReligion(raw: string | null): string | null {
  if (!raw) return null;
  return RELIGIONS.find(v => raw.toUpperCase().includes(v)) ?? null;
}

function cleanMarital(raw: string | null): string | null {
  if (!raw) return null;
  const up = raw.toUpperCase();
  if (/BELUM/.test(up)) return "BELUM KAWIN";
  if (/CERAI\s*MATI/.test(up)) return "CERAI MATI";
  if (/CERAI\s*HIDUP/.test(up)) return "CERAI HIDUP";
  if (/KAWIN/.test(up)) return "KAWIN";
  return null;
}

function cleanOccupation(raw: string | null): string | null {
  if (!raw) return null;
  const up = raw.trim().toUpperCase().replace(/[^A-Z\s]/g, " ").replace(/\s+/g, " ").trim();
  if (up.length < 2) return null;
  const exact = OCCUPATION_KW.find(kw => up === kw);
  if (exact) return exact;
  const contains = OCCUPATION_KW.find(kw => up.includes(kw));
  if (contains) return contains;
  const fuzzy = OCCUPATION_KW.find(kw => {
    if (kw.length < 4) return false;
    const prefix = kw.substring(0, Math.ceil(kw.length * 0.7));
    return up.includes(prefix);
  });
  if (fuzzy) return fuzzy;
  if (/^[A-Z\s]{5,30}$/.test(up) && up.split(/\s+/).length <= 4) {
    const words = up.split(/\s+/);
    if (words.every(w => w.length >= 4 && w.length <= 15 && /^[A-Z]+$/.test(w) && /[AIUEO]/.test(w))) return up;
  }
  return null;
}

function cleanNationality(raw: string | null): string | null {
  if (!raw) return null;
  const up = raw.trim().toUpperCase();
  if (up.startsWith("WNI")) return "WNI";
  if (up.startsWith("WNA")) return "WNA";
  if (/\bWNI\b/.test(up)) return "WNI";
  if (/\bWNA\b/.test(up)) return "WNA";
  return null;
}

const PLACE_LABEL_WORDS = new Set([
  "LAHIR", "TEMPAT", "TGL", "DESA", "KEL", "KELURAHAN", "KECAMATAN",
  "RAST", "ESA", "ERDETEKS", "TERDETEKSI", "TIDAK",
]);

function cleanPlace(raw: string | null, maxLen = 40): string | null {
  if (!raw) return null;
  let c = raw.replace(/[^A-Z\s.\-]/gi, "").trim().toUpperCase();
  c = c.replace(/^(LAHIR|TEMPAT|TGL|DESA|KEL)\s+/i, "").trim();
  if (PLACE_LABEL_WORDS.has(c)) return null;
  if (/ERDETEKS|TERDETEKS/i.test(c)) return null;
  c = c.replace(/\s+(PG|NS|SF|EE|CE|LL|XX|ZZ|RM|NM|SM|TM|AM|LM|NI|ND)\s*$/i, "").trim();
  c = c.replace(/\s+[A-Z]{1,2}$/i, "").trim();
  c = c.replace(/(NS|PG|SF|EE|CE|LL|RM|NM|SM|TM)$/i, "").trim();
  if (c.length < 3 || c.length > maxLen) return null;
  if (!/[AIUEO]/.test(c)) return null;
  return c;
}

function cleanAddress(raw: string | null): string | null {
  if (!raw) return null;
  let c = raw.trim().toUpperCase();
  c = c.replace(/[=\-_~]{2,}/g, " ");
  c = c.replace(/^[\s\-=_~.]+/, "");
  c = c.replace(/[\s\-=_~.]+$/, "");
  c = c.replace(/\s{2,}/g, " ");
  c = c.replace(/[^A-Z0-9\s.\-\/,']/g, "").trim();
  if (c.length < 3 || c.length > 150) return null;
  const words = c.split(/\s+/);
  const alphaWords = words.filter(w => /[A-Z]/.test(w));
  if (alphaWords.length < 1) return null;
  return c;
}

function cleanBloodType(raw: string | null): string | null {
  if (!raw) return null;
  const m = raw.toUpperCase().match(/\b([ABO]{1,2})\s*([+-])?\b/);
  if (!m) return null;
  return m[2] ? m[1] + m[2] : m[1];
}

function cleanRtRw(raw: string | null): string | null {
  if (!raw) return null;
  const m = raw.match(/(\d{1,3})\s*[\/\-]\s*(\d{1,3})/);
  if (!m) return null;
  return m[1].padStart(3, "0") + "/" + m[2].padStart(3, "0");
}

// ─── Truncate value at next field label ──────────────────────────────────────
function truncateAtLabel(value: string): string {
  const labelPatterns = [
    /\b(Nama|NIK|Alamat|Agama|Pekerjaan|Kewarganegaraan)\b/i,
    /\b(Tempat|Lahir|Jenis|Kelamin|Status|Perkawinan)\b/i,
    /\b(Kecamatan|Kelurahan|Berlaku|Hingga|Gol\.?\s*Darah)\b/i,
    /\bRT\s*[\/\-]?\s*RW\b/i,
    /\bKel\s*[\/\-]?\s*Desa\b/i,
  ];
  let minIdx = value.length;
  for (const re of labelPatterns) {
    const m = value.match(re);
    if (m?.index !== undefined && m.index > 0 && m.index < minIdx) {
      minIdx = m.index;
    }
  }
  return value.substring(0, minIdx).trim();
}

// ─── KTP text parser ──────────────────────────────────────────────────────────
function parseKtpText(text: string): Record<string, string | null> {
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  const flat = lines.join(" ");

  const findLabel = (labelRe: RegExp): string | null => {
    for (const line of lines) {
      const m = line.match(labelRe);
      if (m?.[1]?.trim()) return truncateAtLabel(m[1].trim());
    }
    return null;
  };

  const findFuzzy = (keywords: string[], valueRe: RegExp): string | null => {
    for (const line of lines) {
      const upper = line.toUpperCase();
      if (keywords.some(kw => upper.includes(kw.toUpperCase()))) {
        const m = line.match(valueRe);
        if (m?.[1]?.trim()) return truncateAtLabel(m[1].trim());
      }
    }
    return null;
  };

  const nik = extractNik(text); // extractNik already validates internally

  // ── Name: multi-strategy extraction
  let nameRaw = findLabel(/^Nama\s*[:\-]?\s*(.{3,60})$/i);
  if (!nameRaw) {
    nameRaw = findFuzzy(["Nama", "Nam"],
      /(?:Nama|Nam\.?)\s*[:\-\*]?\s*([A-Z][A-Za-z\s\-'.]{2,55})/);
  }
  if (!nameRaw) {
    for (const line of lines) {
      const m = line.match(/(?:Nama\s*(?:Lengkap)?|Nam\S*)\s*[:\-\*=]?\s*([A-Z][A-Z\s\-'.]{3,55})/i);
      if (m) {
        const candidate = m[1].trim();
        const words = candidate.split(/\s+/);
        if (words.length >= 1 && !NOT_A_NAME.has(words[0])) {
          nameRaw = candidate;
          break;
        }
      }
    }
  }
  if (!nameRaw) {
    for (const line of lines) {
      const m = line.match(/[:\-\*=]\s*([A-Z][A-Z\s\-'.]{5,50})$/);
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
      const l = lines[i].trim();
      if (/Tempat|Lahir|Tgl/i.test(l)) break;
      if (/^\d{10,}/.test(l)) continue;
      const cleaned = l.replace(/^(Nama\s*(?:Lengkap)?\s*[:\-\*=]?\s*)/i, "").trim();
      const words = cleaned.split(/\s+/);
      if (/^[A-Z][A-Z\s\-'.]{3,49}$/.test(cleaned) && words.length >= 1
          && words.every(w => w.replace(/['.]/g, "").length >= 2)
          && !NOT_A_NAME.has(words[0])) {
        nameRaw = cleaned;
        break;
      }
    }
  }
  if (!nameRaw) {
    const allCapsLines = lines.filter(l => {
      const trimmed = l.trim().toUpperCase();
      const w = trimmed.split(/\s+/);
      return w.length >= 2 && w.length <= 5
        && /^[A-Z\s\-'.]{4,50}$/.test(trimmed)
        && w.every(x => x.length >= 2 && /[AIUEO]/.test(x))
        && !w.some(x => NOT_A_NAME.has(x))
        && !OCCUPATION_KW.some(kw => trimmed === kw || trimmed.includes(kw))
        && !/\d/.test(l)
        && !/PROVINSI|KABUPATEN|KOTA|REPUBLIK/i.test(l);
    });
    if (allCapsLines.length > 0) nameRaw = allCapsLines[0].trim();
  }
  const fullName = cleanName(nameRaw);

  // ── Birth
  const birthRaw = findLabel(/(?:Tempat[\/\s]?Tgl\.?\s*Lahir|Tgl\.?\s*Lahir)\s*[:\-]?\s*(.+)/i)
    ?? findFuzzy(["Lahir", "Tgl", "Tempat"], /(?:Lahir|Tgl|Tempat)\s*[:\-]?\s*(.+)/i);
  let birthPlace: string | null = null;
  let birthDate: string | null = null;
  if (birthRaw) {
    const commaIdx = birthRaw.search(/[,\/]/);
    if (commaIdx > 0) {
      birthPlace = cleanPlace(birthRaw.substring(0, commaIdx));
      birthDate = cleanDate(birthRaw.substring(commaIdx + 1));
    } else {
      birthDate = cleanDate(birthRaw);
      const placeMatch = birthRaw.match(/^([A-Z][A-Za-z\s]{2,25})/);
      if (placeMatch) birthPlace = cleanPlace(placeMatch[1]);
    }
  }
  if (!birthDate) {
    const dateMatch = flat.match(/\b(\d{2}[-\/]\d{2}[-\/]\d{4})\b/);
    if (dateMatch) birthDate = cleanDate(dateMatch[1]);
  }

  // ── Gender
  const gender = cleanGender(
    findLabel(/Jenis\s*Kelamin\s*[:\-]?\s*(.+)/i)
    ?? flat.match(/\b(LAKI[- ]LAKI|PEREMPUAN)\b/i)?.[1] ?? null
  );

  // ── Blood type (often on same line as gender)
  const bloodType = cleanBloodType(
    findLabel(/Gol(?:\.?\s*Darah)?\s*[:\-]?\s*([ABO]{1,2}\s*[+-]?)/i)
    ?? flat.match(/\bGol\S*\s*[:\-]?\s*([ABO]{1,2}\s*[+-]?)/i)?.[1]
    ?? flat.match(/\b([ABO]{1,2}[+-])\b/i)?.[1] ?? null
  );

  // ── Address
  const address = cleanAddress(findLabel(/^Alamat\s*[:\-]?\s*(.{5,120})$/i));

  // ── RT/RW
  const rtRwFromLabel = findLabel(/RT\s*[\/\-]?\s*RW\s*[:\-]?\s*([\d]{1,3}\s*[\/\-]\s*[\d]{1,3})/i);
  let rtRwFallback: string | null = null;
  if (!rtRwFromLabel) {
    const rtRwMatch = flat.match(/\b(\d{1,3})\s*[\/\-]\s*(\d{1,3})\b/);
    if (rtRwMatch) rtRwFallback = `${rtRwMatch[1]}/${rtRwMatch[2]}`;
  }
  const rtRw = cleanRtRw(rtRwFromLabel ?? rtRwFallback);

  // ── Kelurahan
  let kelurahanRaw = findLabel(/(?:Kel\.?\/?Desa|Kelurahan)\s*[:\-]?\s*(.+)/i)
    ?? findFuzzy(["Kelurahan", "Kel.", "Desa"], /(?:Kel|Desa)\S*\s*[:\-]?\s*([A-Z][A-Za-z\s]{2,40})/i);
  if (kelurahanRaw) {
    kelurahanRaw = kelurahanRaw.replace(/^(DESA|KEL\.?)\s+/i, "").trim();
  }
  const kelurahan = cleanPlace(kelurahanRaw);

  // ── Kecamatan
  const kecamatan = cleanPlace(
    findFuzzy(["Kecamatan", "Kocamatan", "ecamat"],
      /[Kk][eo]c?amata?[nl]?\s*[:\-]?\s*([A-Z][A-Za-z\s]{2,40})/i)
    ?? findLabel(/Kecamatan\s*[:\-]?\s*(.+)/i)
  );

  // ── City (from header: "KABUPATEN X" or "KOTA X")
  const cityRaw = (() => {
    const extractCity = (raw: string): string => {
      let val = raw.trim().toUpperCase();
      val = val.replace(/\s+(PROVINSI|NIK|NAMA|ALAMAT|DAFTARKAN)\b.*$/i, "").trim();
      val = val.replace(/\s+[A-Z]{1,2}$/, "").trim();
      return val;
    };
    for (const line of lines.slice(0, Math.min(5, lines.length))) {
      const m = line.match(/(?:KABUPATEN|KOTA)\s+([A-Z][A-Za-z\s]{2,35})/i);
      if (m) return extractCity(m[1]);
    }
    const labelVal = findLabel(/(?:KABUPATEN|KOTA)\s+([A-Z][A-Za-z\s]{2,35})/i);
    if (labelVal) return extractCity(labelVal);
    const flatMatch = flat.match(/(?:KABUPATEN|KOTA)\s+([A-Z][A-Za-z\s]{2,35})/i);
    return flatMatch ? extractCity(flatMatch[1]) : null;
  })();
  const city = cleanPlace(cityRaw, 50);

  // ── Province (from header, first 3 lines)
  const province = (() => {
    const extractProvince = (raw: string): string | null => {
      let val = raw.replace(/[|]/g, "I").trim().toUpperCase();
      val = val.replace(/\s+(ALAMAT|KABUPATEN|KOTA|NIK|NAMA)\b.*$/i, "").trim();
      val = val.replace(/\s+[A-Z]{1,2}$/, "").trim();
      return cleanPlace(val, 50);
    };
    for (const line of lines.slice(0, Math.min(4, lines.length))) {
      const m = line.match(/PROVINS[I|1l]\s+([A-Z][A-Za-z\s|]{2,40})/i);
      if (m) return extractProvince(m[1]);
    }
    const fromFlat = flat.match(/PROVINS[I|1l]\s+([A-Z][A-Za-z\s|]{2,40})/i);
    return fromFlat ? extractProvince(fromFlat[1]) : null;
  })();

  // ── Religion
  const religion = cleanReligion(
    findLabel(/Agama\s*[:\-]?\s*(.+)/i)
    ?? flat.match(/\b(Islam|Kristen|Katolik|Hindu|Buddha|Konghucu)\b/i)?.[1] ?? null
  );

  // ── Marital status
  const maritalStatus = cleanMarital(
    findLabel(/(?:Status\s*)?Perkawinan\s*[:\-]?\s*(.+)/i)
    ?? flat.match(/\b(KAWIN|BELUM KAWIN|CERAI HIDUP|CERAI MATI)\b/i)?.[1] ?? null
  );

  // ── Occupation (validated against known list)
  const occupationRaw = findLabel(/Pekerjaan\s*[:\-]?\s*(.+)/i)
    ?? findFuzzy(["Pekerjaan", "Peke", "kerja"],
      /(?:Pekerjaan|Peke\S*)\s*[:\-]?\s*([A-Za-z\s]{3,60})/i);
  let occupation = cleanOccupation(occupationRaw);
  if (!occupation) {
    const flatUp = flat.toUpperCase().replace(/[^A-Z\s]/g, " ");
    const kwMatch = OCCUPATION_KW.find(kw => flatUp.includes(kw));
    occupation = kwMatch ?? null;
  }

  // ── Nationality (strict: only WNI or WNA)
  const nationality = cleanNationality(
    findLabel(/Kewarganegaraan\s*[:\-]?\s*(.+)/i)
    ?? flat.match(/\b(WNI|WNA)\b/i)?.[1] ?? null
  );

  // ── Valid until
  const validUntil = findLabel(/Berlaku\s*Hingga\s*[:\-]?\s*([\d\-\/]+|SEUMUR\s*HIDUP)/i)
    ?? findFuzzy(["Berlaku", "Hingga"],
      /(?:Berlaku|Hingga)\s*[:\-\*]?\s*([\d\-\/]{8,10}|SEUMUR\s*HIDUP)/i);

  return {
    nik, fullName, address, birthPlace, birthDate,
    gender, religion, maritalStatus, occupation, nationality,
    rtRw, kelurahan, kecamatan, province, city, bloodType, validUntil,
  };
}

// ─── Scoring ────────────────────────────────────────────────────────────────
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

// ─── Smart merge: pick the best value for each field ─────────────────────────
function fieldQuality(field: string, value: string | null): number {
  if (!value) return 0;
  switch (field) {
    case "nik":
      return /^\d{16}$/.test(value) && validateNik(value) ? 100 : 0;
    case "fullName": {
      const words = value.split(/\s+/);
      if (words.some(w => NOT_A_NAME.has(w))) return 5;
      if (words.length < 2) return 20;
      return 40 + Math.min(words.length * 10, 30) + Math.min(value.length, 20);
    }
    case "occupation":
      if (OCCUPATION_KW.some(kw => value.toUpperCase().includes(kw))) return 100;
      if (/[^A-Z\s.\-]/i.test(value)) return 0;
      return 30;
    case "nationality":
      return (value === "WNI" || value === "WNA") ? 100 : 0;
    case "religion":
      return RELIGIONS.includes(value) ? 100 : 0;
    case "maritalStatus":
      return MARITAL_STATUSES.includes(value) ? 100 : 0;
    case "gender":
      return (value === "LAKI-LAKI" || value === "PEREMPUAN") ? 100 : 0;
    case "bloodType":
      return /^[ABO]{1,2}[+-]?$/.test(value) ? 100 : 0;
    case "birthDate":
      return /^\d{2}-\d{2}-\d{4}$/.test(value) ? 100 : 0;
    default:
      if (!value || value.length < 3) return 5;
      const garbageRatio = (value.match(/[^A-Z0-9\s.\-\/,']/gi) ?? []).length / value.length;
      return garbageRatio > 0.3 ? 10 : 50 + Math.min(value.length, 30);
  }
}

const HEADER_FIELDS = new Set(["province", "city", "nik"]);
const TEXT_FIELDS = new Set(["fullName", "birthPlace", "birthDate", "gender", "religion",
  "maritalStatus", "occupation", "nationality", "address", "rtRw", "kelurahan", "kecamatan", "bloodType"]);

function smartMerge(
  results: Record<string, string | null>[],
  passTypes?: ("full" | "crop")[]
): Record<string, string | null> {
  if (!results.length) return {};
  const allKeys = new Set(results.flatMap(r => Object.keys(r)));
  const merged: Record<string, string | null> = {};

  for (const key of allKeys) {
    let bestVal: string | null = null;
    let bestScore = -1;
    for (let i = 0; i < results.length; i++) {
      const val = results[i][key] ?? null;
      let score = fieldQuality(key, val);
      if (passTypes && passTypes[i]) {
        const pt = passTypes[i];
        if (HEADER_FIELDS.has(key) && pt === "full") score += 10;
        if (TEXT_FIELDS.has(key) && pt === "crop") score += 10;
      }
      if (score > bestScore) {
        bestScore = score;
        bestVal = val;
      }
    }
    merged[key] = bestVal;
  }

  return merged;
}

// ─── Post-merge cross-validation ─────────────────────────────────────────────
function crossValidate(data: Record<string, string | null>): Record<string, string | null> {
  const d = { ...data };

  const fuzzyMatch = (a: string, b: string): boolean => {
    const na = a.replace(/\s+/g, "").toUpperCase();
    const nb = b.replace(/\s+/g, "").toUpperCase();
    return na === nb || na.includes(nb) || nb.includes(na);
  };
  if (d.fullName && d.kelurahan && fuzzyMatch(d.fullName, d.kelurahan)) {
    d.fullName = null;
  }
  if (d.fullName && d.kecamatan && fuzzyMatch(d.fullName, d.kecamatan)) {
    d.fullName = null;
  }
  if (d.fullName && d.city && fuzzyMatch(d.fullName, d.city)) {
    d.fullName = null;
  }
  if (d.fullName && d.address && fuzzyMatch(d.fullName, d.address.split(/\s+/).slice(0, 3).join(" "))) {
    d.fullName = null;
  }

  if (d.nationality && d.nationality !== "WNI" && d.nationality !== "WNA") {
    d.nationality = null;
  }

  if (d.occupation) {
    const up = d.occupation.toUpperCase();
    if (/\d{3,}/.test(up) || up.length > 40) d.occupation = null;
    const hasGarbage = (up.match(/[^A-Z\s]/g) ?? []).length;
    if (hasGarbage > 2) d.occupation = null;
  }

  if (d.kelurahan) {
    d.kelurahan = d.kelurahan.replace(/\s+(SF|NS|PG|EE|CE|LL)\s*$/i, "").trim();
    d.kelurahan = d.kelurahan.replace(/(NS|PG|SF|EE|CE|LL)$/i, "").trim();
  }
  if (d.kecamatan) {
    d.kecamatan = d.kecamatan.replace(/\s+(SF|NS|PG|EE|CE|LL)\s*$/i, "").trim();
    d.kecamatan = d.kecamatan.replace(/(NS|PG|SF|EE|CE|LL)$/i, "").trim();
  }

  const UI_NOISE = ["DAFTARKAN", "PESERTA", "UPLOAD", "BUKA KAMERA", "EDIT", "PILIH", "EVENT"];
  if (d.city) {
    const up = d.city.toUpperCase();
    if (UI_NOISE.some(n => up.includes(n))) d.city = null;
  }
  if (d.province) {
    let prov = d.province;
    prov = prov.replace(/\s+(ALAMAT|KABUPATEN|KOTA|NIK|NAMA|GOLONGAN|DARAH|TIDAK|TERDETEKSI|ALAMEAS\S*|MARAIS\S*)\b.*$/i, "").trim();
    const provWords = prov.split(/\s+/);
    const PROV_STOP = new Set(["GOLONGAN", "DARAH", "TIDAK", "TERDETEKSI", "ALAMAT", "NIK", "NAMA", "DAFTARKAN", "PESERTA"]);
    const cleanProvWords: string[] = [];
    for (const w of provWords) {
      if (PROV_STOP.has(w)) break;
      if (/^[A-Z]{2,20}$/.test(w)) cleanProvWords.push(w);
      else break;
    }
    d.province = cleanProvWords.length >= 1 ? cleanProvWords.join(" ") : null;
  }

  if (d.kecamatan) {
    const kecUp = d.kecamatan.toUpperCase();
    if (kecUp.includes("TIDAK") || kecUp.includes("TERDETEKSI") || kecUp.includes("IDAK")) {
      d.kecamatan = null;
    }
  }

  // ── Birth place: fuzzy-match against kabupaten/kota database
  if (d.birthPlace) {
    const bpMatch = matchBirthPlace(d.birthPlace);
    // Only replace if the match is a clear improvement (high confidence)
    if (bpMatch && bpMatch.score >= 0.75) {
      // Store the short city name (strip KOTA/KABUPATEN prefix for display)
      d.birthPlace = bpMatch.name.replace(/^KOTA\s+/i, "").replace(/^KABUPATEN\s+/i, "").trim();
    } else if (d.birthPlace.length < 3 || /\d{4,}/.test(d.birthPlace)) {
      d.birthPlace = null;
    }
  }

  // ── Clean kelurahan / kecamatan garbage
  for (const fld of ["kelurahan", "kecamatan"] as const) {
    if (!d[fld]) continue;
    let val = d[fld]!
      .replace(/[=\-\+\|\*#@!]{2,}/g, " ")  // garbage runs
      .replace(/\s+/g, " ")
      .trim()
      .toUpperCase();
    // Reject if looks like OCR noise (mostly digits, or too short, or label noise)
    if (/\d{3,}/.test(val) || val.length < 3) { d[fld] = null; continue; }
    if (["TIDAK TERDETEKSI", "TERDETEKSI", "IDAK", "TIDAK"].some(n => val.includes(n))) { d[fld] = null; continue; }
    // Strip dangling OCR garbage at end (1-2 mystery uppercase letters)
    val = val.replace(/(\s+[A-Z]{1,2}){1,3}$/, "").trim();
    d[fld] = val || null;
  }

  // ── Region resolution: NIK takes absolute priority for province + city
  const resolved = resolveRegions({
    nik: d.nik,
    province: d.province,
    city: d.city,
  });

  // NIK takes absolute priority: province and city derived from NIK always win
  if (resolved.province) d.province = resolved.province;
  if (resolved.city) d.city = resolved.city;

  return d;
}

// ─── OCR orchestration — zone-based extraction ──────────────────────────────
// Strategy:
//   Round 1: Dedicated NIK zone OCR (digits whitelist), header OCR, text fields OCR, full image OCR
//   Round 2: Binary variants of each zone
//   Round 3: Additional fallback passes with different thresholds
// Each zone is OCR'd independently with optimal settings for that content type.

async function extractNikFromZone(worker: TessWorker, images: Awaited<ReturnType<typeof preprocessKtpImage>>): Promise<string | null> {
  const nikBuffers = [images.nikNormal, images.nikHighContrast, images.nikBinary];

  // Pass 1: PSM 7 (single line) with digit whitelist
  await worker.setParameters({
    tessedit_pageseg_mode: "7" as any,
    tessedit_char_whitelist: "0123456789",
  } as any);
  for (const buf of nikBuffers) {
    const result = await worker.recognize(buf);
    const text = result.data.text.replace(/[\s\n\r]/g, "");
    // Strict first
    const found = bestNikFromDigitString(text, true);
    if (found) return found;
    // Loose (trust whitelist OCR)
    const foundLoose = bestNikFromDigitString(text, false);
    if (foundLoose) return foundLoose;
  }

  // Pass 2: PSM 6 (block) with digit + space whitelist — handles spaced NIK
  await worker.setParameters({
    tessedit_pageseg_mode: "6" as any,
    tessedit_char_whitelist: "0123456789 \t",
  } as any);
  for (const buf of nikBuffers) {
    const result = await worker.recognize(buf);
    const collapsed = result.data.text.replace(/[\s\n\r]/g, "");
    const found = bestNikFromDigitString(collapsed, true) ?? bestNikFromDigitString(collapsed, false);
    if (found) return found;
  }

  // Pass 3: full image NIK band with no whitelist (PSM 11 sparse)
  await worker.setParameters({
    tessedit_pageseg_mode: "11" as any,
    tessedit_char_whitelist: "",
  } as any);
  const fullBandResult = await worker.recognize(images.nikNormal);
  const labeledNik = extractNikLabeled(fullBandResult.data.text);
  if (labeledNik) return labeledNik;

  // Reset worker to normal
  await worker.setParameters({
    tessedit_pageseg_mode: "6" as any,
    preserve_interword_spaces: "1" as any,
  } as any);
  return null;
}

function bestNikFromDigitString(digits: string, strict: boolean): string | null {
  if (digits.length < 16) return null;
  if (digits.length === 16) return validateNik(digits, strict);
  // Slide window: find the best 16-digit window
  const candidates: string[] = [];
  for (let i = 0; i <= digits.length - 16; i++) {
    const sub = digits.substring(i, i + 16);
    if (/^\d{16}$/.test(sub)) {
      const v = validateNik(sub, strict);
      if (v) candidates.push(v);
    }
  }
  return candidates[0] ?? null;
}

function extractNikLabeled(text: string): string | null {
  const flat = text.replace(/\n/g, " ");
  const labeled = flat.match(/NIK\s*[:\-\.=]?\s*([\d\s\.,\-IilOoBbSsZzGgQq]{14,30})/i);
  if (!labeled) return null;
  const raw = labeled[1].replace(/[\s.,\-]/g, "");
  // try strict
  const strict = bestNikFromDigitString(raw, true) ?? null;
  if (strict) return strict;
  // correct common OCR letter→digit substitutions
  const corrected = raw.split("").map(c => {
    const m = OCR_DIGIT_MAP[c];
    return m ? m[0] : c;
  }).join("");
  return bestNikFromDigitString(corrected, false) ?? null;
}

async function runOcrPasses(imageBase64: string): Promise<{
  data: Record<string, string | null>; score: number; qualityWarning: QualityWarning;
}> {
  let rawB64 = imageBase64;
  const durlMatch = rawB64.match(/^data:[^;]+;base64,(.+)$/);
  if (durlMatch) rawB64 = durlMatch[1];
  const inputBuf = Buffer.from(rawB64, "base64");

  const [qualityInfo, images] = await Promise.all([
    detectImageQuality(inputBuf),
    preprocessKtpImage(rawB64),
  ]);

  const [wA, wB, wC, wD] = await Promise.all([
    initWorker("a"), initWorker("b"), initWorker("c"), initWorker("d"),
  ]);

  const zoneNik = extractNikFromZone(wD, images);

  await Promise.all([
    wA.setParameters({ tessedit_pageseg_mode: "6" as any, preserve_interword_spaces: "1" as any }),
    wB.setParameters({ tessedit_pageseg_mode: "4" as any, preserve_interword_spaces: "1" as any }),
    wC.setParameters({ tessedit_pageseg_mode: "6" as any, preserve_interword_spaces: "1" as any }),
  ]);
  const [rFullNorm, rTextNorm, rHeaderNorm] = await Promise.all([
    wA.recognize(images.fullNormal),
    wB.recognize(images.textNormal),
    wC.recognize(images.headerNormal),
  ]);

  await Promise.all([
    wA.setParameters({ tessedit_pageseg_mode: "6" as any }),
    wB.setParameters({ tessedit_pageseg_mode: "4" as any }),
    wC.setParameters({ tessedit_pageseg_mode: "6" as any }),
  ]);
  const [rFullBin, rTextHC, rHeaderBin] = await Promise.all([
    wA.recognize(images.fullBinary),
    wB.recognize(images.textHighContrast),
    wC.recognize(images.headerBinary),
  ]);

  await Promise.all([
    wA.setParameters({ tessedit_pageseg_mode: "4" as any }),
    wB.setParameters({ tessedit_pageseg_mode: "6" as any }),
    wC.setParameters({ tessedit_pageseg_mode: "11" as any }),
  ]);
  const [rCropNorm, rCropBin, rFullEnh] = await Promise.all([
    wA.recognize(images.cropNormal),
    wB.recognize(images.cropBinary),
    wC.recognize(images.fullEnhanced),
  ]);

  await Promise.all([
    wA.setParameters({ tessedit_pageseg_mode: "6" as any }),
    wB.setParameters({ tessedit_pageseg_mode: "4" as any }),
  ]);
  const [rCropBinLow, rTextBin] = await Promise.all([
    wA.recognize(images.cropBinaryLow),
    wB.recognize(images.textBinary),
  ]);

  const zoneNikResult = await zoneNik;

  const allResults = [
    rFullNorm, rTextNorm, rHeaderNorm,
    rFullBin, rTextHC, rHeaderBin,
    rCropNorm, rCropBin, rFullEnh,
    rCropBinLow, rTextBin,
  ];

  const filteredTexts = allResults.map(r =>
    filterByConfidence(r.data.words, r.data.text, 8)
  );
  const rawTexts = allResults.map(r => r.data.text);

  const headerTexts = [
    filteredTexts[2], rawTexts[2],
    filteredTexts[5], rawTexts[5],
  ];
  const textFieldTexts = [
    filteredTexts[1], rawTexts[1],
    filteredTexts[4], rawTexts[4],
    filteredTexts[10], rawTexts[10],
  ];

  const parsed = filteredTexts.map(t => parseKtpText(t));
  const parsedRaw = rawTexts.map(t => parseKtpText(t));

  if (zoneNikResult) {
    parsed[0].nik = zoneNikResult;
  }

  const nikFound = [...parsed, ...parsedRaw].some(p => p.nik);
  if (!nikFound) {
    for (const rawT of rawTexts) {
      const nik = extractNik(rawT);
      if (nik) { parsed[0].nik = nik; break; }
    }
    if (!parsed[0].nik) {
      for (const filtT of filteredTexts) {
        const nik = extractNik(filtT);
        if (nik) { parsed[0].nik = nik; break; }
      }
    }
  }

  for (const headerText of headerTexts) {
    const headerParsed = parseKtpText(headerText);
    if (headerParsed.province && !parsed.some(p => p.province)) {
      parsed[0].province = headerParsed.province;
    }
    if (headerParsed.city && !parsed.some(p => p.city)) {
      parsed[0].city = headerParsed.city;
    }
  }

  for (const tfText of textFieldTexts) {
    const tfParsed = parseKtpText(tfText);
    for (const key of ["fullName", "birthPlace", "birthDate", "gender", "religion",
      "maritalStatus", "occupation", "address", "rtRw", "kelurahan", "kecamatan"] as const) {
      if (tfParsed[key] && !parsed.some(p => p[key])) {
        parsed[0][key] = tfParsed[key];
      }
    }
  }

  const allParsed = [...parsed, ...parsedRaw];
  const basePassTypes: ("full" | "crop")[] = [
    "full",  // rFullNorm
    "crop",  // rTextNorm
    "full",  // rHeaderNorm
    "full",  // rFullBin
    "crop",  // rTextHC
    "full",  // rHeaderBin
    "crop",  // rCropNorm
    "crop",  // rCropBin
    "full",  // rFullEnh
    "crop",  // rCropBinLow
    "crop",  // rTextBin
  ];
  const passTypes: ("full" | "crop")[] = [
    ...basePassTypes,
    ...basePassTypes,
  ];
  const merged = smartMerge(allParsed, passTypes);

  if (zoneNikResult && (!merged.nik || !validateNik(merged.nik))) {
    merged.nik = zoneNikResult;
  }

  const validated = crossValidate(merged);
  const score = scoreKtpData(validated);

  return { data: validated, score, qualityWarning: qualityInfo.warning };
}

async function ocrWithTesseract(imageBase64: string): Promise<{
  data: Record<string, string | null>; score: number; qualityWarning: QualityWarning;
}> {
  const result = _scanChain.then(() => runOcrPasses(imageBase64));
  _scanChain = result.catch(() => {});
  return result;
}

// ─── Gemini Vision scanner (primary) ─────────────────────────────────────────
const GEMINI_KTP_PROMPT = `Kamu adalah sistem pembaca KTP Indonesia yang sangat teliti.
Ekstrak semua data dari foto KTP ini dan kembalikan HANYA JSON valid tanpa komentar, tanpa markdown, tanpa backtick.

Format JSON yang harus dikembalikan:
{
  "nik": "16 digit NIK (hanya angka)",
  "fullName": "NAMA LENGKAP (huruf kapital)",
  "birthPlace": "TEMPAT LAHIR (huruf kapital)",
  "birthDate": "DD-MM-YYYY",
  "gender": "LAKI-LAKI atau PEREMPUAN",
  "bloodType": "golongan darah (A/B/AB/O atau null)",
  "address": "ALAMAT LENGKAP (huruf kapital)",
  "rtRw": "RT/RW (contoh: 001/002)",
  "kelurahan": "KELURAHAN/DESA (huruf kapital)",
  "kecamatan": "KECAMATAN (huruf kapital)",
  "city": "KABUPATEN/KOTA (huruf kapital, tanpa kata KABUPATEN/KOTA di depan)",
  "province": "PROVINSI (huruf kapital, tanpa kata PROVINSI di depan)",
  "religion": "AGAMA (huruf kapital)",
  "maritalStatus": "STATUS PERKAWINAN (huruf kapital)",
  "occupation": "PEKERJAAN (huruf kapital)",
  "nationality": "WNI"
}

Aturan penting:
- NIK harus tepat 16 digit angka saja, jangan ada spasi atau karakter lain
- Jika field tidak terbaca/tidak ada, gunakan null (bukan string kosong)
- Jangan mengarang data yang tidak ada di foto
- Nama jangan diisi dengan jabatan/pekerjaan
- Kembalikan HANYA JSON, tidak ada teks lain`;

async function compressForGemini(base64: string): Promise<string> {
  try {
    const buf = Buffer.from(base64, "base64");
    const compressed = await sharp(buf)
      .resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80, progressive: false })
      .toBuffer();
    return compressed.toString("base64");
  } catch {
    return base64; // fallback: return original if compression fails
  }
}

async function scanWithGemini(imageBase64: string, model = "gemini-2.5-flash"): Promise<Record<string, unknown>> {
  if (!_gemini) throw new Error("GEMINI_API_KEY not configured");

  let rawB64 = imageBase64;
  const durlMatch = rawB64.match(/^data:([^;]+);base64,(.+)$/);
  if (durlMatch) rawB64 = durlMatch[2];

  // Kompres gambar sebelum dikirim ke Gemini untuk hemat token
  rawB64 = await compressForGemini(rawB64);
  const mimeType = "image/jpeg"; // selalu JPEG setelah kompresi

  const result = await _gemini.models.generateContent({
    model,
    contents: [{
      role: "user",
      parts: [
        { inlineData: { mimeType, data: rawB64 } },
        { text: GEMINI_KTP_PROMPT },
      ],
    }],
    config: {
      temperature: 0,
      maxOutputTokens: 4096,
    },
  });

  const text = (result.text ?? "").trim();
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`Gemini returned no JSON: ${text.slice(0, 200)}`);

  // If JSON was truncated, try to repair it by closing open structures
  let jsonStr = jsonMatch[0];
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    // Attempt repair: truncate at last complete key-value pair
    const lastComma = jsonStr.lastIndexOf(",");
    if (lastComma > 0) {
      jsonStr = jsonStr.slice(0, lastComma) + "}";
    } else {
      jsonStr += "}";
    }
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      throw new Error(`Gemini JSON parse failed: ${jsonStr.slice(0, 200)}`);
    }
  }

  // Clean NIK: keep only digits
  if (typeof parsed.nik === "string") {
    parsed.nik = parsed.nik.replace(/\D/g, "");
    if (parsed.nik.length !== 16) parsed.nik = null;
  }

  return parsed;
}

// ─── Python scanner (fallback) ────────────────────────────────────────────────
const PYTHON_SCRIPT = path.resolve(_thisDir, "..", "src", "ktp_scanner.py");

function scanWithPython(imageBase64: string): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const py = spawn("python3", [PYTHON_SCRIPT], {
      env: { ...process.env },
    });
    let stdout = "";
    let stderr = "";
    py.stdout.on("data", (d) => { stdout += d.toString(); });
    py.stderr.on("data", (d) => { stderr += d.toString(); });
    py.on("error", reject);
    py.on("close", (code) => {
      if (!stdout.trim()) {
        return reject(new Error(`Python scanner exited ${code}: ${stderr.slice(0, 300)}`));
      }
      try {
        resolve(JSON.parse(stdout.trim()));
      } catch {
        reject(new Error(`Invalid JSON from Python: ${stdout.slice(0, 200)}`));
      }
    });
    py.stdin.write(JSON.stringify({ imageBase64 }));
    py.stdin.end();
  });
}

// ─── Chandra OCR via HuggingFace ZeroGPU Space (free) ───────────────────────
async function scanWithChandraHF(imageBase64: string): Promise<Record<string, string | null>> {
  // Compress image before sending (reuse Gemini compressor)
  let rawB64 = imageBase64;
  const durlMatch = rawB64.match(/^data:([^;]+);base64,(.+)$/);
  if (durlMatch) rawB64 = durlMatch[2];
  rawB64 = await compressForGemini(rawB64);

  const imgBuffer = Buffer.from(rawB64, "base64");
  const blob = new Blob([imgBuffer], { type: "image/jpeg" });

  const connectOpts: Record<string, unknown> = {};
  if (process.env.HF_TOKEN) connectOpts.hf_token = process.env.HF_TOKEN;

  const client = await GradioClient.connect("victor/chandra-ocr-2", connectOpts as any);

  const result = await client.predict("/run_ocr", {
    image: blob,
    prompt_type: "ocr_layout",
    max_tokens: 4096,
  } as any);

  const raw = result.data;
  const ocrText = Array.isArray(raw) ? String(raw[0]) : String(raw);

  if (!ocrText || ocrText.trim().length < 10) {
    throw new Error("Chandra HF returned empty or too-short text");
  }

  // Parse raw OCR text into structured KTP fields using existing parser
  const parsed = parseKtpText(ocrText);
  return applyRegionMatching(parsed);
}

/** Apply region database matching on top of raw Python OCR result */
function applyRegionMatching(raw: Record<string, unknown>): Record<string, string | null> {
  const str = (v: unknown) => (typeof v === "string" && v.length > 0 ? v : null);

  const d: Record<string, string | null> = {
    nik: str(raw.nik),
    fullName: str(raw.fullName),
    birthPlace: str(raw.birthPlace),
    birthDate: str(raw.birthDate),
    gender: str(raw.gender),
    bloodType: str(raw.bloodType),
    religion: str(raw.religion),
    maritalStatus: str(raw.maritalStatus),
    occupation: str(raw.occupation),
    nationality: str(raw.nationality),
    address: str(raw.address),
    rtRw: str(raw.rtRw),
    kelurahan: str(raw.kelurahan),
    kecamatan: str(raw.kecamatan),
    province: str(raw.province),
    city: str(raw.city),
  };

  // Birth place: fuzzy-match against kabupaten/kota database
  if (d.birthPlace) {
    const bpMatch = matchBirthPlace(d.birthPlace);
    if (bpMatch && bpMatch.score >= 0.75) {
      d.birthPlace = bpMatch.name.replace(/^KOTA\s+/i, "").replace(/^KABUPATEN\s+/i, "").trim();
    }
  }

  // Province + city: NIK-first authoritative resolution
  const resolved = resolveRegions({ nik: d.nik, province: d.province, city: d.city });
  if (resolved.province) d.province = resolved.province;
  if (resolved.city) d.city = resolved.city;

  return d;
}

// ─── Scan endpoint ────────────────────────────────────────────────────────────
router.post("/scan", async (req, res) => {
  try {
    const { imageBase64 } = ScanBody.parse(req.body);

    let data: Record<string, string | null>;
    let score: number;
    let qualityWarning: QualityWarning = null;
    let engine = "chandra-hf";

    // 1. Gemini dimatikan sementara — langsung ke Chandra HF
    if (false && _gemini) {
      const geminiModels = ["gemini-2.0-flash"];
      let allGeminiFailed = true;
      for (const geminiModel of geminiModels) {
        let transientFail = false;
        for (let attempt = 0; attempt < 2; attempt++) {
          if (attempt > 0) await new Promise((r) => setTimeout(r, 2000));
          try {
            const geminiResult = await scanWithGemini(imageBase64, geminiModel);
            data = applyRegionMatching(geminiResult);
            const filledFields = Object.values(data).filter((v) => v !== null && v !== "").length;
            score = Math.round((filledFields / 16) * 100);
            engine = geminiModel;
            req.log.info({ score, engine, attempt }, "KTP scan via Gemini");
            return res.json({
              ...data,
              _meta: { tesseractScore: score, qualityWarning: null, lowConfidence: score < 50, engine },
            });
          } catch (err: unknown) {
            const status = (err as { status?: number }).status;
            if (status === 503 || status === 429) {
              req.log.warn({ attempt, status, model: geminiModel }, "Gemini transient error, retrying...");
              transientFail = true;
            } else {
              req.log.warn({ err, model: geminiModel }, "Gemini non-transient error, trying next model");
              break;
            }
          }
        }
        if (!transientFail) { allGeminiFailed = true; break; }
        // transient fail → try next model
        req.log.warn({ model: geminiModel }, `${geminiModel} overloaded, trying next Gemini model...`);
      }
      if (allGeminiFailed) {
        req.log.warn("All Gemini models failed, falling back to Python OCR");
      }
      engine = "python-opencv";
    }

    // 2. Fallback: Chandra OCR via HuggingFace ZeroGPU (free, 90s timeout)
    try {
      req.log.info("Trying Chandra HF (ZeroGPU)...");
      const chandraResult = await Promise.race([
        scanWithChandraHF(imageBase64),
        new Promise<never>((_, rej) =>
          setTimeout(() => rej(new Error("Chandra HF timeout after 90s")), 90_000)
        ),
      ]);
      data = chandraResult;
      const filledFields = Object.values(data).filter((v) => v !== null && v !== "").length;
      score = Math.round((filledFields / 16) * 100);
      engine = "chandra-hf";
      req.log.info({ score, engine }, "KTP scan via Chandra HF");
      const lowConfidence = score < 65;
      return res.json({
        ...data,
        _meta: { tesseractScore: score, qualityWarning: null, lowConfidence, engine },
      });
    } catch (chandraErr) {
      req.log.warn({ err: chandraErr }, "Chandra HF failed, falling back to Python OCR");
      engine = "python-opencv";
    }

    // 3. Fallback: Python OpenCV + Tesseract
    const pyResult = await scanWithPython(imageBase64);
    if (pyResult.error) throw new Error(String(pyResult.error));
    data = applyRegionMatching(pyResult);
    score = typeof pyResult.score === "number" ? pyResult.score : 0;
    engine = "python-opencv";

    const lowConfidence = score < 65;
    req.log.info({ score, qualityWarning, lowConfidence, engine }, "KTP scan");
    return res.json({
      ...data,
      _meta: { tesseractScore: score, qualityWarning, lowConfidence, engine },
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
    const { eventId, staffId, staffName, phone, email, socialStatus, notes, tags, nik, fullName, ...rest } = body;

    let participant = await db.query.participantsTable.findFirst({
      where: eq(participantsTable.nik, nik),
    });
    const isNewParticipant = !participant;

    const participantFields = {
      ...rest,
      ...(phone ? { phone } : {}),
      ...(email ? { email } : {}),
      ...(socialStatus ? { socialStatus } : {}),
    };

    if (!participant) {
      const [p] = await db.insert(participantsTable).values({ nik, fullName, ...participantFields }).returning();
      participant = p;
    } else {
      await db.update(participantsTable)
        .set({ fullName, ...participantFields, updatedAt: new Date() })
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

router.post("/save-image", async (req, res) => {
  try {
    const { nik, imageBase64, eventToken } = req.body;
    if (!nik || !imageBase64) return res.status(400).json({ error: "NIK and image required" });

    const isAuthed = !!(req as any).session?.userId;
    if (!isAuthed) {
      if (!eventToken) return res.status(401).json({ error: "Token event diperlukan" });
      const { eventsTable } = await import("@workspace/db");
      const { or } = await import("drizzle-orm");
      const evt = await db.query.eventsTable.findFirst({
        where: or(eq(eventsTable.registrationToken, eventToken), eq(eventsTable.attendanceToken, eventToken)),
      });
      if (!evt) return res.status(403).json({ error: "Token tidak valid" });
    }

    const participant = await db.query.participantsTable.findFirst({
      where: eq(participantsTable.nik, nik),
    });
    if (!participant) return res.status(404).json({ error: "Peserta tidak ditemukan" });
    if (participant.ktpImagePath) {
      return res.json({ success: true, message: "KTP image sudah tersimpan", path: participant.ktpImagePath });
    }

    let rawB64 = imageBase64;
    const durlMatch = rawB64.match(/^data:[^;]+;base64,(.+)$/);
    if (durlMatch) rawB64 = durlMatch[1];
    const inputBuf = Buffer.from(rawB64, "base64");

    const compressed = await sharp(inputBuf)
      .resize(800, 500, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 60 })
      .toBuffer();

    const filename = `ktp_${nik}_${Date.now()}.jpg`;
    let imagePath: string;

    try {
      imagePath = await _objectStorage.uploadObjectBuffer(filename, compressed, "image/jpeg");
      req.log.info({ nik, size: compressed.length, path: imagePath }, "KTP image saved to object storage");
    } catch (storageErr) {
      req.log.warn({ err: storageErr }, "Object storage upload failed, falling back to base64 in DB");
      imagePath = `data:image/jpeg;base64,${compressed.toString("base64")}`;
    }

    await db.update(participantsTable)
      .set({ ktpImagePath: imagePath })
      .where(eq(participantsTable.id, participant.id));

    return res.json({ success: true, path: filename, sizeKb: Math.round(compressed.length / 1024) });
  } catch (err) {
    req.log.error({ err }, "Save KTP image error");
    return res.status(500).json({ error: "Gagal menyimpan gambar KTP" });
  }
});

router.get("/image/:nik", requireAuth, async (req, res) => {
  try {
    const participant = await db.query.participantsTable.findFirst({
      where: eq(participantsTable.nik, req.params.nik),
    });
    if (!participant || !participant.ktpImagePath) {
      return res.status(404).send();
    }

    const ktpPath = participant.ktpImagePath;

    if (ktpPath.startsWith("data:")) {
      const match = ktpPath.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) return res.status(500).send();
      const contentType = match[1];
      const buf = Buffer.from(match[2], "base64");
      res.setHeader("Content-Type", contentType);
      res.setHeader("Content-Length", buf.length);
      res.setHeader("Cache-Control", "private, max-age=3600");
      return res.end(buf);
    }

    if (ktpPath.startsWith("/objects/")) {
      try {
        const signedUrl = await _objectStorage.getSignedReadUrl(ktpPath, 3600);
        res.setHeader("Cache-Control", "private, max-age=3540");
        return res.redirect(302, signedUrl);
      } catch (e) {
        if (e instanceof ObjectNotFoundError) return res.status(404).send();
        throw e;
      }
    }

    return res.status(404).send();
  } catch (err) {
    req.log.error({ err }, "Get KTP image error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
