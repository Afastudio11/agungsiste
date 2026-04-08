import { Router } from "express";
import { db } from "@workspace/db";
import { eventsTable, eventRegistrationsTable } from "@workspace/db";
import { eq, sql, and, gte, lte, ilike, or } from "drizzle-orm";
import {
  CreateEventBody,
  GetEventParams,
  ListEventsQueryParams,
  UpdateEventBody,
  UpdateEventParams,
  DeleteEventParams,
  ListEventParticipantsParams,
  ListEventParticipantsQueryParams,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";

const router = Router();

router.get("/", requireAuth, async (req, res) => {
  try {
    const query = ListEventsQueryParams.safeParse(req.query);
    const { startDate, endDate, search } = query.success ? query.data : {};

    let conditions = [];
    if (startDate) conditions.push(gte(eventsTable.eventDate, startDate));
    if (endDate) conditions.push(lte(eventsTable.eventDate, endDate));
    if (search) conditions.push(ilike(eventsTable.name, `%${search}%`));

    const events = await db
      .select({
        id: eventsTable.id,
        name: eventsTable.name,
        description: eventsTable.description,
        location: eventsTable.location,
        eventDate: eventsTable.eventDate,
        createdAt: eventsTable.createdAt,
        participantCount: sql<number>`cast(count(${eventRegistrationsTable.id}) as integer)`,
      })
      .from(eventsTable)
      .leftJoin(eventRegistrationsTable, eq(eventsTable.id, eventRegistrationsTable.eventId))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .groupBy(eventsTable.id)
      .orderBy(sql`${eventsTable.eventDate} desc`);

    res.json(events);
  } catch (err) {
    req.log.error({ err }, "Error listing events");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", requireAuth, async (req, res) => {
  try {
    const body = CreateEventBody.parse(req.body);
    const [event] = await db.insert(eventsTable).values(body).returning();
    res.status(201).json({ ...event, participantCount: 0 });
  } catch (err) {
    req.log.error({ err }, "Error creating event");
    res.status(400).json({ error: "Invalid data" });
  }
});

router.get("/:id", requireAuth, async (req, res) => {
  try {
    const { id } = GetEventParams.parse({ id: parseInt(req.params.id) });
    const [event] = await db
      .select({
        id: eventsTable.id,
        name: eventsTable.name,
        description: eventsTable.description,
        location: eventsTable.location,
        eventDate: eventsTable.eventDate,
        createdAt: eventsTable.createdAt,
        participantCount: sql<number>`cast(count(${eventRegistrationsTable.id}) as integer)`,
      })
      .from(eventsTable)
      .leftJoin(eventRegistrationsTable, eq(eventsTable.id, eventRegistrationsTable.eventId))
      .where(eq(eventsTable.id, id))
      .groupBy(eventsTable.id);

    if (!event) return res.status(404).json({ error: "Event not found" });
    res.json(event);
  } catch (err) {
    req.log.error({ err }, "Error getting event");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/:id", requireAuth, async (req, res) => {
  try {
    const { id } = UpdateEventParams.parse({ id: parseInt(req.params.id) });
    const body = UpdateEventBody.parse(req.body);
    const [event] = await db.update(eventsTable).set(body).where(eq(eventsTable.id, id)).returning();
    if (!event) return res.status(404).json({ error: "Event not found" });
    const count = await db.$count(eventRegistrationsTable, eq(eventRegistrationsTable.eventId, id));
    res.json({ ...event, participantCount: count });
  } catch (err) {
    req.log.error({ err }, "Error updating event");
    res.status(400).json({ error: "Invalid data" });
  }
});

router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const { id } = DeleteEventParams.parse({ id: parseInt(req.params.id) });
    await db.delete(eventsTable).where(eq(eventsTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Error deleting event");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/:id/participants", requireAuth, async (req, res) => {
  try {
    const { id } = ListEventParticipantsParams.parse({ id: parseInt(req.params.id) });
    const query = ListEventParticipantsQueryParams.safeParse(req.query);
    const { search } = query.success ? query.data : {};

    const { participantsTable } = await import("@workspace/db");

    let conditions: any[] = [eq(eventRegistrationsTable.eventId, id)];
    if (search) {
      conditions.push(
        or(
          ilike(participantsTable.fullName, `%${search}%`),
          ilike(participantsTable.nik, `%${search}%`)
        )
      );
    }

    const participants = await db
      .select({
        nik: participantsTable.nik,
        fullName: participantsTable.fullName,
        address: participantsTable.address,
        birthPlace: participantsTable.birthPlace,
        birthDate: participantsTable.birthDate,
        gender: participantsTable.gender,
        occupation: participantsTable.occupation,
        registeredAt: eventRegistrationsTable.registeredAt,
        eventCount: sql<number>`cast((select count(*) from event_registrations er2 where er2.participant_id = ${participantsTable.id}) as integer)`,
      })
      .from(eventRegistrationsTable)
      .innerJoin(participantsTable, eq(eventRegistrationsTable.participantId, participantsTable.id))
      .where(and(...conditions))
      .orderBy(sql`${eventRegistrationsTable.registeredAt} desc`);

    res.json(participants);
  } catch (err) {
    req.log.error({ err }, "Error listing event participants");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
