import { Router } from "express";
import { db } from "@workspace/db";
import { prizesTable, prizeDistributionsTable, participantsTable, eventsTable, eventRegistrationsTable } from "@workspace/db";
import { eq, sql, and, or, ilike } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router = Router();

router.get("/", requireAuth, async (req, res) => {
  try {
    const rawEventId = req.query.eventId as string | undefined;
    const standalone = rawEventId === "_standalone";
    const eventId = rawEventId && !standalone ? parseInt(rawEventId) : undefined;
    const conditions = standalone
      ? [sql`${prizesTable.eventId} is null`]
      : eventId
      ? [eq(prizesTable.eventId, eventId)]
      : [];

    const prizes = await db
      .select({
        id: prizesTable.id,
        eventId: prizesTable.eventId,
        eventName: eventsTable.name,
        name: prizesTable.name,
        description: prizesTable.description,
        quantity: prizesTable.quantity,
        distributedCount: prizesTable.distributedCount,
        createdAt: prizesTable.createdAt,
      })
      .from(prizesTable)
      .leftJoin(eventsTable, eq(prizesTable.eventId, eventsTable.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(sql`${prizesTable.createdAt} desc`);

    res.json(prizes);
  } catch (err) {
    req.log.error({ err }, "Error listing prizes");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", requireAuth, async (req, res) => {
  try {
    const { eventId, name, description, quantity } = req.body;
    if (!name) return res.status(400).json({ error: "name is required" });

    const [prize] = await db.insert(prizesTable).values({
      eventId: eventId ? parseInt(eventId) : null,
      name,
      description: description || null,
      quantity: parseInt(quantity) || 1,
    }).returning();

    res.status(201).json(prize);
  } catch (err) {
    req.log.error({ err }, "Error creating prize");
    res.status(400).json({ error: "Invalid data" });
  }
});

router.put("/:id", requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, description, quantity } = req.body;

    const [prize] = await db.update(prizesTable)
      .set({
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(quantity !== undefined && { quantity: parseInt(quantity) }),
      })
      .where(eq(prizesTable.id, id))
      .returning();

    if (!prize) return res.status(404).json({ error: "Prize not found" });
    res.json(prize);
  } catch (err) {
    req.log.error({ err }, "Error updating prize");
    res.status(400).json({ error: "Invalid data" });
  }
});

