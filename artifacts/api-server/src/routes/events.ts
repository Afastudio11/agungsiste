import { Router } from "express";
import crypto from "crypto";
import { db } from "@workspace/db";
import { eventsTable, eventRegistrationsTable, participantsTable, usersTable } from "@workspace/db";
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
import { requireAuth, requireAdmin } from "../middlewares/auth";
import QRCode from "qrcode";

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
        registrationToken: eventsTable.registrationToken,
        attendanceToken: eventsTable.attendanceToken,
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

router.post("/", requireAdmin, async (req, res) => {
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
        registrationToken: eventsTable.registrationToken,
        attendanceToken: eventsTable.attendanceToken,
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

router.put("/:id", requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    const { name, description, category, location, eventDate, startTime, endTime, targetParticipants, isRsvp, status } = req.body as Record<string, any>;
    if (!name || !eventDate) return res.status(400).json({ error: "name and eventDate are required" });
    const [event] = await db.update(eventsTable).set({
      name,
      description: description ?? null,
      category: category ?? null,
      location: location ?? null,
      eventDate,
      startTime: startTime ?? null,
      endTime: endTime ?? null,
      targetParticipants: targetParticipants ? parseInt(targetParticipants) : null,
      isRsvp: isRsvp === true || isRsvp === "true",
      status: status ?? "active",
    }).where(eq(eventsTable.id, id)).returning();
    if (!event) return res.status(404).json({ error: "Event not found" });
    const count = await db.$count(eventRegistrationsTable, eq(eventRegistrationsTable.eventId, id));
    res.json({ ...event, participantCount: count });
  } catch (err) {
    req.log.error({ err }, "Error updating event");
    res.status(400).json({ error: "Invalid data" });
  }
});

