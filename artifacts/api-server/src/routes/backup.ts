import { Router } from "express";
import archiver from "archiver";
import { db } from "@workspace/db";
import { participantsTable } from "@workspace/db";
import { isNotNull } from "drizzle-orm";
import { requireAdmin } from "../middlewares/auth";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";

const router = Router();
const _objectStorage = new ObjectStorageService();

/**
 * GET /api/admin/backup/ktp-zip
 * Downloads all stored KTP images as a ZIP file.
 * Admin-only. Streams the ZIP to the client so it works even with thousands of photos.
 */
router.get("/ktp-zip", requireAdmin, async (req, res) => {
  try {
    const participants = await db
      .select({ nik: participantsTable.nik, fullName: participantsTable.fullName, ktpImagePath: participantsTable.ktpImagePath })
      .from(participantsTable)
      .where(isNotNull(participantsTable.ktpImagePath));

    const dateStr = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="backup_foto_ktp_${dateStr}.zip"`);

    const archive = archiver("zip", { zlib: { level: 6 } });
    archive.on("error", (err) => {
      req.log.error({ err }, "Archiver error");
      if (!res.headersSent) res.status(500).end();
    });
    archive.pipe(res);

    for (const p of participants) {
      try {
        const ktpPath = p.ktpImagePath!;
        const safeName = (p.nik ?? "unknown").replace(/[^a-zA-Z0-9]/g, "_");
        const filename = `${safeName}.jpg`;

        if (ktpPath.startsWith("data:")) {
          const match = ktpPath.match(/^data:([^;]+);base64,(.+)$/);
          if (!match) continue;
          const buf = Buffer.from(match[2], "base64");
          archive.append(buf, { name: filename });
        } else if (ktpPath.startsWith("/objects/")) {
          const stream = await _objectStorage.getObjectReadStream(ktpPath).catch(() => null);
          if (!stream) continue;
          archive.append(stream, { name: filename });
        }
      } catch {
        // skip unreadable images silently
      }
    }

    await archive.finalize();
  } catch (err) {
    req.log.error({ err }, "KTP ZIP backup error");
    if (!res.headersSent) res.status(500).json({ error: "Gagal membuat backup" });
  }
});

/**
 * GET /api/admin/backup/ktp-stats
 * Returns count of participants with/without KTP photos.
 */
router.get("/ktp-stats", requireAdmin, async (req, res) => {
  try {
    const all = await db
      .select({ nik: participantsTable.nik, ktpImagePath: participantsTable.ktpImagePath })
      .from(participantsTable);

    const withPhoto = all.filter((p) => p.ktpImagePath && p.ktpImagePath.length > 0).length;
    const withoutPhoto = all.length - withPhoto;
    res.json({ total: all.length, withPhoto, withoutPhoto });
  } catch (err) {
    req.log.error({ err }, "KTP stats error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
