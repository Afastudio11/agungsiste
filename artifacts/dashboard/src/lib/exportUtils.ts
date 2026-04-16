import * as XLSX from "xlsx";
import jsPDF from "jspdf";

export function exportExcel(rows: (string | number | null | undefined)[][], filename: string) {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);

  const colWidths = rows[0]?.map((_, ci) => ({
    wch: Math.min(
      60,
      Math.max(10, ...rows.map((r) => String(r[ci] ?? "").length))
    ),
  })) ?? [];
  ws["!cols"] = colWidths;

  XLSX.utils.book_append_sheet(wb, ws, "Data");
  XLSX.writeFile(wb, filename);
}

export async function fetchImageAsDataUrl(url: string, credentials: RequestCredentials = "include"): Promise<string | null> {
  try {
    const r = await fetch(url, { credentials });
    if (!r.ok) return null;
    const blob = await r.blob();
    return await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export type BulkPdfParticipant = {
  nik: string;
  fullName: string;
  birthPlace?: string | null;
  birthDate?: string | null;
  gender?: string | null;
  religion?: string | null;
  maritalStatus?: string | null;
  occupation?: string | null;
  nationality?: string | null;
  bloodType?: string | null;
  address?: string | null;
  kelurahan?: string | null;
  kecamatan?: string | null;
  city?: string | null;
  province?: string | null;
  eventCount?: number | null;
  firstRegisteredAt?: string | null;
};

export type PdfProgressCallback = (current: number) => void;

export async function exportParticipantsPDF(
  participants: BulkPdfParticipant[],
  baseUrl: string,
  onProgress: PdfProgressCallback,
  filenameLabel = "peserta"
) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 12;

  for (let i = 0; i < participants.length; i++) {
    const p = participants[i];
    onProgress(i + 1);

    if (i > 0) doc.addPage();

    const photoUrl = `${baseUrl}/api/ktp/image/${encodeURIComponent(p.nik)}`;
    const photoData = await fetchImageAsDataUrl(photoUrl);

    let y = margin;

    doc.setFillColor(37, 99, 235);
    doc.rect(0, 0, pageW, 14, "F");
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.text(p.fullName, margin, 9);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(200, 220, 255);
    doc.text(`NIK: ${p.nik}`, pageW - margin, 9, { align: "right" });

    y = 20;

    const photoW = 90;
    const photoH = photoW * (54 / 85.6);

    if (photoData) {
      doc.addImage(photoData, "JPEG", margin, y, photoW, photoH);
    } else {
      doc.setFillColor(241, 245, 249);
      doc.roundedRect(margin, y, photoW, photoH, 2, 2, "F");
      doc.setFontSize(8);
      doc.setFont("helvetica", "italic");
      doc.setTextColor(148, 163, 184);
      doc.text("Foto KTP tidak tersedia", margin + photoW / 2, y + photoH / 2, { align: "center" });
    }

    const dataX = margin + photoW + 10;
    const dataW = pageW - dataX - margin;

    const fields: [string, string | null | undefined][] = [
      ["NIK", p.nik],
      ["Nama Lengkap", p.fullName],
      ["Tempat Lahir", p.birthPlace],
      ["Tanggal Lahir", p.birthDate],
      ["Jenis Kelamin", p.gender],
      ["Agama", p.religion],
      ["Status Perkawinan", p.maritalStatus],
      ["Pekerjaan", p.occupation],
      ["Golongan Darah", p.bloodType],
      ["Kelurahan / Desa", p.kelurahan],
      ["Kecamatan", p.kecamatan],
      ["Kabupaten / Kota", p.city],
      ["Provinsi", p.province],
    ];

    const labelW = 40;
    const rowH = 6.5;
    let fy = y;

    fields.forEach(([label, value], idx) => {
      const bg = idx % 2 === 0 ? [248, 250, 252] : [255, 255, 255];
      doc.setFillColor(bg[0], bg[1], bg[2]);
      doc.rect(dataX, fy, dataW, rowH, "F");

      doc.setFontSize(7.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100, 116, 139);
      doc.text(label, dataX + 2, fy + 4.3);

      doc.setFont("helvetica", "bold");
      doc.setTextColor(15, 23, 42);
      const val = value ?? "—";
      const maxW = dataW - labelW - 4;
      const maxChars = Math.floor(maxW / 1.9);
      doc.text(val.length > maxChars ? val.slice(0, maxChars) + "…" : val, dataX + labelW, fy + 4.3);
      fy += rowH;
    });

    if (p.firstRegisteredAt || p.eventCount != null) {
      const bottomY = Math.max(y + photoH, fy) + 4;
      if (bottomY < pageH - 10) {
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(100, 116, 139);
        const parts = [];
        if (p.eventCount != null) parts.push(`Total Event: ${p.eventCount}`);
        if (p.firstRegisteredAt) parts.push(`Pertama Daftar: ${new Date(p.firstRegisteredAt).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}`);
        doc.text(parts.join("   ·   "), margin, bottomY);
      }
    }

    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(200, 200, 200);
    doc.text(`${i + 1} / ${participants.length}`, pageW - margin, pageH - 5, { align: "right" });
    doc.text(`Dicetak: ${new Date().toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}`, margin, pageH - 5);
  }

  const date = new Date().toISOString().slice(0, 10);
  doc.save(`${filenameLabel}_${date}.pdf`);
}
