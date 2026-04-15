import { Router } from "express";
import { db } from "@workspace/db";
import { participantsTable, eventRegistrationsTable, eventsTable } from "@workspace/db";
import { sql, count, countDistinct } from "drizzle-orm";

const router = Router();

router.get("/summary", async (_req, res) => {
  try {
    const [totals] = await db
      .select({
        totalDesa: countDistinct(participantsTable.kelurahan),
        totalKecamatan: countDistinct(participantsTable.kecamatan),
        totalKabupaten: countDistinct(participantsTable.city),
      })
      .from(participantsTable);

    const desaWithEvents = await db
      .select({ kelurahan: participantsTable.kelurahan })
      .from(participantsTable)
      .innerJoin(eventRegistrationsTable, sql`${eventRegistrationsTable.participantId} = ${participantsTable.id}`)
      .groupBy(participantsTable.kelurahan)
      .having(sql`count(distinct ${eventRegistrationsTable.eventId}) > 0`);

    return res.json({
      totalDesa: totals.totalDesa || 0,
      totalKecamatan: totals.totalKecamatan || 0,
      totalKabupaten: totals.totalKabupaten || 0,
      desaWithEvents: desaWithEvents.length,
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Server error" });
  }
});

router.get("/kabupaten", async (_req, res) => {
  try {
    const data = await db
      .select({
        kabupaten: participantsTable.city,
        totalInput: countDistinct(participantsTable.id),
        totalDesa: countDistinct(participantsTable.kelurahan),
        totalKecamatan: countDistinct(participantsTable.kecamatan),
        totalEvent: countDistinct(eventRegistrationsTable.eventId),
      })
      .from(participantsTable)
      .leftJoin(eventRegistrationsTable, sql`${eventRegistrationsTable.participantId} = ${participantsTable.id}`)
      .where(sql`${participantsTable.city} is not null`)
      .groupBy(participantsTable.city)
      .orderBy(sql`count(distinct ${participantsTable.id}) desc`);
    return res.json(data);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Server error" });
  }
});

router.get("/kecamatan", async (req, res) => {
  try {
    const { kabupaten } = req.query as Record<string, string>;
    const conditions: ReturnType<typeof sql>[] = [sql`${participantsTable.kecamatan} is not null`];
    if (kabupaten) conditions.push(sql`${participantsTable.city} ilike ${"%" + kabupaten + "%"}`);
    const data = await db
      .select({
        kecamatan: participantsTable.kecamatan,
        kabupaten: sql<string>`min(${participantsTable.city})`,
        totalInput: countDistinct(participantsTable.id),
        totalDesa: countDistinct(participantsTable.kelurahan),
        totalEvent: countDistinct(eventRegistrationsTable.eventId),
      })
      .from(participantsTable)
      .leftJoin(eventRegistrationsTable, sql`${eventRegistrationsTable.participantId} = ${participantsTable.id}`)
      .where(sql`${conditions.reduce((a, b) => sql`${a} and ${b}`)}`)
      .groupBy(participantsTable.kecamatan)
      .orderBy(sql`count(distinct ${participantsTable.id}) desc`);
    return res.json(data);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Server error" });
  }
});

router.get("/desa", async (req, res) => {
  try {
    const { kabupaten, kecamatan, search } = req.query as Record<string, string>;
    const conditions: ReturnType<typeof sql>[] = [sql`${participantsTable.kelurahan} is not null`];
    if (kabupaten) conditions.push(sql`${participantsTable.city} ilike ${"%" + kabupaten + "%"}`);
    if (kecamatan) conditions.push(sql`${participantsTable.kecamatan} ilike ${"%" + kecamatan + "%"}`);
    if (search) conditions.push(sql`${participantsTable.kelurahan} ilike ${"%" + search + "%"}`);

    const data = await db
      .select({
        kelurahan: participantsTable.kelurahan,
        kecamatan: sql<string>`min(${participantsTable.kecamatan})`,
        kabupaten: sql<string>`min(${participantsTable.city})`,
        totalInput: countDistinct(participantsTable.id),
        totalEvent: countDistinct(eventRegistrationsTable.eventId),
      })
      .from(participantsTable)
      .leftJoin(eventRegistrationsTable, sql`${eventRegistrationsTable.participantId} = ${participantsTable.id}`)
      .where(sql`${conditions.reduce((a, b) => sql`${a} and ${b}`)}`)
      .groupBy(participantsTable.kelurahan)
      .orderBy(sql`count(distinct ${participantsTable.id}) desc`)
      .limit(200);
    return res.json(data);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Server error" });
  }
});

router.get("/desa/:kelurahan", async (req, res) => {
  try {
    const { kelurahan } = req.params;
    const [info] = await db
      .select({
        kelurahan: participantsTable.kelurahan,
        kecamatan: sql<string>`min(${participantsTable.kecamatan})`,
        kabupaten: sql<string>`min(${participantsTable.city})`,
        totalInput: countDistinct(participantsTable.id),
        totalEvent: countDistinct(eventRegistrationsTable.eventId),
      })
      .from(participantsTable)
      .leftJoin(eventRegistrationsTable, sql`${eventRegistrationsTable.participantId} = ${participantsTable.id}`)
      .where(sql`lower(${participantsTable.kelurahan}) = lower(${kelurahan})`)
      .groupBy(participantsTable.kelurahan);

    const events = await db
      .select({
        eventId: eventsTable.id,
        eventName: eventsTable.name,
        eventDate: eventsTable.eventDate,
        location: eventsTable.location,
        peserta: count(participantsTable.id),
      })
      .from(participantsTable)
      .innerJoin(eventRegistrationsTable, sql`${eventRegistrationsTable.participantId} = ${participantsTable.id}`)
      .innerJoin(eventsTable, sql`${eventsTable.id} = ${eventRegistrationsTable.eventId}`)
      .where(sql`lower(${participantsTable.kelurahan}) = lower(${kelurahan})`)
      .groupBy(eventsTable.id, eventsTable.name, eventsTable.eventDate, eventsTable.location)
      .orderBy(sql`count(${participantsTable.id}) desc`);

    return res.json({ ...info, events });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Server error" });
  }
});

router.get("/desa/:kelurahan/event/:eventId/participants", async (req, res) => {
  try {
    const { kelurahan, eventId } = req.params;
    const data = await db
      .select({
        nik: participantsTable.nik,
        fullName: participantsTable.fullName,
        gender: participantsTable.gender,
        occupation: participantsTable.occupation,
        phone: eventRegistrationsTable.phone,
        tags: eventRegistrationsTable.tags,
        registeredAt: eventRegistrationsTable.registeredAt,
      })
      .from(participantsTable)
      .innerJoin(eventRegistrationsTable, sql`${eventRegistrationsTable.participantId} = ${participantsTable.id}`)
      .where(
        sql`lower(${participantsTable.kelurahan}) = lower(${kelurahan})
          and ${eventRegistrationsTable.eventId} = ${parseInt(eventId)}`
      )
      .orderBy(sql`${eventRegistrationsTable.registeredAt} desc`);
    return res.json(data);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Server error" });
  }
});

export default router;
