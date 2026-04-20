import { Router } from "express";
import { db } from "@workspace/db";
import { programsTable, programRegistrationsTable, participantsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middlewares/auth";

const router = Router();

function parseKabupaten(raw: string | null): string[] {
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

router.get("/", requireAuth, async (req, res) => {
  try {
    const programs = await db.select().from(programsTable).orderBy(desc(programsTable.createdAt));
    res.json(programs.map((p) => ({ ...p, kabupatenPenerima: parseKabupaten(p.kabupatenPenerima) })));
  } catch (err) {
    req.log.error({ err }, "Error listing programs");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", requireAdmin, async (req, res) => {
  try {
    const { name, komisi, mitra, tahun, kabupatenPenerima, totalKtpPenerima } = req.body;
    if (!name) return res.status(400).json({ error: "name is required" });
    const [prog] = await db.insert(programsTable).values({
      name,
      komisi: komisi || null,
      mitra: mitra || null,
      tahun: tahun || null,
      kabupatenPenerima: Array.isArray(kabupatenPenerima) ? JSON.stringify(kabupatenPenerima) : null,
      totalKtpPenerima: totalKtpPenerima ? parseInt(totalKtpPenerima) : null,
    }).returning();
    res.status(201).json({ ...prog, kabupatenPenerima: parseKabupaten(prog.kabupatenPenerima) });
  } catch (err) {
    req.log.error({ err }, "Error creating program");
    res.status(400).json({ error: "Invalid data" });
  }
});

router.get("/:id", requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [prog] = await db.select().from(programsTable).where(eq(programsTable.id, id));
    if (!prog) return res.status(404).json({ error: "Program not found" });
    res.json({ ...prog, kabupatenPenerima: parseKabupaten(prog.kabupatenPenerima) });
  } catch (err) {
    req.log.error({ err }, "Error fetching program");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/:id", requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, komisi, mitra, tahun, kabupatenPenerima, totalKtpPenerima } = req.body;
    const [prog] = await db.update(programsTable).set({
      ...(name && { name }),
      ...(komisi !== undefined && { komisi: komisi || null }),
      ...(mitra !== undefined && { mitra: mitra || null }),
      ...(tahun !== undefined && { tahun: tahun || null }),
      ...(kabupatenPenerima !== undefined && {
        kabupatenPenerima: Array.isArray(kabupatenPenerima) ? JSON.stringify(kabupatenPenerima) : null,
      }),
      ...(totalKtpPenerima !== undefined && {
        totalKtpPenerima: totalKtpPenerima ? parseInt(totalKtpPenerima) : null,
      }),
    }).where(eq(programsTable.id, id)).returning();
    if (!prog) return res.status(404).json({ error: "Program not found" });
    res.json({ ...prog, kabupatenPenerima: parseKabupaten(prog.kabupatenPenerima) });
  } catch (err) {
    req.log.error({ err }, "Error updating program");
    res.status(400).json({ error: "Invalid data" });
  }
});

router.delete("/:id", requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(programsTable).where(eq(programsTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Error deleting program");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/:id/recipients", requireAuth, async (req, res) => {
  try {
    const programId = parseInt(req.params.id);
    const rows = await db
      .select({
        id: programRegistrationsTable.id,
        registeredAt: programRegistrationsTable.registeredAt,
        staffName: programRegistrationsTable.staffName,
        notes: programRegistrationsTable.notes,
        participantId: participantsTable.id,
        participantName: participantsTable.fullName,
        participantNik: participantsTable.nik,
        participantCity: participantsTable.city,
        participantKecamatan: participantsTable.kecamatan,
        participantKelurahan: participantsTable.kelurahan,
        participantGender: participantsTable.gender,
        participantPhone: participantsTable.phone,
      })
      .from(programRegistrationsTable)
      .innerJoin(participantsTable, eq(programRegistrationsTable.participantId, participantsTable.id))
      .where(eq(programRegistrationsTable.programId, programId))
      .orderBy(desc(programRegistrationsTable.registeredAt));
    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "Error fetching recipients");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/:id/register", requireAuth, async (req, res) => {
  try {
    const programId = parseInt(req.params.id);
    const {
      staffId, staffName, notes,
      nik, fullName, address, birthPlace, birthDate, gender,
      religion, maritalStatus, occupation, nationality, rtRw, kelurahan, kecamatan,
      province, city, bloodType, phone, email,
    } = req.body;

    if (!nik || !fullName) return res.status(400).json({ error: "nik and fullName are required" });

    const [prog] = await db.select().from(programsTable).where(eq(programsTable.id, programId));
    if (!prog) return res.status(404).json({ error: "Program not found" });

    let participant = await db.query.participantsTable.findFirst({
      where: eq(participantsTable.nik, nik),
    });

    const participantFields = {
      ...(address && { address }),
      ...(birthPlace && { birthPlace }),
      ...(birthDate && { birthDate }),
      ...(gender && { gender }),
      ...(religion && { religion }),
      ...(maritalStatus && { maritalStatus }),
      ...(occupation && { occupation }),
      ...(nationality && { nationality }),
      ...(rtRw && { rtRw }),
      ...(kelurahan && { kelurahan }),
      ...(kecamatan && { kecamatan }),
      ...(province && { province }),
      ...(city && { city }),
      ...(bloodType && { bloodType }),
      ...(phone && { phone }),
      ...(email && { email }),
    };

    if (!participant) {
      const [p] = await db.insert(participantsTable).values({ nik, fullName, ...participantFields }).returning();
      participant = p;
    } else {
      await db.update(participantsTable)
        .set({ fullName, ...participantFields, updatedAt: new Date() })
        .where(eq(participantsTable.id, participant.id));
    }

    const existing = await db.query.programRegistrationsTable.findFirst({
      where: (t, { and, eq: eqFn }) => and(eqFn(t.programId, programId), eqFn(t.participantId, participant!.id)),
    });
    if (existing) return res.status(409).json({ error: "Peserta sudah terdaftar di program ini." });

    await db.insert(programRegistrationsTable).values({
      programId,
      participantId: participant.id,
      staffName: staffName || null,
      staffId: staffId ? parseInt(staffId) : null,
      notes: notes || null,
    });

    await db.update(programsTable)
      .set({ registeredCount: prog.registeredCount + 1 })
      .where(eq(programsTable.id, programId));

    res.status(201).json({ message: `${fullName} berhasil didaftarkan ke program ${prog.name}!` });
  } catch (err) {
    req.log.error({ err }, "Error registering to program");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
