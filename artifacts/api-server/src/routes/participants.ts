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
    const { search, startDate, endDate, gender, city, province, minEvents } = query.success ? query.data : {};

    const conditions: any[] = [];
    if (search) {
      conditions.push(
        or(
          ilike(participantsTable.fullName, `%${search}%`),
          ilike(participantsTable.nik, `%${search}%`),
          ilike(participantsTable.occupation, `%${search}%`),
          ilike(participantsTable.address, `%${search}%`),
          ilike(participantsTable.religion, `%${search}%`),
          ilike(participantsTable.maritalStatus, `%${search}%`),
          ilike(participantsTable.kelurahan, `%${search}%`),
          ilike(participantsTable.kecamatan, `%${search}%`),
          ilike(participantsTable.city, `%${search}%`),
          ilike(participantsTable.province, `%${search}%`),
          ilike(participantsTable.phone, `%${search}%`),
          ilike(participantsTable.email, `%${search}%`),
          ilike(participantsTable.socialStatus, `%${search}%`)
        )
      );
    }
    if (gender) conditions.push(eq(participantsTable.gender, gender));
    if (city) conditions.push(ilike(participantsTable.city, `%${city}%`));
    if (province) conditions.push(ilike(participantsTable.province, `%${province}%`));

    const baseQuery = db
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
        city: participantsTable.city,
        kecamatan: participantsTable.kecamatan,
        kelurahan: participantsTable.kelurahan,
        province: participantsTable.province,
        eventCount: sql<number>`cast(count(${eventRegistrationsTable.id}) as integer)`,
        firstRegisteredAt: sql<string>`min(${eventRegistrationsTable.registeredAt})`,
        lastRegisteredAt: sql<string>`max(${eventRegistrationsTable.registeredAt})`,
      })
      .from(participantsTable)
      .leftJoin(eventRegistrationsTable, eq(participantsTable.id, eventRegistrationsTable.participantId))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .groupBy(participantsTable.id)
      .orderBy(sql`max(${eventRegistrationsTable.registeredAt}) desc nulls last`);

    let participants = await baseQuery;

    // minEvents filter applied post-group since HAVING requires raw SQL
    if (minEvents && minEvents > 0) {
      participants = participants.filter((p) => p.eventCount >= minEvents);
    }

    res.json(participants);
  } catch (err) {
    req.log.error({ err }, "Error listing participants");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Social status categories — unique values from participants
router.get("/social-status-categories", requireAuth, async (req, res) => {
  try {
    const rows = await db
      .selectDistinct({ socialStatus: participantsTable.socialStatus })
      .from(participantsTable)
      .where(sql`${participantsTable.socialStatus} is not null and ${participantsTable.socialStatus} != ''`)
      .orderBy(participantsTable.socialStatus);
    res.json(rows.map((r) => r.socialStatus).filter(Boolean));
  } catch (err) {
    req.log.error({ err }, "Error getting social status categories");
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
        registeredAt: eventRegistrationsTable.registeredAt,
        staffName: eventRegistrationsTable.staffName,
        phone: eventRegistrationsTable.phone,
        email: eventRegistrationsTable.email,
        tags: eventRegistrationsTable.tags,
        notes: eventRegistrationsTable.notes,
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
      rtRw: participant.rtRw,
      kelurahan: participant.kelurahan,
      kecamatan: participant.kecamatan,
      city: participant.city,
      province: participant.province,
      bloodType: participant.bloodType,
      events: registrations,
    });
  } catch (err) {
    req.log.error({ err }, "Error getting participant");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
