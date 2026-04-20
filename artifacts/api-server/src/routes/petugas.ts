import { Router } from "express";
import { db } from "@workspace/db";
import { eventRegistrationsTable, participantsTable, eventsTable, programRegistrationsTable } from "@workspace/db";
import { eq, ne, desc, sql, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router = Router();

router.get("/scan-history", requireAuth, async (req, res) => {
  try {
    const userId = (req.session as any).userId as number;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const rows = await db
      .select({
        id: eventRegistrationsTable.id,
        registeredAt: eventRegistrationsTable.registeredAt,
        checkedInAt: eventRegistrationsTable.checkedInAt,
        registrationType: eventRegistrationsTable.registrationType,
        participantName: participantsTable.fullName,
        participantNik: participantsTable.nik,
        participantCity: participantsTable.city,
        participantKecamatan: participantsTable.kecamatan,
        eventId: eventsTable.id,
        eventName: eventsTable.name,
        eventLocation: eventsTable.location,
      })
      .from(eventRegistrationsTable)
      .innerJoin(participantsTable, eq(eventRegistrationsTable.participantId, participantsTable.id))
      .innerJoin(eventsTable, eq(eventRegistrationsTable.eventId, eventsTable.id))
      .where(eq(eventRegistrationsTable.staffId, userId))
      .orderBy(desc(sql`COALESCE(${eventRegistrationsTable.checkedInAt}, ${eventRegistrationsTable.registeredAt})`))
      .limit(50);

    res.json(rows);
  } catch (err) {
    console.error("scan-history error:", err);
    res.status(500).json({ error: "Gagal memuat riwayat scan" });
  }
});

router.get("/my-stats", requireAuth, async (req, res) => {
  try {
    const userId = (req.session as any).userId as number;
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const [eventRow] = await db
      .select({
        totalEventKtp: sql<number>`cast(count(*) as integer)`,
        totalKegiatan: sql<number>`cast(count(distinct ${eventRegistrationsTable.eventId}) as integer)`,
      })
      .from(eventRegistrationsTable)
      .where(
        and(
          eq(eventRegistrationsTable.staffId, userId),
          ne(eventRegistrationsTable.registrationType, "attendance")
        )
      );

    const [programRow] = await db
      .select({
        totalProgramKtp: sql<number>`cast(count(*) as integer)`,
        totalProgram: sql<number>`cast(count(distinct ${programRegistrationsTable.programId}) as integer)`,
      })
      .from(programRegistrationsTable)
      .where(eq(programRegistrationsTable.staffId, userId));

    const totalEventKtp = eventRow?.totalEventKtp ?? 0;
    const totalProgramKtp = programRow?.totalProgramKtp ?? 0;

    res.json({
      totalKtp: totalEventKtp + totalProgramKtp,
      totalKegiatan: eventRow?.totalKegiatan ?? 0,
      totalProgram: programRow?.totalProgram ?? 0,
    });
  } catch (err) {
    console.error("my-stats error:", err);
    res.status(500).json({ error: "Gagal memuat statistik" });
  }
});

export default router;
