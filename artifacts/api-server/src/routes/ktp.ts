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

// ─── Persistent OCR workers ───────────────────────────────────────────────────
type TessWorker = Awaited<ReturnType<typeof createWorker>>;

const workers: { a: TessWorker | null; b: TessWorker | null; c: TessWorker | null } = {
  a: null, b: null, c: null,
};
const workerInits: {
  a: Promise<TessWorker> | null;
  b: Promise<TessWorker> | null;
  c: Promise<TessWorker> | null;
} = { a: null, b: null, c: null };

function initWorker(key: "a" | "b" | "c"): Promise<TessWorker> {
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
initWorker("c").catch(() => {});

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

async function detectImageQuality(buffer: Buffer): Promise<{ warning: QualityWarning; mean: number; stdev: number }> {
  try {
    const stats = await sharp(buffer).grayscale().stats();
    const mean = stats.channels[0].mean;
    const stdev = stats.channels[0].stdev;
    let warning: QualityWarning = null;
    if (mean < 35) warning = "dark";
    else if (mean > 230) warning = "overexposed";
    else if (stdev < 12) warning = "blurry";
    else if (stdev < 20) warning = "low_contrast";
    return { warning, mean, stdev };
  } catch {
    return { warning: null, mean: 128, stdev: 50 };
  }
}

// ─── Adaptive preprocessing ───────────────────────────────────────────────────
// Returns 3 image variants tuned to different KTP conditions:
//  normal  — gentle, good for high-quality scans
//  enhanced — moderate contrast boost, good for medium quality
//  binary  — pure B&W threshold, good for all conditions (maximises text contrast)

async function preprocessKtpImage(imageBase64: string, quality: { mean: number; stdev: number }): Promise<{
  normal: Buffer;
  enhanced: Buffer;
  binary: Buffer;
}> {
  const inputBuf = Buffer.from(imageBase64, "base64");
  // Auto-rotate based on EXIF
  const rotated = await sharp(inputBuf).rotate().toBuffer();
  const meta = await sharp(rotated).metadata();
  const origW = meta.width ?? 800;
  const origH = meta.height ?? 600;

  // Use higher resolution for OCR: 1800px is the sweet spot for Tesseract accuracy.
  // If the image is very small, upscale to 2000px so text is large enough.
  // If the image is already very large and high quality, keep it at 2000px for detail.
  const targetW = origW < 800 ? 2000 : origW < 1200 ? 1600 : 1800;

  // For portrait images (phone held vertically capturing a landscape KTP),
  // the card might be rotated — try to detect and handle.
  // If image is taller than wide, rotate 90 degrees CW to landscape.
  let oriented = rotated;
  if (origH > origW * 1.2) {
    // Try landscape orientation — KTP is always landscape
    oriented = await sharp(rotated).rotate(90).toBuffer();
  }

  const base = await sharp(oriented)
    .resize({ width: targetW, kernel: sharp.kernel.lanczos3 })
    .grayscale()
    .normalize()
    .toBuffer();

  // Normal: gentle sharpening only — ideal for high-quality clear photos
  // Avoid over-darkening: use a neutral brightness offset.
  const [normal, enhanced, binary] = await Promise.all([
    sharp(base)
      .sharpen({ sigma: 0.8, m1: 1.0, m2: 0.5 })
      .png()
      .toBuffer(),

    // Enhanced: moderate boost — good for medium quality / slightly faded KTPs
    // Use restrained linear: boost contrast by 1.3×, small darkening offset
    sharp(base)
      .sharpen({ sigma: 1.5, m1: 1.5, m2: 0.7 })
      .linear(1.3, -15)
      .png()
      .toBuffer(),

    // Binary: threshold to pure black/white — maximises character contrast
    // Works well for both high and low quality images.
    // threshold(128) = Otsu-like hard cutoff
    sharp(base)
      .sharpen({ sigma: 1.0 })
      .threshold(130)
      .png()
      .toBuffer(),
  ]);

  return { normal, enhanced, binary };
}

// ─── Word-confidence filtering ────────────────────────────────────────────────
// Low threshold (15) to avoid dropping valid text from high-quality scans.
// Falls back to raw text if filtering produces too little output.

function filterByConfidence(words: Word[] | undefined, rawText: string, minConf = 15): string {
  if (!words?.length) return rawText;

  const lineMap = new Map<number, string[]>();
  for (const word of words) {
    if (word.confidence < minConf || !word.text.trim()) continue;
    const lineKey = Math.round(word.bbox.y0 / 14);
    if (!lineMap.has(lineKey)) lineMap.set(lineKey, []);
    lineMap.get(lineKey)!.push(word.text);
  }

  const filtered = [...lineMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, ws]) => ws.join(" "))
    .join("\n");

  // Only use filtered if it has substantial content; else use raw
  return filtered.trim().length > rawText.length * 0.3 ? filtered : rawText;
}

