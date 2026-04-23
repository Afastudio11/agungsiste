import { Router } from "express";
import { db } from "@workspace/db";
import { participantsTable, eventRegistrationsTable, eventsTable, usersTable, adminAuditLogTable, programsTable, programRegistrationsTable } from "@workspace/db";
import { eq, ne, sql, and, gte, lte, ilike, or } from "drizzle-orm";
import {
  ListParticipantsQueryParams,
  GetParticipantByNikParams,
} from "@workspace/api-zod";
import { requireAuth, requireAdmin } from "../middlewares/auth";

async function getSessionUser(userId: number | undefined) {
  if (!userId) return null;
  const [user] = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(eq(usersTable.id, userId));
  return user ?? null;
}

async function logAdminAction(userId: number | undefined, action: string, participantNik: string, participantName: string, details?: object) {
  try {
    const user = await getSessionUser(userId);
    await db.insert(adminAuditLogTable).values({
      userId: user?.id ?? null,
      userName: user?.name ?? null,
      action,
      participantNik,
      participantName,
      details: details ? JSON.stringify(details) : null,
    });
  } catch {
    // log silently
  }
}

const router = Router();

router.get("/", requireAuth, async (req, res) => {
  try {
    const query = ListParticipantsQueryParams.safeParse(req.query);
    const { search, startDate, endDate, gender, city, province, minEvents } = query.success ? query.data : {};
    const { kecamatan, kelurahan } = req.query as Record<string, string>;

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
    if (kecamatan) conditions.push(ilike(participantsTable.kecamatan, `%${kecamatan}%`));
    if (kelurahan) conditions.push(ilike(participantsTable.kelurahan, `%${kelurahan}%`));

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
        rtRw: participantsTable.rtRw,
        bloodType: participantsTable.bloodType,
        hasKtpImage: sql<boolean>`(${participantsTable.ktpImagePath} is not null and length(${participantsTable.ktpImagePath}) > 0)`,
        eventCount: sql<number>`cast(count(${eventRegistrationsTable.id}) as integer)`,
        programCount: sql<number>`(select cast(count(*) as integer) from program_registrations where participant_id = ${participantsTable.id})`,
        firstRegisteredAt: sql<string>`min(${eventRegistrationsTable.registeredAt})`,
        lastRegisteredAt: sql<string>`max(${eventRegistrationsTable.registeredAt})`,
        registeredBy: sql<string>`(select staff_name from event_registrations where participant_id = ${participantsTable.id} order by registered_at desc limit 1)`,
      })
      .from(participantsTable)
      .innerJoin(
        eventRegistrationsTable,
        and(
          eq(participantsTable.id, eventRegistrationsTable.participantId),
          ne(eventRegistrationsTable.registrationType, "attendance")
        )
      )
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

router.put("/:nik", requireAdmin, async (req, res) => {
  try {
    const { nik } = GetParticipantByNikParams.parse({ nik: req.params.nik });

    const [existing] = await db
      .select({ id: participantsTable.id })
      .from(participantsTable)
      .where(eq(participantsTable.nik, nik));

    if (!existing) return res.status(404).json({ error: "Peserta tidak ditemukan" });

    const {
      fullName, birthPlace, birthDate, gender, religion, maritalStatus,
      occupation, nationality, rtRw, kelurahan, kecamatan, city, province,
      bloodType, address, phone, email, socialStatus,
    } = req.body;

    if (!fullName) return res.status(400).json({ error: "Nama lengkap diperlukan" });

    const [beforeUpdate] = await db
      .select({ fullName: participantsTable.fullName })
      .from(participantsTable)
      .where(eq(participantsTable.id, existing.id));

    await db
      .update(participantsTable)
      .set({
        fullName,
        birthPlace: birthPlace || null,
        birthDate: birthDate || null,
        gender: gender || null,
        religion: religion || null,
        maritalStatus: maritalStatus || null,
        occupation: occupation || null,
        nationality: nationality || null,
        rtRw: rtRw || null,
        kelurahan: kelurahan || null,
        kecamatan: kecamatan || null,
        city: city || null,
        province: province || null,
        bloodType: bloodType || null,
        address: address || null,
        phone: phone || null,
        email: email || null,
        socialStatus: socialStatus || null,
        updatedAt: new Date(),
      })
      .where(eq(participantsTable.id, existing.id));

    await logAdminAction(
      req.session?.userId as number | undefined,
      "EDIT_PARTICIPANT",
      nik,
      fullName,
      { oldName: beforeUpdate?.fullName, city, kecamatan, kelurahan }
    );

    res.json({ success: true, nik });
  } catch (err) {
    req.log.error({ err }, "Error updating participant");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/:nik", requireAdmin, async (req, res) => {
  try {
    const { nik } = GetParticipantByNikParams.parse({ nik: req.params.nik });

    const [existing] = await db
      .select({ id: participantsTable.id, fullName: participantsTable.fullName })
      .from(participantsTable)
      .where(eq(participantsTable.nik, nik));

    if (!existing) return res.status(404).json({ error: "Peserta tidak ditemukan" });

    await db.delete(participantsTable).where(eq(participantsTable.id, existing.id));

    await logAdminAction(
      req.session?.userId as number | undefined,
      "DELETE_PARTICIPANT",
      nik,
      existing.fullName
    );

    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Error deleting participant");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Manually add an event registration for a participant
router.post("/:nik/registrations", requireAdmin, async (req, res) => {
  try {
    const { nik } = GetParticipantByNikParams.parse({ nik: req.params.nik });
    const { eventId, notes } = req.body as { eventId?: number; notes?: string };
    if (!eventId) return res.status(400).json({ error: "eventId diperlukan" });

    const [participant] = await db.select({ id: participantsTable.id, fullName: participantsTable.fullName })
      .from(participantsTable).where(eq(participantsTable.nik, nik));
    if (!participant) return res.status(404).json({ error: "Peserta tidak ditemukan" });

    const [event] = await db.select({ id: eventsTable.id, name: eventsTable.name })
      .from(eventsTable).where(eq(eventsTable.id, Number(eventId)));
    if (!event) return res.status(404).json({ error: "Kegiatan tidak ditemukan" });

    const [existing] = await db.select({ id: eventRegistrationsTable.id })
      .from(eventRegistrationsTable)
      .where(and(eq(eventRegistrationsTable.eventId, event.id), eq(eventRegistrationsTable.participantId, participant.id)));
    if (existing) return res.status(409).json({ error: "Peserta sudah terdaftar di kegiatan ini" });

    await db.insert(eventRegistrationsTable).values({
      eventId: event.id,
      participantId: participant.id,
      registrationType: "manual",
      notes: notes || null,
    });

    await logAdminAction(req.session?.userId as number | undefined, "ADD_REGISTRATION", nik, participant.fullName ?? "", { eventId: event.id, eventName: event.name });
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Error adding registration");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Manually remove an event registration for a participant
router.delete("/:nik/registrations/:eventId", requireAdmin, async (req, res) => {
  try {
    const { nik } = GetParticipantByNikParams.parse({ nik: req.params.nik });
    const eventId = Number(req.params.eventId);

    const [participant] = await db.select({ id: participantsTable.id, fullName: participantsTable.fullName })
      .from(participantsTable).where(eq(participantsTable.nik, nik));
    if (!participant) return res.status(404).json({ error: "Peserta tidak ditemukan" });

    await db.delete(eventRegistrationsTable).where(
      and(eq(eventRegistrationsTable.eventId, eventId), eq(eventRegistrationsTable.participantId, participant.id))
    );

    await logAdminAction(req.session?.userId as number | undefined, "REMOVE_REGISTRATION", nik, participant.fullName ?? "", { eventId });
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Error removing registration");
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

    const programRegistrations = await db
      .select({
        id: programsTable.id,
        name: programsTable.name,
        komisi: programsTable.komisi,
        mitra: programsTable.mitra,
        tahun: programsTable.tahun,
        status: programsTable.status,
        kabupatenPenerima: programsTable.kabupatenPenerima,
        registeredAt: programRegistrationsTable.registeredAt,
      })
      .from(programRegistrationsTable)
      .innerJoin(programsTable, eq(programRegistrationsTable.programId, programsTable.id))
      .where(eq(programRegistrationsTable.participantId, participant.id))
      .orderBy(sql`${programRegistrationsTable.registeredAt} desc`);

    res.json({
      nik: participant.nik,
      fullName: participant.fullName,
      phone: participant.phone,
      email: participant.email,
      socialStatus: participant.socialStatus,
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
      programs: programRegistrations,
    });
  } catch (err) {
    req.log.error({ err }, "Error getting participant");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