router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(prizesTable).where(eq(prizesTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Error deleting prize");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Search participants for a given prize — from event if prize has eventId, else all
router.get("/:id/participant-search", requireAuth, async (req, res) => {
  try {
    const prizeId = parseInt(req.params.id);
    const q = (req.query.q as string) ?? "";
    const sourceOverride = req.query.source as string | undefined; // "event" or "all"

    const [prize] = await db.select().from(prizesTable).where(eq(prizesTable.id, prizeId));
    if (!prize) return res.status(404).json({ error: "Prize not found" });

    const searchConditions = q
      ? [or(ilike(participantsTable.fullName, `%${q}%`), ilike(participantsTable.nik, `%${q}%`))]
      : [];

    const useEventScope = prize.eventId && sourceOverride !== "all";

    if (useEventScope) {
      const rows = await db
        .select({
          id: participantsTable.id,
          nik: participantsTable.nik,
          fullName: participantsTable.fullName,
          city: participantsTable.city,
          province: participantsTable.province,
        })
        .from(participantsTable)
        .innerJoin(eventRegistrationsTable, eq(eventRegistrationsTable.participantId, participantsTable.id))
        .where(
          and(
            eq(eventRegistrationsTable.eventId, prize.eventId!),
            searchConditions.length > 0 ? searchConditions[0] : undefined,
          )
        )
        .orderBy(participantsTable.fullName)
        .limit(30);
      return res.json({ source: "event", results: rows });
    }

    const rows = await db
      .select({
        id: participantsTable.id,
        nik: participantsTable.nik,
        fullName: participantsTable.fullName,
        city: participantsTable.city,
        province: participantsTable.province,
      })
      .from(participantsTable)
      .where(searchConditions.length > 0 ? searchConditions[0] : undefined)
      .orderBy(participantsTable.fullName)
      .limit(30);

    res.json({ source: "all", results: rows });
  } catch (err) {
    req.log.error({ err }, "Error searching participants for prize");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/all-distributions", requireAuth, async (req, res) => {
  try {
    const { startDate, endDate, kabupaten, kecamatan, kelurahan } = req.query as Record<string, string>;
    const conditions: ReturnType<typeof sql>[] = [];

    if (startDate) conditions.push(sql`${prizeDistributionsTable.distributedAt} >= ${new Date(startDate).toISOString()}`);
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      conditions.push(sql`${prizeDistributionsTable.distributedAt} <= ${end.toISOString()}`);
    }
    if (kabupaten) conditions.push(sql`${participantsTable.city} ilike ${"%" + kabupaten + "%"}`);
    if (kecamatan) conditions.push(sql`${participantsTable.kecamatan} ilike ${"%" + kecamatan + "%"}`);
    if (kelurahan) conditions.push(sql`${participantsTable.kelurahan} ilike ${"%" + kelurahan + "%"}`);

    const rows = await db
      .select({
        id: prizeDistributionsTable.id,
        distributedAt: prizeDistributionsTable.distributedAt,
        distributedBy: prizeDistributionsTable.distributedBy,
        notes: prizeDistributionsTable.notes,
        participantName: participantsTable.fullName,
        participantNik: participantsTable.nik,
        kabupaten: participantsTable.city,
        kecamatan: participantsTable.kecamatan,
        kelurahan: participantsTable.kelurahan,
        prizeName: prizesTable.name,
        prizeId: prizesTable.id,
        eventName: eventsTable.name,
      })
      .from(prizeDistributionsTable)
      .innerJoin(participantsTable, eq(prizeDistributionsTable.participantId, participantsTable.id))
      .innerJoin(prizesTable, eq(prizeDistributionsTable.prizeId, prizesTable.id))
      .leftJoin(eventsTable, eq(prizesTable.eventId, eventsTable.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(sql`${prizeDistributionsTable.distributedAt} desc`)
      .limit(500);

    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "Error listing all distributions");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/:id/distributions", requireAuth, async (req, res) => {
  try {
    const prizeId = parseInt(req.params.id);

    const distributions = await db
      .select({
        id: prizeDistributionsTable.id,
        prizeId: prizeDistributionsTable.prizeId,
        participantId: prizeDistributionsTable.participantId,
        participantName: participantsTable.fullName,
        participantNik: participantsTable.nik,
        distributedBy: prizeDistributionsTable.distributedBy,
        distributedAt: prizeDistributionsTable.distributedAt,
        notes: prizeDistributionsTable.notes,
      })
      .from(prizeDistributionsTable)
      .leftJoin(participantsTable, eq(prizeDistributionsTable.participantId, participantsTable.id))
      .where(eq(prizeDistributionsTable.prizeId, prizeId))
      .orderBy(sql`${prizeDistributionsTable.distributedAt} desc`);

    res.json(distributions);
  } catch (err) {
    req.log.error({ err }, "Error listing distributions");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/:id/distribute", requireAuth, async (req, res) => {
  try {
    const prizeId = parseInt(req.params.id);
    const { participantId, distributedBy, notes } = req.body;

    if (!participantId) return res.status(400).json({ error: "participantId is required" });

    const [prize] = await db.select().from(prizesTable).where(eq(prizesTable.id, prizeId));
    if (!prize) return res.status(404).json({ error: "Prize not found" });
    if (prize.distributedCount >= prize.quantity) {
      return res.status(400).json({ error: "Semua hadiah sudah didistribusikan" });
    }

    const [dist] = await db.insert(prizeDistributionsTable).values({
      prizeId,
      participantId: parseInt(participantId),
      distributedBy: distributedBy || null,
      notes: notes || null,
    }).returning();

    await db.update(prizesTable)
      .set({ distributedCount: prize.distributedCount + 1 })
      .where(eq(prizesTable.id, prizeId));

    res.status(201).json(dist);
  } catch (err) {
    req.log.error({ err }, "Error distributing prize");
    res.status(400).json({ error: "Invalid data" });
  }
});

export default router;