// ─── NIK extraction ──────────────────────────────────────────────────────────

const OCR_DIGIT_MAP: Record<string, string[]> = {
  I: ["1"], i: ["1"], l: ["1"], "|": ["1"], "!": ["1"],
  ")": ["1"], "(": ["1"], "[": ["1"], "]": ["1"],
  L: ["1", "6"], O: ["0"], o: ["0"], D: ["0"], Q: ["0"], q: ["0"],
  B: ["8", "6"], S: ["5"], s: ["5"], G: ["9", "6"],
  Z: ["2"], z: ["2"], "?": ["7"], b: ["6"],
  Y: ["4", "7"], A: ["4"], h: ["4"], T: ["7", "1"],
  g: ["9"], J: ["1"], j: ["1"], t: ["1", "7"],
  C: ["0"], c: ["0"], U: ["0"], u: ["0"],
};

const NIK_CHARS_RE = /[0-9IilOoBbDSGZqQzY?|!()\[\]LAhTgJjtCcUu]{14,18}/g;

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

  // 1. Direct 16-digit sequence (most reliable)
  const seq16 = flat.match(/\b(\d{16})\b/);
  if (seq16) return seq16[1];

  // 2. NIK with single separator (e.g. "317100.0123456789")
  const singleSep = flat.match(/(\d{6,})[.\-\s](\d{6,})/);
  if (singleSep) {
    const joined = singleSep[1] + singleSep[2];
    if (/^\d{16}$/.test(joined) && validateNik(joined)) return joined;
  }

  // 3. NIK label followed by number sequence (handles spaces between digits)
  const labeled = flat.match(/NIK\s*[:\-\.=]?\s*([0-9IilOoBbDSGZqQzY?|!()\[\]LAhTgJjtCcUu\s]{14,24})/i);
  if (labeled) {
    // Remove spaces and try to clean
    const compacted = labeled[1].replace(/\s+/g, "");
    // Try direct parse first
    if (/^\d{16}$/.test(compacted)) return compacted;
    // Try with character map
    for (let c0 = 0; c0 < 3; c0++)
      for (let c1 = 0; c1 < 3; c1++) {
        const fixed = correctNikWithMap(compacted, [c0, c1]);
        if (/^\d{16}$/.test(fixed) && validateNik(fixed)) return fixed;
      }
    // Also try with spaces kept as separators
    const spacedDigits = labeled[1].replace(/[^0-9IilOoBbDSGZqQzY?|!()\[\]LAhTgJjtCcUu]/g, "");
    if (spacedDigits.length >= 14) {
      for (let c0 = 0; c0 < 3; c0++)
        for (let c1 = 0; c1 < 3; c1++) {
          const fixed = correctNikWithMap(spacedDigits, [c0, c1]);
          if (/^\d{16}$/.test(fixed) && validateNik(fixed)) return fixed;
        }
    }
  }

  // 4. Scan all OCR-like digit sequences
  const candidates = flat.match(NIK_CHARS_RE) ?? [];
  for (const c of candidates) {
    for (let c0 = 0; c0 < 3; c0++)
      for (let c1 = 0; c1 < 3; c1++) {
        const fixed = correctNikWithMap(c, [c0, c1]);
        if (/^\d{16}$/.test(fixed) && validateNik(fixed)) return fixed;
      }
  }

  // 5. Find any 14-18 digit run anywhere near "NIK" label
  const nikLabelIdx = flat.search(/NIK/i);
  if (nikLabelIdx >= 0) {
    const nearby = flat.substring(nikLabelIdx, nikLabelIdx + 80);
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

  // 6. Last resort: any 16+ digit sequence anywhere in text (no label required)
  const anyLong = flat.match(/\d{16,18}/g) ?? [];
  for (const seg of anyLong) {
    for (let i = 0; i <= seg.length - 16; i++) {
      const sub = seg.substring(i, i + 16);
      if (validateNik(sub)) return sub;
    }
  }

  return null;
}

function validateNik(nik: string | null): string | null {
  if (!nik) return null;
  if (!/^\d{16}$/.test(nik)) return null;
  const dd = parseInt(nik.substring(6, 8));
  const mm = parseInt(nik.substring(8, 10));
  // Day 1-31 for males, 41-71 for females (day + 40)
  if ((dd < 1 || dd > 31) && (dd < 41 || dd > 71)) return null;
  if (mm < 1 || mm > 12) return null;
  return nik;
}

// ─── Field validators ─────────────────────────────────────────────────────────

