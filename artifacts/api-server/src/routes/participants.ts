import { Router } from "express";
import { db } from "@workspace/db";
import { participantsTable, eventRegistrationsTable, eventsTable } from "@workspace/db";
import { eq, sql, and, gte, lte, ilike, or } from "drizzle-orm";
import {
  ListParticipantsQueryParams,
  GetParticipantByNikParams,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";

const router = Router();

router.get("/", requireAuth, async (req, res) => {
  try {
    const query = ListParticipantsQueryParams.safeParse(req.query);
    const { search, startDate, endDate } = query.success ? query.data : {};

    let conditions: any[] = [];
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
        religion: participantsTable.religion,
        maritalStatus: participantsTable.maritalStatus,
        occupation: participantsTable.occupation,
        nationality: participantsTable.nationality,
        eventCount: sql<number>`cast(count(${eventRegistrationsTable.id}) as integer)`,
        firstRegisteredAt: sql<string>`min(${eventRegistrationsTable.registeredAt})`,
        lastRegisteredAt: sql<string>`max(${eventRegistrationsTable.registeredAt})`,
      })
      .from(participantsTable)
      .leftJoin(eventRegistrationsTable, eq(participantsTable.id, eventRegistrationsTable.participantId))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .groupBy(participantsTable.id)
      .orderBy(sql`max(${eventRegistrationsTable.registeredAt}) desc nulls last`);

    res.json(participants);
  } catch (err) {
    req.log.error({ err }, "Error listing participants");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/:nik", requireAuth, async (req, res) => {
  try {
    const { nik } = GetParticipantByNikParams.parse({ nik: req.params.nik });

    const [participant] = await db
      .select()
      .from(participantsTable)
      .where(eq(participantsTable.nik, nik));

    if (!participant) return res.status(404).json({ error: "Participant not found" });

    const registrations = await db
      .select({
        id: eventsTable.id,
        name: eventsTable.name,
        description: eventsTable.description,
        location: eventsTable.location,
        eventDate: eventsTable.eventDate,
        createdAt: eventsTable.createdAt,
        participantCount: sql<number>`cast((select count(*) from event_registrations er where er.event_id = ${eventsTable.id}) as integer)`,
      })
      .from(eventRegistrationsTable)
      .innerJoin(eventsTable, eq(eventRegistrationsTable.eventId, eventsTable.id))
      .where(eq(eventRegistrationsTable.participantId, participant.id))
      .orderBy(sql`${eventsTable.eventDate} desc`);

    res.json({
      nik: participant.nik,
      fullName: participant.fullName,
      address: participant.address,
      birthPlace: participant.birthPlace,
      birthDate: participant.birthDate,
      gender: participant.gender,
      religion: participant.religion,
      maritalStatus: participant.maritalStatus,
      occupation: participant.occupation,
      nationality: participant.nationality,
      events: registrations,
    });
  } catch (err) {
    req.log.error({ err }, "Error getting participant");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
