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
        category: eventsTable.category,
        location: eventsTable.location,
        eventDate: eventsTable.eventDate,
        startTime: eventsTable.startTime,
        endTime: eventsTable.endTime,
        targetParticipants: eventsTable.targetParticipants,
        isRsvp: eventsTable.isRsvp,
        status: eventsTable.status,
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
        category: eventsTable.category,
        location: eventsTable.location,
        eventDate: eventsTable.eventDate,
        startTime: eventsTable.startTime,
        endTime: eventsTable.endTime,
        targetParticipants: eventsTable.targetParticipants,
        isRsvp: eventsTable.isRsvp,
        status: eventsTable.status,
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
        city: participantsTable.city,
        registeredAt: eventRegistrationsTable.registeredAt,
        staffName: eventRegistrationsTable.staffName,
        phone: eventRegistrationsTable.phone,
        tags: eventRegistrationsTable.tags,
        registrationType: eventRegistrationsTable.registrationType,
        checkedInAt: eventRegistrationsTable.checkedInAt,
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

// RSVP: List all pre-registered (RSVP) participants for an event
router.get("/:id/rsvp", requireAuth, async (req, res) => {
  try {
    const eventId = parseInt(req.params.id);
    const { participantsTable } = await import("@workspace/db");

    const list = await db
      .select({
        nik: participantsTable.nik,
        fullName: participantsTable.fullName,
        gender: participantsTable.gender,
        city: participantsTable.city,
        phone: eventRegistrationsTable.phone,
        email: eventRegistrationsTable.email,
        notes: eventRegistrationsTable.notes,
        registrationType: eventRegistrationsTable.registrationType,
        registeredAt: eventRegistrationsTable.registeredAt,
      })
      .from(eventRegistrationsTable)
      .innerJoin(participantsTable, eq(eventRegistrationsTable.participantId, participantsTable.id))
      .where(
        and(
          eq(eventRegistrationsTable.eventId, eventId),
          eq(eventRegistrationsTable.registrationType, "rsvp")
        )
      )
      .orderBy(participantsTable.fullName);

    res.json(list);
  } catch (err) {
    req.log.error({ err }, "Error listing RSVP participants");
    res.status(500).json({ error: "Internal server error" });
  }
});

// RSVP: Bulk import pre-registered participants
router.post("/:id/rsvp/import", requireAuth, async (req, res) => {
  try {
    const eventId = parseInt(req.params.id);
    const { participants: rows } = req.body as {
      participants: { nik: string; fullName: string; phone?: string; email?: string; notes?: string }[];
    };

    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: "Data peserta tidak boleh kosong" });
    }

    const { participantsTable } = await import("@workspace/db");
    const results = { inserted: 0, updated: 0, skipped: 0, errors: [] as string[] };

    for (const row of rows) {
      const nik = (row.nik ?? "").trim();
      const fullName = (row.fullName ?? "").trim();
      if (!nik || !fullName) {
        results.errors.push(`Baris dilewati: NIK="${nik}" atau nama kosong`);
        results.skipped++;
        continue;
      }

      try {
        // Upsert participant
        const [participant] = await db
          .insert(participantsTable)
          .values({ nik, fullName })
          .onConflictDoUpdate({ target: participantsTable.nik, set: { fullName } })
          .returning({ id: participantsTable.id });

        // Upsert registration as RSVP
        await db
          .insert(eventRegistrationsTable)
          .values({
            eventId,
            participantId: participant.id,
            phone: row.phone ?? null,
            email: row.email ?? null,
            notes: row.notes ?? null,
            registrationType: "rsvp",
            staffName: "RSVP Import",
          })
          .onConflictDoUpdate({
            target: [eventRegistrationsTable.eventId, eventRegistrationsTable.participantId],
            set: {
              phone: row.phone ?? null,
              email: row.email ?? null,
              notes: row.notes ?? null,
              registrationType: "rsvp",
            },
          });

        results.inserted++;
      } catch (e: any) {
        results.errors.push(`NIK ${nik}: ${e.message}`);
        results.skipped++;
      }
    }

    res.json({ success: true, ...results });
  } catch (err) {
    req.log.error({ err }, "Error importing RSVP");
    res.status(500).json({ error: "Internal server error" });
  }
});

// RSVP: Delete a pre-registered participant by NIK
router.delete("/:id/rsvp/:nik", requireAuth, async (req, res) => {
  try {
    const eventId = parseInt(req.params.id);
    const nik = req.params.nik.trim();
    const { participantsTable } = await import("@workspace/db");

    const participant = await db.query.participantsTable.findFirst({
      where: (t, { eq }) => eq(t.nik, nik),
    });

    if (!participant) {
      return res.status(404).json({ error: "Peserta tidak ditemukan" });
    }

    await db.delete(eventRegistrationsTable).where(
      and(
        eq(eventRegistrationsTable.eventId, eventId),
        eq(eventRegistrationsTable.participantId, participant.id),
        eq(eventRegistrationsTable.registrationType, "rsvp")
      )
    );

    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Error deleting RSVP");
    res.status(500).json({ error: "Internal server error" });
  }
});

// RSVP: Verify a participant is registered in this event by NIK
router.post("/:id/rsvp/check", requireAuth, async (req, res) => {
  try {
    const eventId = parseInt(req.params.id);
    const { nik } = req.body as { nik: string };

    if (!nik || !nik.trim()) {
      return res.status(400).json({ error: "NIK diperlukan" });
    }

    const { participantsTable } = await import("@workspace/db");

    const participant = await db.query.participantsTable.findFirst({
      where: (t, { eq }) => eq(t.nik, nik.trim()),
    });

    if (!participant) {
      return res.status(404).json({ error: "NIK tidak ditemukan dalam database. Peserta belum pernah didaftarkan." });
    }

    const registration = await db.query.eventRegistrationsTable.findFirst({
      where: (t, { and, eq }) => and(
        eq(t.eventId, eventId),
        eq(t.participantId, participant.id)
      ),
    });

    if (!registration) {
      return res.status(404).json({
        error: "Peserta tidak terdaftar di event ini",
        participant: {
          fullName: participant.fullName,
          nik: participant.nik,
        },
      });
    }

    // Mark check-in time (attendance on the day)
    const now = new Date();
    await db
      .update(eventRegistrationsTable)
      .set({ checkedInAt: now })
      .where(
        and(
          eq(eventRegistrationsTable.eventId, eventId),
          eq(eventRegistrationsTable.participantId, participant.id)
        )
      );

    return res.json({
      valid: true,
      participant: {
        nik: participant.nik,
        fullName: participant.fullName,
        gender: participant.gender,
        city: participant.city,
        occupation: participant.occupation,
        birthDate: participant.birthDate,
        birthPlace: participant.birthPlace,
      },
      registration: {
        registeredAt: registration.registeredAt,
        checkedInAt: now.toISOString(),
        phone: registration.phone,
        email: registration.email,
        tags: registration.tags,
        staffName: registration.staffName,
      },
    });
  } catch (err) {
    req.log.error({ err }, "Error checking RSVP");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