router.patch("/:id/status", requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    const { status } = req.body as { status?: string };
    if (status !== "active" && status !== "inactive") {
      return res.status(400).json({ error: "status must be 'active' or 'inactive'" });
    }
    const [event] = await db.update(eventsTable).set({ status }).where(eq(eventsTable.id, id)).returning();
    if (!event) return res.status(404).json({ error: "Event not found" });
    res.json(event);
  } catch (err) {
    req.log.error({ err }, "Error toggling event status");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/:id", requireAdmin, async (req, res) => {
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
router.post("/:id/rsvp/import", requireAdmin, async (req, res) => {
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
router.delete("/:id/rsvp/:nik", requireAdmin, async (req, res) => {
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
    const rsvpStaffUserId = (req.session as any).userId as number | undefined;

    const rsvpUpdateFields: Record<string, unknown> = { checkedInAt: now };

    if (rsvpStaffUserId && !registration.staffId) {
      const [rsvpStaffUser] = await db
        .select({ name: usersTable.name })
        .from(usersTable)
        .where(eq(usersTable.id, rsvpStaffUserId));
      if (rsvpStaffUser) {
        rsvpUpdateFields.staffId = rsvpStaffUserId;
        rsvpUpdateFields.staffName = rsvpStaffUser.name;
      }
    }

    await db
      .update(eventRegistrationsTable)
      .set(rsvpUpdateFields as any)
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
        staffName: rsvpUpdateFields.staffName as string ?? registration.staffName,
      },
    });
  } catch (err) {
    req.log.error({ err }, "Error checking RSVP");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/:id/generate-tokens", requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { type } = req.body;

    const updates: any = {};
    if (!type || type === "registration") {
      updates.registrationToken = crypto.randomBytes(12).toString("hex");
    }
    if (!type || type === "attendance") {
      updates.attendanceToken = crypto.randomBytes(12).toString("hex");
    }

    const [event] = await db.update(eventsTable).set(updates).where(eq(eventsTable.id, id)).returning();
    if (!event) return res.status(404).json({ error: "Event not found" });

    res.json({
      registrationToken: event.registrationToken,
      attendanceToken: event.attendanceToken,
    });
  } catch (err) {
    req.log.error({ err }, "Error generating tokens");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/:id/qrcode/:type", requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const type = req.params.type as "registration" | "attendance";

    const [event] = await db.select().from(eventsTable).where(eq(eventsTable.id, id));
    if (!event) return res.status(404).json({ error: "Event not found" });

    const token = type === "registration" ? event.registrationToken : event.attendanceToken;
    if (!token) return res.status(400).json({ error: `${type} token belum dibuat` });

    const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost";
    const protocol = req.headers["x-forwarded-proto"] || "https";
    const basePath = type === "registration" ? "p/register" : "p/attend";
    const url = `${protocol}://${host}/${basePath}/${token}`;

    const qrDataUrl = await QRCode.toDataURL(url, { width: 400, margin: 2 });
    res.json({ url, qrDataUrl, token });
  } catch (err) {
    req.log.error({ err }, "Error generating QR code");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/:id/qr-checkin", requireAuth, async (req, res) => {
  try {
    const eventId = parseInt(req.params.id);
    const { nik } = req.body;
    if (!nik) return res.status(400).json({ error: "NIK diperlukan" });

    const [event] = await db.select().from(eventsTable).where(eq(eventsTable.id, eventId));
    if (!event) return res.status(404).json({ error: "Event tidak ditemukan" });

    const participant = await db.query.participantsTable.findFirst({
      where: eq(participantsTable.nik, nik),
    });
    if (!participant) return res.status(404).json({ error: "Peserta tidak ditemukan" });

    const registration = await db.query.eventRegistrationsTable.findFirst({
      where: (t, { and: a, eq: e }) => a(e(t.eventId, eventId), e(t.participantId, participant.id)),
    });
    if (!registration) return res.status(404).json({ error: "Peserta belum terdaftar di event ini" });

    if (registration.checkedInAt) {
      return res.json({
        success: true,
        alreadyCheckedIn: true,
        message: "Peserta sudah check-in sebelumnya",
        participant: { fullName: participant.fullName, nik: participant.nik },
        checkedInAt: registration.checkedInAt,
      });
    }

    const now = new Date();
    const staffUserId = (req.session as any).userId as number | undefined;

    const updateFields: Record<string, unknown> = { checkedInAt: now };

    if (staffUserId && !registration.staffId) {
      const [staffUser] = await db
        .select({ name: usersTable.name })
        .from(usersTable)
        .where(eq(usersTable.id, staffUserId));
      if (staffUser) {
        updateFields.staffId = staffUserId;
        updateFields.staffName = staffUser.name;
      }
    }

    await db.update(eventRegistrationsTable)
      .set(updateFields as any)
      .where(eq(eventRegistrationsTable.id, registration.id));

    res.json({
      success: true,
      alreadyCheckedIn: false,
      message: "Absensi berhasil dicatat",
      participant: { fullName: participant.fullName, nik: participant.nik },
      checkedInAt: now.toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "Error QR check-in");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/public/by-token/:token", async (req, res) => {
  try {
    const token = req.params.token;
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
        status: eventsTable.status,
        registrationToken: eventsTable.registrationToken,
        attendanceToken: eventsTable.attendanceToken,
      })
      .from(eventsTable)
      .where(
        or(
          eq(eventsTable.registrationToken, token),
          eq(eventsTable.attendanceToken, token)
        )
      );

    if (!event) return res.status(404).json({ error: "Event tidak ditemukan" });

    const isRegistration = event.registrationToken === token;
    const isAttendance = event.attendanceToken === token;

    res.json({
      id: event.id,
      name: event.name,
      description: event.description,
      category: event.category,
      location: event.location,
      eventDate: event.eventDate,
      startTime: event.startTime,
      endTime: event.endTime,
      status: event.status,
      mode: isRegistration ? "registration" : "attendance",
    });
  } catch (err) {
    req.log.error({ err }, "Error fetching public event");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/public/check-nik", async (req, res) => {
  try {
    const { nik, eventToken } = req.body;
    if (!nik) return res.status(400).json({ error: "NIK diperlukan" });
    if (!eventToken) return res.status(400).json({ error: "Token event diperlukan" });

    const tokenEvent = await db.query.eventsTable.findFirst({
      where: or(eq(eventsTable.registrationToken, eventToken), eq(eventsTable.attendanceToken, eventToken)),
    });
    if (!tokenEvent) return res.status(403).json({ error: "Token tidak valid" });

    const participant = await db.query.participantsTable.findFirst({
      where: eq(participantsTable.nik, nik),
    });

    if (!participant) {
      return res.json({ found: false, eventCount: 0 });
    }

    const eventCount = await db.$count(
      eventRegistrationsTable,
      eq(eventRegistrationsTable.participantId, participant.id)
    );

    const [lastReg] = await db
      .select({ phone: eventRegistrationsTable.phone, email: eventRegistrationsTable.email })
      .from(eventRegistrationsTable)
      .where(eq(eventRegistrationsTable.participantId, participant.id))
      .orderBy(sql`${eventRegistrationsTable.registeredAt} desc`)
      .limit(1);

    res.json({
      found: true,
      eventCount,
      hasKtpImage: !!participant.ktpImagePath,
      participant: {
        id: participant.id,
        nik: participant.nik,
        fullName: participant.fullName,
        gender: participant.gender,
        address: participant.address,
        province: participant.province,
        city: participant.city,
        kecamatan: participant.kecamatan,
        kelurahan: participant.kelurahan,
        rtRw: participant.rtRw,
        birthPlace: participant.birthPlace,
        birthDate: participant.birthDate,
        occupation: participant.occupation,
        bloodType: participant.bloodType,
        maritalStatus: participant.maritalStatus,
        religion: participant.religion,
        phone: lastReg?.phone ?? null,
        email: lastReg?.email ?? null,
      },
    });
  } catch (err) {
    req.log.error({ err }, "Error checking NIK");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/public/register/:token", async (req, res) => {
  try {
    const token = req.params.token;
    const { nik, fullName, phone, email, ...rest } = req.body;

    if (!nik || !fullName) {
      return res.status(400).json({ error: "NIK dan nama lengkap diperlukan" });
    }

    const [event] = await db
      .select()
      .from(eventsTable)
      .where(
        or(
          eq(eventsTable.registrationToken, token),
          eq(eventsTable.attendanceToken, token)
        )
      );

    if (!event) return res.status(404).json({ error: "Event tidak ditemukan" });

    const isAttendance = event.attendanceToken === token;
    const regType = isAttendance ? "attendance" : "rsvp";

    let participant = await db.query.participantsTable.findFirst({
      where: eq(participantsTable.nik, nik),
    });

    if (!participant) {
      const [p] = await db.insert(participantsTable).values({
        nik, fullName,
        address: rest.address || null,
        birthPlace: rest.birthPlace || null,
        birthDate: rest.birthDate || null,
        gender: rest.gender || null,
        religion: rest.religion || null,
        maritalStatus: rest.maritalStatus || null,
        occupation: rest.occupation || null,
        nationality: rest.nationality || null,
        rtRw: rest.rtRw || null,
        kelurahan: rest.kelurahan || null,
        kecamatan: rest.kecamatan || null,
        province: rest.province || null,
        city: rest.city || null,
        bloodType: rest.bloodType || null,
      }).returning();
      participant = p;
    } else {
      await db.update(participantsTable)
        .set({ fullName, ...rest, updatedAt: new Date() })
        .where(eq(participantsTable.id, participant.id));
    }

    const existing = await db.query.eventRegistrationsTable.findFirst({
      where: (t, { and: a, eq: e }) => a(e(t.eventId, event.id), e(t.participantId, participant!.id)),
    });

    if (existing) {
      if (isAttendance && !existing.checkedInAt) {
        await db.update(eventRegistrationsTable)
          .set({ checkedInAt: new Date() })
          .where(eq(eventRegistrationsTable.id, existing.id));
        return res.json({ success: true, message: "Absensi berhasil dicatat", alreadyRegistered: true, checkedIn: true });
      }
      return res.status(409).json({ error: "Sudah terdaftar di event ini" });
    }

    await db.insert(eventRegistrationsTable).values({
      eventId: event.id,
      participantId: participant.id,
      registrationType: regType,
      phone: phone || null,
      email: email || null,
      checkedInAt: isAttendance ? new Date() : null,
    });

    res.status(201).json({
      success: true,
      message: isAttendance ? "Absensi berhasil dicatat" : "Reservasi berhasil",
      nik,
      eventId: event.id,
      registrationToken: event.registrationToken,
    });
  } catch (err) {
    req.log.error({ err }, "Error public registration");
    res.status(500).json({ error: "Gagal mendaftar" });
  }
});

router.get("/public/reservation-qr/:eventToken/:nik", async (req, res) => {
  try {
    const { eventToken, nik } = req.params;
    const [event] = await db.select().from(eventsTable).where(eq(eventsTable.registrationToken, eventToken));
    if (!event) return res.status(404).json({ error: "Event tidak ditemukan" });

    const participant = await db.query.participantsTable.findFirst({
      where: eq(participantsTable.nik, nik),
    });
    if (!participant) return res.status(404).json({ error: "Peserta tidak ditemukan" });

    const registration = await db.query.eventRegistrationsTable.findFirst({
      where: (t, { and: a, eq: e }) => a(e(t.eventId, event.id), e(t.participantId, participant.id)),
    });
    if (!registration) return res.status(404).json({ error: "Peserta belum terdaftar" });

    const qrContent = `KTP-EVENT|${event.id}|${nik}`;
    const qrDataUrl = await QRCode.toDataURL(qrContent, { width: 400, margin: 2, errorCorrectionLevel: "H" });

    res.json({
      qrDataUrl,
      qrContent,
      eventName: event.name,
      fullName: participant.fullName,
      nik: participant.nik,
    });
  } catch (err) {
    req.log.error({ err }, "Error generating reservation QR");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
