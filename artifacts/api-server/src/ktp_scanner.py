#!/usr/bin/env python3
"""
KTP Scanner — Python OCR backend
Reads base64 KTP image from stdin, outputs JSON to stdout.
Uses OpenCV for preprocessing + pytesseract for OCR.
No AI/LLM APIs — fully local Tesseract 5 + OpenCV.
"""
import sys
import json
import base64
import re
import math
import traceback
from io import BytesIO

import numpy as np
import cv2
import pytesseract
from PIL import Image

# ─── Constants ────────────────────────────────────────────────────────────────
OCCUPATION_KW = {
    "WIRASWASTA","KARYAWAN SWASTA","KARYAWAN","PNS","TNI","POLRI",
    "PETANI","PEDAGANG","GURU","DOKTER","MAHASISWA","PELAJAR",
    "IBU RUMAH TANGGA","BURUH","NELAYAN","TIDAK BEKERJA","SWASTA",
    "PENSIUNAN","PERANGKAT DESA","PEGAWAI SWASTA","PEGAWAI NEGERI",
    "WIRAUSAHA","HONORER","SOPIR","MONTIR","TUKANG","SENIMAN",
    "WARTAWAN","DOSEN","PILOT","APOTEKER","BIDAN","PERAWAT",
    "TENTARA","PENELITI","NOTARIS","PENGACARA","ARSITEK",
    "AKUNTAN","KONSULTAN","MEKANIK","SATPAM","CLEANING SERVICE",
    "OJEK","DRIVER","FREELANCER","KONTRAKTOR","TEKNISI",
    "PELAUT","MENGURUS RUMAH TANGGA","BELUM BEKERJA","PURNAWIRAWAN",
}

NOT_A_NAME = {
    "LAKI","LAKI-LAKI","PEREMPUAN","ISLAM","KRISTEN","KATOLIK","HINDU",
    "BUDDHA","KONGHUCU","WNI","WNA","KAWIN","BELUM KAWIN","CERAI",
    "SEUMUR HIDUP","PROVINSI","KABUPATEN","KECAMATAN","KELURAHAN",
    "KOTA","NIK","NAMA","ALAMAT","AGAMA","PEKERJAAN","KEWARGANEGARAAN",
    "STATUS","PERKAWINAN","BERLAKU","HINGGA","JENIS","KELAMIN",
    "TEMPAT","LAHIR","GOLONGAN","DARAH","DESA","LENGKAP",
    "TIDAK","TERDETEKSI","DAFTARKAN","PESERTA","SWASTA","WIRASWASTA",
    "PEGAWAI","KARYAWAN","BURUH","PETANI",
}

RELIGIONS = ["ISLAM","KRISTEN","KATOLIK","HINDU","BUDDHA","KONGHUCU"]


# ─── Image preprocessing ──────────────────────────────────────────────────────

