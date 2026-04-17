import { Router } from "express";
import { db } from "@workspace/db";
import { eventRegistrationsTable, participantsTable, eventsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
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
        registrationType: eventRegistrationsTable.registrationType,
        participantName: participantsTable.name,
        participantNik: participantsTable.nik,
        participantKabupaten: participantsTable.kabupaten,
        eventId: eventsTable.id,
        eventName: eventsTable.name,
        eventLocation: eventsTable.location,
      })
      .from(eventRegistrationsTable)
      .innerJoin(participantsTable, eq(eventRegistrationsTable.participantId, participantsTable.id))
      .innerJoin(eventsTable, eq(eventRegistrationsTable.eventId, eventsTable.id))
      .where(eq(eventRegistrationsTable.staffId, userId))
      .orderBy(desc(eventRegistrationsTable.registeredAt))
      .limit(50);

    res.json(rows);
  } catch (err) {
    console.error("scan-history error:", err);
    res.status(500).json({ error: "Gagal memuat riwayat scan" });
  }
});

export default router;