function validateName(raw: string | null): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[^A-Z\s'.\-]/gi, "").trim().toUpperCase();
  if (cleaned.length < 3 || cleaned.length > 60) return null;
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
  const cleaned = raw.replace(/[^A-Z\s.\-]/gi, "").trim().toUpperCase();
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
  "PENSIUNAN", "PERANGKAT DESA", "PEGAWAI SWASTA", "PEGAWAI NEGERI",
  "WIRAUSAHA", "FREELANCE", "HONORER",
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

  // ── City — look for KABUPATEN or KOTA header on the KTP card itself
  const cityRaw = findLabel(/(?:KABUPATEN|KOTA)\s+([A-Z][A-Za-z\s]{2,35})/i)
    ?? findLabel(/Kab(?:upaten)?\s*[:\-]?\s*(.+)/i)
    ?? flat.match(/(?:KABUPATEN|KOTA)\s+([A-Z][A-Za-z\s]{2,35})/i)?.[1] ?? null;
  const city = validatePlace(cityRaw, 50);

  // ── Province (handle OCR: "PROVINS|", "PROVINS1", "PROVINSI")
  const provLine = lines.find(l => /PROVINS[I|1l]\s/i.test(l));
  const provinceRaw = provLine?.replace(/^.*PROVINS[I|1l]\s+/i, "").replace(/[|]/g, "I").trim()
    ?? findLabel(/Provinsi\s*[:\-]?\s*(.+)/i)
    ?? flat.match(/PROVINS[I|1l]\s+([A-Z][A-Za-z\s|]{2,40})/i)?.[1]?.replace(/[|]/g, "I") ?? null;
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
  results: Record<string, string | null>[]
): Record<string, string | null> {
  if (!results.length) return {};
  const r = { ...results[0] };
  for (let i = 1; i < results.length; i++) {
    const b = results[i];
    for (const k of Object.keys(b)) {
      // Always prefer a valid NIK
      if (k === "nik") {
        if (b[k] && /^\d{16}$/.test(b[k]!) && validateNik(b[k])) {
          if (!r[k] || !/^\d{16}$/.test(r[k]!)) r[k] = b[k];
        }
      } else {
        if (!r[k] && b[k]) r[k] = b[k];
      }
    }
  }
  return r;
}

// ─── OCR orchestration — 4 passes across 3 workers ───────────────────────────
// Round 1 (parallel): Worker A PSM 6 + normal, Worker B PSM 4 + normal, Worker C PSM 6 + binary
// Round 2 (parallel): Worker A PSM 11 + enhanced, Worker B PSM 6 + binary (variant),
//                     Worker C PSM 4 + enhanced

async function runOcrPasses(
  imageBase64: string
): Promise<{ data: Record<string, string | null>; score: number; qualityWarning: QualityWarning }> {
  const inputBuf = Buffer.from(imageBase64, "base64");

  const [qualityInfo, { normal, enhanced, binary }] = await Promise.all([
    detectImageQuality(inputBuf),
    preprocessKtpImage(imageBase64, { mean: 128, stdev: 50 }),
  ]);

  const [workerA, workerB, workerC] = await Promise.all([
    initWorker("a"), initWorker("b"), initWorker("c"),
  ]);

  // Round 1 — all 3 workers simultaneously
  await Promise.all([
    workerA.setParameters({ tessedit_pageseg_mode: "6" as any }),
    workerB.setParameters({ tessedit_pageseg_mode: "4" as any }),
    workerC.setParameters({ tessedit_pageseg_mode: "6" as any }),
  ]);
  const [r1, r2, r3] = await Promise.all([
    workerA.recognize(normal),
    workerB.recognize(normal),
    workerC.recognize(binary),
  ]);

  // Round 2 — different PSM modes on enhanced + binary
  await Promise.all([
    workerA.setParameters({ tessedit_pageseg_mode: "11" as any }),
    workerB.setParameters({ tessedit_pageseg_mode: "6" as any }),
    workerC.setParameters({ tessedit_pageseg_mode: "4" as any }),
  ]);
  const [r4, r5, r6] = await Promise.all([
    workerA.recognize(enhanced),
    workerB.recognize(binary),
    workerC.recognize(enhanced),
  ]);

  // Use raw text as fallback when confidence filter is too aggressive
  const texts = [r1, r2, r3, r4, r5, r6].map(r =>
    filterByConfidence(r.data.words, r.data.text, 15)
  );

  // Also try raw (unfiltered) for NIK extraction specifically
  const rawTexts = [r1, r2, r3, r4, r5, r6].map(r => r.data.text);

  const parsed = texts.map(t => parseKtpText(t));

  // If no pass found a NIK, try raw text passes
  const nikFound = parsed.some(p => p.nik);
  if (!nikFound) {
    for (const rawT of rawTexts) {
      const nikCandidate = extractNik(rawT);
      if (nikCandidate && validateNik(nikCandidate)) {
        // Inject into first parse result
        parsed[0].nik = nikCandidate;
        break;
      }
    }
  }

  const merged = mergeKtpData(parsed);
  const score = scoreKtpData(merged);

  return { data: merged, score, qualityWarning: qualityInfo.warning };
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