def b64_to_cv2(b64: str) -> np.ndarray:
    """Decode base64 image string to OpenCV BGR array."""
    if "," in b64:
        b64 = b64.split(",", 1)[1]
    raw = base64.b64decode(b64)
    arr = np.frombuffer(raw, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Failed to decode image")
    return img


def auto_rotate(img: np.ndarray) -> np.ndarray:
    """Ensure image is landscape (wider than tall)."""
    h, w = img.shape[:2]
    if h > w:
        img = cv2.rotate(img, cv2.ROTATE_90_CLOCKWISE)
    return img


def deskew(img: np.ndarray) -> np.ndarray:
    """Correct small rotations using moments on binary image."""
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    coords = np.column_stack(np.where(binary > 0))
    if len(coords) < 100:
        return img
    angle = cv2.minAreaRect(coords)[-1]
    if angle < -45:
        angle = 90 + angle
    if abs(angle) < 0.5 or abs(angle) > 15:
        return img
    (h, w) = img.shape[:2]
    center = (w // 2, h // 2)
    M = cv2.getRotationMatrix2D(center, angle, 1.0)
    rotated = cv2.warpAffine(img, M, (w, h), flags=cv2.INTER_CUBIC,
                              borderMode=cv2.BORDER_REPLICATE)
    return rotated


def upscale(img: np.ndarray, target_w: int = 2400) -> np.ndarray:
    """Upscale image so width is at least target_w pixels."""
    h, w = img.shape[:2]
    if w >= target_w:
        return img
    scale = target_w / w
    new_w = int(w * scale)
    new_h = int(h * scale)
    return cv2.resize(img, (new_w, new_h), interpolation=cv2.INTER_LANCZOS4)


def preprocess_for_ocr(img: np.ndarray) -> dict:
    """
    Returns multiple preprocessed variants of the image for OCR.
    Key improvements over sharp:
      - CLAHE: adaptive local contrast (much better on faded/dark areas)
      - Morphological closing: joins broken characters
      - Multiple thresholding methods
      - Specific zone crops
    """
    img = auto_rotate(img)
    img = upscale(img, 2400)
    img = deskew(img)
    h, w = img.shape[:2]

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # CLAHE — local contrast enhancement, biggest improvement over sharp
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    clahe_img = clahe.apply(gray)

    # Variant 1: CLAHE + sharpen
    kernel_sharpen = np.array([[0, -1, 0], [-1, 5, -1], [0, -1, 0]])
    sharp = cv2.filter2D(clahe_img, -1, kernel_sharpen)

    # Variant 2: CLAHE + adaptive threshold (best for varying backgrounds)
    blur = cv2.GaussianBlur(clahe_img, (3, 3), 0)
    adaptive = cv2.adaptiveThreshold(blur, 255,
                                      cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                      cv2.THRESH_BINARY, 31, 10)

    # Variant 3: Otsu global threshold
    _, otsu = cv2.threshold(clahe_img, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

    # Variant 4: High contrast + morphological closing (fills gaps in chars)
    alpha = 1.5; beta = -30
    contrast = cv2.convertScaleAbs(clahe_img, alpha=alpha, beta=beta)
    kernel = np.ones((2, 1), np.uint8)
    morph = cv2.morphologyEx(contrast, cv2.MORPH_CLOSE, kernel)
    _, morph_bin = cv2.threshold(morph, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

    # ── Zone crops ──────────────────────────────────────────────────────────
    # Header: top 16%, full width (Province + Kabupaten)
    header_h = int(h * 0.16)
    # NIK band: full width, 6%–34% from top (always captures NIK row)
    nik_top = int(h * 0.06)
    nik_h = int(h * 0.28)
    # Text fields: left-center (0%–65% width), 13%–92% height (avoids photo)
    txt_left = int(w * 0.01)
    txt_w = int(w * 0.65)
    txt_top = int(h * 0.13)
    txt_h = int(h * 0.80)

    def crop(src, top=0, left=0, height=None, width=None):
        h2, w2 = src.shape[:2]
        t = max(0, min(top, h2 - 1))
        l = max(0, min(left, w2 - 1))
        bot = min(h2, t + (height or h2))
        right = min(w2, l + (width or w2))
        return src[t:bot, l:right]

    return {
        "full_sharp": sharp,
        "full_adaptive": adaptive,
        "full_otsu": otsu,
        "full_morph": morph_bin,
        "header_sharp": crop(sharp, 0, 0, header_h, w),
        "header_adaptive": crop(adaptive, 0, 0, header_h, w),
        "nik_sharp": crop(sharp, nik_top, 0, nik_h, w),
        "nik_adaptive": crop(adaptive, nik_top, 0, nik_h, w),
        "nik_otsu": crop(otsu, nik_top, 0, nik_h, w),
        "nik_morph": crop(morph_bin, nik_top, 0, nik_h, w),
        "text_sharp": crop(sharp, txt_top, txt_left, txt_h, txt_w),
        "text_adaptive": crop(adaptive, txt_top, txt_left, txt_h, txt_w),
        "text_morph": crop(morph_bin, txt_top, txt_left, txt_h, txt_w),
    }


def cv2_to_pil(img: np.ndarray) -> Image.Image:
    if len(img.shape) == 2:
        return Image.fromarray(img)
    return Image.fromarray(cv2.cvtColor(img, cv2.COLOR_BGR2RGB))


# ─── OCR functions ─────────────────────────────────────────────────────────────

TESS_LANG = "ind+eng"
TESS_CONFIG_BLOCK = "--oem 3 --psm 6"
TESS_CONFIG_SPARSE = "--oem 3 --psm 11"
TESS_CONFIG_LINE = "--oem 3 --psm 7"
TESS_CONFIG_DIGITS = "--oem 3 --psm 7 -c tessedit_char_whitelist=0123456789"
TESS_CONFIG_DIGITS_BLOCK = "--oem 3 --psm 6 -c tessedit_char_whitelist=0123456789"


def ocr(img: np.ndarray, config: str = TESS_CONFIG_BLOCK, lang: str = TESS_LANG) -> str:
    try:
        return pytesseract.image_to_string(cv2_to_pil(img), lang=lang, config=config)
    except Exception:
        return ""


def ocr_digits(img: np.ndarray) -> str:
    """OCR with digit-only whitelist — best for NIK extraction."""
    try:
        r1 = pytesseract.image_to_string(cv2_to_pil(img), lang="eng", config=TESS_CONFIG_DIGITS)
        r2 = pytesseract.image_to_string(cv2_to_pil(img), lang="eng", config=TESS_CONFIG_DIGITS_BLOCK)
        return r1 + "\n" + r2
    except Exception:
        return ""


# ─── NIK extraction ─────────────────────────────────────────────────────────────

OCR_DIGIT_MAP = {
    'O': '0', 'o': '0', 'D': '0', 'Q': '0',
    'I': '1', 'l': '1', '|': '1', '!': '1',
    'Z': '2', 'z': '2',
    'S': '5', 's': '5',
    'G': '6', 'b': '6',
    'T': '7',
    'B': '8',
    'g': '9', 'q': '9',
}


def correct_digit_ocr(s: str) -> str:
    return "".join(OCR_DIGIT_MAP.get(c, c) for c in s)


def validate_nik(nik: str, strict: bool = True) -> bool:
    if not re.match(r'^\d{16}$', nik):
        return False
    if not strict:
        return True
    dd = int(nik[6:8])
    mm = int(nik[8:10])
    # dd valid: 1-31 (male) or 41-71 (female)
    if not ((1 <= dd <= 31) or (41 <= dd <= 71)):
        return False
    if not (1 <= mm <= 12):
        return False
    return True


def best_nik_from_digits(digits: str, strict: bool = True) -> str | None:
    digits = re.sub(r'\D', '', digits)
    if len(digits) < 16:
        return None
    if len(digits) == 16:
        return digits if validate_nik(digits, strict) else None
    for i in range(len(digits) - 15):
        sub = digits[i:i+16]
        if validate_nik(sub, strict):
            return sub
    return None


def extract_nik(text: str) -> str | None:
    """Multi-strategy NIK extraction from OCR text."""
    flat = re.sub(r'\n', ' ', text)

    # 1. Direct 16-digit sequence (strict)
    for m in re.finditer(r'\d{16}', flat):
        if validate_nik(m.group(), True):
            return m.group()

    # 2. NIK label match with OCR error correction
    labeled = re.search(r'NIK\s*[:\-\.=]?\s*([\d\sIilOoBbSsZzGgQqDdTt\.]{14,26})', flat, re.IGNORECASE)
    if labeled:
        raw = re.sub(r'[\s\.]', '', labeled.group(1))
        corrected = correct_digit_ocr(raw)
        nik = best_nik_from_digits(corrected, True) or best_nik_from_digits(corrected, False)
        if nik:
            return nik

    # 3. Spaced digits (NIK often output with spaces between digit groups)
    spaced = re.sub(r'(\d)\s+(\d)', r'\1\2', flat)
    for m in re.finditer(r'\d{16}', spaced):
        if validate_nik(m.group(), True):
            return m.group()

    # 4. Loose: any 16-digit sequence
    for m in re.finditer(r'\d{16}', flat):
        if validate_nik(m.group(), False):
            return m.group()

    return None


def extract_nik_from_zones(variants: dict) -> str | None:
    """Run digit-whitelist OCR specifically on NIK zone images."""
    nik_keys = ["nik_sharp", "nik_adaptive", "nik_otsu", "nik_morph"]
    for key in nik_keys:
        img = variants.get(key)
        if img is None:
            continue
        raw = ocr_digits(img)
        digits = re.sub(r'\D', '', raw)
        nik = best_nik_from_digits(digits, True) or best_nik_from_digits(digits, False)
        if nik:
            return nik
    # Fallback: run normal OCR on NIK zone and look for NIK label
    for key in nik_keys:
        img = variants.get(key)
        if img is None:
            continue
        raw = ocr(img, TESS_CONFIG_SPARSE)
        nik = extract_nik(raw)
        if nik:
            return nik
    return None


# ─── Field extraction ─────────────────────────────────────────────────────────

def clean_name(raw: str | None) -> str | None:
    if not raw:
        return None
    c = re.sub(r"[^A-Za-z\s'\-\.]", "", raw).strip().upper()
    c = re.sub(r"^(NAMA\s*LENGKAP|NAMA\s*LENG\S*|NAMA)\s*[:\-\*=]?\s*", "", c, flags=re.IGNORECASE).strip()
    if len(c) < 3 or len(c) > 60:
        return None
    # Reject occupation keywords
    for kw in OCCUPATION_KW:
        if c == kw or c.startswith(kw) or kw in c:
            return None
    words = [w for w in c.split() if len(w) >= 2]
    if not words:
        return None
    if all(w in NOT_A_NAME for w in words):
        return None
    if any(w in NOT_A_NAME for w in words[:1]):
        return None
    return " ".join(words)


def clean_date(raw: str | None) -> str | None:
    if not raw:
        return None
    m = re.search(r'(\d{1,2})[-\/\.\s](\d{1,2})[-\/\.\s](\d{4})', raw)
    if not m:
        return None
    d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
    if not (1 <= d <= 31 and 1 <= mo <= 12 and 1930 <= y <= 2020):
        return None
    return f"{d:02d}-{mo:02d}-{y}"


def clean_place(raw: str | None) -> str | None:
    if not raw:
        return None
    c = re.sub(r"[^A-Za-z\s\-\.\']", "", raw).strip().upper()
    c = re.sub(r'\s+', ' ', c)
    if len(c) < 3 or len(c) > 50:
        return None
    return c


def clean_gender(raw: str | None) -> str | None:
    if not raw:
        return None
    up = raw.upper()
    if "LAKI" in up:
        return "LAKI-LAKI"
    if "PEREM" in up:
        return "PEREMPUAN"
    return None


def clean_blood(raw: str | None) -> str | None:
    if not raw:
        return None
    m = re.search(r'\b([ABO]{1,2}[+-]?)\b', raw.upper())
    return m.group(1) if m else None


def clean_rt_rw(raw: str | None) -> str | None:
    if not raw:
        return None
    m = re.search(r'(\d{1,3})\s*[\/\-]\s*(\d{1,3})', raw)
    if m:
        rt, rw = int(m.group(1)), int(m.group(2))
        if rt <= 999 and rw <= 999:
            return f"{rt:03d}/{rw:03d}"
    return None


def clean_occupation(raw: str | None) -> str | None:
    if not raw:
        return None
    up = raw.strip().upper()
    up = re.sub(r'[^A-Z\s]', ' ', up)
    up = re.sub(r'\s+', ' ', up).strip()
    if len(up) < 2:
        return None
    for kw in sorted(OCCUPATION_KW, key=len, reverse=True):
        if kw in up:
            return kw
    if re.match(r'^[A-Z\s]{4,30}$', up):
        return up
    return None


def parse_ktp(text: str) -> dict:
    """Extract structured KTP fields from OCR text."""
    lines = [l.strip() for l in text.split('\n') if l.strip()]
    flat = ' '.join(lines)

    def find_label(pattern: str) -> str | None:
        re_pat = re.compile(pattern, re.IGNORECASE)
        for line in lines:
            m = re_pat.search(line)
            if m and m.group(1) and m.group(1).strip():
                val = m.group(1).strip()
                # Truncate at next label
                val = re.sub(r'\s+(Nama|Tempat|Lahir|Jenis|Kelamin|Alamat|RT|Kel|Kecamatan|Agama|Status|Pekerjaan|Kewarganegaraan|Berlaku|Gol)\b.*$', '', val, flags=re.IGNORECASE)
                return val.strip()
        return None

    # ── NIK (from text parsing, zone extraction handled separately)
    nik = extract_nik(text)

    # ── Name — multiple strategies
    name_raw = find_label(r'Nama\s*(?:Lengkap)?\s*[:\-\*=]?\s*(.{3,60})')
    if not name_raw:
        # After NIK line, look for an all-caps line
        nik_line_idx = -1
        for i, line in enumerate(lines):
            if re.search(r'\d{10,}', line.replace(' ', '').replace('.', '').replace('-', '')):
                nik_line_idx = i
                break
        start = nik_line_idx + 1 if nik_line_idx >= 0 else 0
        for i in range(start, min(start + 5, len(lines))):
            l = lines[i]
            if re.search(r'Tempat|Lahir|Tgl', l, re.IGNORECASE):
                break
            if re.match(r'^[A-Z][A-Z\s\'\-\.]{3,49}$', l):
                words = l.split()
                if (len(words) >= 1
                        and not any(w in NOT_A_NAME for w in words)
                        and not any(kw in l for kw in OCCUPATION_KW)):
                    name_raw = l
                    break
    if not name_raw:
        # All-caps multi-word lines that look like names
        for line in lines:
            stripped = line.strip()
            words = stripped.split()
            if (2 <= len(words) <= 5
                    and re.match(r'^[A-Z\s\'\-\.]{4,50}$', stripped)
                    and all(re.search(r'[AIUEO]', w) for w in words)
                    and not any(w in NOT_A_NAME for w in words)
                    and not any(kw in stripped for kw in OCCUPATION_KW)
                    and not re.search(r'\d', stripped)
                    and not re.search(r'PROVINSI|KABUPATEN|KOTA|REPUBLIK', stripped, re.IGNORECASE)):
                name_raw = stripped
                break
    full_name = clean_name(name_raw)

    # ── Birth place + date
    birth_raw = find_label(r'(?:Tempat\s*[\/\s]?Tgl\.?\s*Lahir|Tgl\.?\s*Lahir)\s*[:\-]?\s*(.+)')
    if not birth_raw:
        birth_raw = find_label(r'(?:Lahir|Tempat)\s*[:\-]?\s*(.+)')
    birth_place = None
    birth_date = None
    if birth_raw:
        comma = re.search(r'[,\/]', birth_raw)
        if comma:
            birth_place = clean_place(birth_raw[:comma.start()])
            birth_date = clean_date(birth_raw[comma.end():])
        else:
            birth_date = clean_date(birth_raw)
            pm = re.match(r'^([A-Z][A-Za-z\s]{2,25})', birth_raw)
            if pm:
                birth_place = clean_place(pm.group(1))
    if not birth_date:
        dm = re.search(r'\b(\d{2}[-\/]\d{2}[-\/]\d{4})\b', flat)
        if dm:
            birth_date = clean_date(dm.group(1))

    # ── Gender
    gender_raw = find_label(r'Jenis\s*Kelamin\s*[:\-]?\s*(.+)')
    if not gender_raw:
        m = re.search(r'\b(LAKI[- ]LAKI|PEREMPUAN)\b', flat, re.IGNORECASE)
        if m:
            gender_raw = m.group(1)
    gender = clean_gender(gender_raw)

    # ── Blood type
    blood_raw = find_label(r'Gol\.?\s*(?:Darah)?\s*[:\-]?\s*([ABO]{1,2}\s*[+-]?)')
    if not blood_raw:
        m = re.search(r'\bGol\S*\s*[:\-]?\s*([ABO]{1,2}\s*[+-]?)', flat, re.IGNORECASE)
        blood_raw = m.group(1) if m else None
    blood_type = clean_blood(blood_raw)

    # ── Religion
    religion_raw = find_label(r'Agama\s*[:\-]?\s*(.+)')
    religion = None
    if religion_raw:
        for r in RELIGIONS:
            if r in religion_raw.upper():
                religion = r
                break

    # ── Marital status
    marital_raw = find_label(r'Status\s*(?:Per)?kawinan?\s*[:\-]?\s*(.+)')
    marital = None
    if marital_raw:
        up = marital_raw.upper()
        if "BELUM" in up:
            marital = "BELUM KAWIN"
        elif "CERAI MATI" in up:
            marital = "CERAI MATI"
        elif "CERAI HIDUP" in up:
            marital = "CERAI HIDUP"
        elif "KAWIN" in up:
            marital = "KAWIN"

    # ── Occupation
    occ_raw = find_label(r'Pekerjaan\s*[:\-]?\s*(.+)')
    occupation = clean_occupation(occ_raw)

    # ── Nationality
    nat_raw = find_label(r'Kewarganegaraan\s*[:\-]?\s*(.+)')
    nationality = None
    if nat_raw:
        up = nat_raw.upper()
        if "WNI" in up:
            nationality = "WNI"
        elif "WNA" in up:
            nationality = "WNA"

    # ── Address
    addr_raw = find_label(r'Alamat\s*[:\-]?\s*(.{5,120})')
    address = None
    if addr_raw:
        address = re.sub(r'\s*[=\-\+\|]{2,}\s*', ' ', addr_raw).strip()
        address = re.sub(r'\s+', ' ', address)
        if len(address) < 5:
            address = None

    # ── RT/RW
    rt_rw_raw = find_label(r'RT\s*[\/\-]?\s*RW\s*[:\-]?\s*([\d]{1,3}\s*[\/\-]\s*[\d]{1,3})')
    if not rt_rw_raw:
        m = re.search(r'\b(\d{1,3})\s*[\/\-]\s*(\d{1,3})\b', flat)
        rt_rw_raw = m.group(0) if m else None
    rt_rw = clean_rt_rw(rt_rw_raw)

    # ── Kelurahan
    kel_raw = find_label(r'(?:Kel\.?\/?Desa|Kelurahan)\s*[:\-]?\s*(.+)')
    if kel_raw:
        kel_raw = re.sub(r'^(DESA|KEL\.?)\s+', '', kel_raw, flags=re.IGNORECASE).strip()
    kelurahan = clean_place(kel_raw)

    # ── Kecamatan
    kec_raw = find_label(r'[Kk][eo]c?amata?[nl]?\s*[:\-]?\s*(.+)')
    kecamatan = clean_place(kec_raw)

    # ── Province (from header, first 2 digits of NIK)
    province = None
    city = None
    for line in lines[:5]:
        upper = line.upper()
        if "PROVINSI" in upper or "PROV" in upper:
            province = re.sub(r'.*PROV(?:INSI)?\s*', '', line, flags=re.IGNORECASE).strip().upper()
            province = re.sub(r'[^A-Z\s]', '', province).strip()
        elif re.search(r'KABUPATEN|KOTA', upper):
            city = re.sub(r'.*(?:KABUPATEN|KOTA)\s*', '', line, flags=re.IGNORECASE).strip().upper()
            city = re.sub(r'[^A-Z\s]', '', city).strip()

    return {
        "nik": nik,
        "fullName": full_name,
        "birthPlace": birth_place,
        "birthDate": birth_date,
        "gender": gender,
        "bloodType": blood_type,
        "religion": religion,
        "maritalStatus": marital,
        "occupation": occupation,
        "nationality": nationality,
        "address": address,
        "rtRw": rt_rw,
        "kelurahan": kelurahan,
        "kecamatan": kecamatan,
        "province": province,
        "city": city,
    }


def score_result(fields: dict) -> int:
    """Score OCR result quality 0-100."""
    s = 0
    if fields.get("nik"):
        s += 40
    if fields.get("fullName"):
        s += 20
    if fields.get("birthDate"):
        s += 8
    if fields.get("birthPlace"):
        s += 4
    if fields.get("gender"):
        s += 5
    if fields.get("address"):
        s += 5
    if fields.get("religion"):
        s += 3
    if fields.get("maritalStatus"):
        s += 3
    if fields.get("occupation"):
        s += 2
    if fields.get("rtRw"):
        s += 2
    if fields.get("kelurahan"):
        s += 2
    if fields.get("kecamatan"):
        s += 2
    if fields.get("province"):
        s += 2
    if fields.get("city"):
        s += 2
    return min(s, 100)


def merge_results(results: list[dict]) -> dict:
    """Merge multiple parse results by taking the best non-null value for each field."""
    fields = ["nik","fullName","birthPlace","birthDate","gender","bloodType","religion",
              "maritalStatus","occupation","nationality","address","rtRw","kelurahan",
              "kecamatan","province","city"]
    merged = {}
    for f in fields:
        for r in results:
            v = r.get(f)
            if v:
                merged[f] = v
                break
    return merged


# ─── Main ──────────────────────────────────────────────────────────────────────

def main():
    try:
        raw_input = sys.stdin.read().strip()
        data = json.loads(raw_input)
        b64 = data.get("imageBase64", "")

        img = b64_to_cv2(b64)
        variants = preprocess_for_ocr(img)

        # Step 1: Dedicated NIK zone extraction with digit whitelist
        nik_from_zone = extract_nik_from_zones(variants)

        # Step 2: Run OCR on multiple variants
        texts = []
        # Main text field crops (most important — left-center avoids photo)
        texts.append(ocr(variants["text_sharp"], TESS_CONFIG_BLOCK))
        texts.append(ocr(variants["text_adaptive"], TESS_CONFIG_BLOCK))
        texts.append(ocr(variants["text_morph"], TESS_CONFIG_BLOCK))
        # Full image passes
        texts.append(ocr(variants["full_sharp"], TESS_CONFIG_BLOCK))
        texts.append(ocr(variants["full_adaptive"], TESS_CONFIG_BLOCK))
        texts.append(ocr(variants["full_adaptive"], TESS_CONFIG_SPARSE))
        # Header zone
        texts.append(ocr(variants["header_sharp"], TESS_CONFIG_BLOCK))
        texts.append(ocr(variants["header_adaptive"], TESS_CONFIG_BLOCK))

        # Step 3: Parse each OCR result
        parsed_list = [parse_ktp(t) for t in texts]

        # Step 4: Try NIK extraction from full text if zone failed
        if not nik_from_zone:
            for t in texts:
                nik_from_zone = extract_nik(t)
                if nik_from_zone:
                    break

        # Step 5: Merge results
        merged = merge_results(parsed_list)
        if nik_from_zone:
            merged["nik"] = nik_from_zone

        # Step 6: Score
        score = score_result(merged)

        # Output
        result = {**merged, "score": score, "rawText": texts[0]}
        print(json.dumps(result, ensure_ascii=False))

    except Exception as e:
        error_result = {
            "error": str(e),
            "traceback": traceback.format_exc(),
            "score": 0,
        }
        print(json.dumps(error_result, ensure_ascii=False))


if __name__ == "__main__":
    main()
