import { Router } from "express";
import { db } from "@workspace/db";
import { participantsTable, eventRegistrationsTable, eventsTable, prizeDistributionsTable, prizesTable, usersTable, adminAuditLogTable } from "@workspace/db";
import { eq, sql, and, gte, lte, ilike } from "drizzle-orm";
import { GetDashboardStatsQueryParams, GetEventsSummaryQueryParams, GetDailyRegistrationsQueryParams } from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/auth";

const router = Router();

router.get("/stats", requireAdmin, async (req, res) => {
  try {
    const query = GetDashboardStatsQueryParams.safeParse(req.query);
    const { startDate, endDate } = query.success ? query.data : {};
    const { kabupaten, kecamatan, kelurahan } = req.query as Record<string, string>;

    const participantConds: any[] = [];
    if (kabupaten) participantConds.push(ilike(participantsTable.city, `%${kabupaten}%`));
    if (kecamatan) participantConds.push(ilike(participantsTable.kecamatan, `%${kecamatan}%`));
    if (kelurahan) participantConds.push(ilike(participantsTable.kelurahan, `%${kelurahan}%`));

    const [totalParticipants] = await db
      .select({ count: sql<number>`cast(count(*) as integer)` })
      .from(participantsTable)
      .where(participantConds.length > 0 ? and(...participantConds) : undefined);

    const [totalEvents] = await db
      .select({ count: sql<number>`cast(count(*) as integer)` })
      .from(eventsTable);

    let regConditions: any[] = [...participantConds.map(() => null)]; // placeholder
    regConditions = [];
    if (startDate) regConditions.push(gte(eventRegistrationsTable.registeredAt, new Date(startDate)));
    if (endDate) regConditions.push(lte(eventRegistrationsTable.registeredAt, new Date(endDate)));
    const allRegConds = [...regConditions, ...participantConds.map((c: any) => c)];

    // For daerah-filtered reg, join with participants
    const regBase = db
      .select({ count: sql<number>`cast(count(*) as integer)` })
      .from(eventRegistrationsTable)
      .leftJoin(participantsTable, eq(eventRegistrationsTable.participantId, participantsTable.id));

    const allRegCondsFiltered: any[] = [];
    if (startDate) allRegCondsFiltered.push(gte(eventRegistrationsTable.registeredAt, new Date(startDate)));
    if (endDate) allRegCondsFiltered.push(lte(eventRegistrationsTable.registeredAt, new Date(endDate)));
    if (kabupaten) allRegCondsFiltered.push(ilike(participantsTable.city, `%${kabupaten}%`));
    if (kecamatan) allRegCondsFiltered.push(ilike(participantsTable.kecamatan, `%${kecamatan}%`));
    if (kelurahan) allRegCondsFiltered.push(ilike(participantsTable.kelurahan, `%${kelurahan}%`));

    const [totalRegistrations] = await regBase.where(allRegCondsFiltered.length > 0 ? and(...allRegCondsFiltered) : undefined);

    const [multiEventParticipants] = await db
      .select({ count: sql<number>`cast(count(*) as integer)` })
      .from(
        db
          .select({
            participantId: eventRegistrationsTable.participantId,
            cnt: sql<number>`count(*)`,
          })
          .from(eventRegistrationsTable)
          .groupBy(eventRegistrationsTable.participantId)
          .having(sql`count(*) > 1`)
          .as("multi")
      );

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const [recentRegistrations] = await db
      .select({ count: sql<number>`cast(count(*) as integer)` })
      .from(eventRegistrationsTable)
      .where(gte(eventRegistrationsTable.registeredAt, sevenDaysAgo));

    // Previous 7-day window for % change
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
    const [prevWeekRegistrations] = await db
      .select({ count: sql<number>`cast(count(*) as integer)` })
      .from(eventRegistrationsTable)
      .where(
        and(
          gte(eventRegistrationsTable.registeredAt, fourteenDaysAgo),
          lte(eventRegistrationsTable.registeredAt, sevenDaysAgo)
        )
      );

    const [totalPrizesDistributed] = await db
      .select({ count: sql<number>`cast(count(*) as integer)` })
      .from(prizeDistributionsTable);

    res.json({
      totalParticipants: totalParticipants.count,
      totalEvents: totalEvents.count,
      totalRegistrations: totalRegistrations.count,
      multiEventParticipants: multiEventParticipants.count,
      recentRegistrations: recentRegistrations.count,
      prevWeekRegistrations: prevWeekRegistrations.count,
      totalPrizesDistributed: totalPrizesDistributed.count,
    });
  } catch (err) {
    req.log.error({ err }, "Error getting dashboard stats");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/events-summary", requireAdmin, async (req, res) => {
  try {
    const query = GetEventsSummaryQueryParams.safeParse(req.query);
    const { startDate, endDate } = query.success ? query.data : {};
    const { kabupaten, kecamatan, kelurahan } = req.query as Record<string, string>;

    let conditions: any[] = [];
    if (startDate) conditions.push(gte(eventsTable.eventDate, startDate));
    if (endDate) conditions.push(lte(eventsTable.eventDate, endDate));
    if (kabupaten) conditions.push(sql`exists (select 1 from ${eventRegistrationsTable} er2 join ${participantsTable} p2 on er2.participant_id = p2.id where er2.event_id = ${eventsTable.id} and p2.city ilike ${"%" + kabupaten + "%"})`);
    if (kecamatan) conditions.push(sql`exists (select 1 from ${eventRegistrationsTable} er2 join ${participantsTable} p2 on er2.participant_id = p2.id where er2.event_id = ${eventsTable.id} and p2.kecamatan ilike ${"%" + kecamatan + "%"})`);
    if (kelurahan) conditions.push(sql`exists (select 1 from ${eventRegistrationsTable} er2 join ${participantsTable} p2 on er2.participant_id = p2.id where er2.event_id = ${eventsTable.id} and p2.kelurahan ilike ${"%" + kelurahan + "%"})`);

    const events = await db
      .select({
        id: eventsTable.id,
        name: eventsTable.name,
        eventDate: eventsTable.eventDate,
        location: eventsTable.location,
        participantCount: sql<number>`cast(count(${eventRegistrationsTable.id}) as integer)`,
      })
      .from(eventsTable)
      .leftJoin(eventRegistrationsTable, eq(eventsTable.id, eventRegistrationsTable.eventId))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .groupBy(eventsTable.id)
      .orderBy(sql`count(${eventRegistrationsTable.id}) desc`);

    res.json(events);
  } catch (err) {
    req.log.error({ err }, "Error getting events summary");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/daily-registrations", requireAdmin, async (req, res) => {
  try {
    const query = GetDailyRegistrationsQueryParams.safeParse(req.query);
    const { startDate, endDate } = query.success ? query.data : {};

    let conditions: any[] = [];
    if (startDate) conditions.push(gte(eventRegistrationsTable.registeredAt, new Date(startDate)));
    if (endDate) conditions.push(lte(eventRegistrationsTable.registeredAt, new Date(endDate)));

    const daily = await db
      .select({
        date: sql<string>`to_char(date_trunc('day', ${eventRegistrationsTable.registeredAt}), 'YYYY-MM-DD')`,
        count: sql<number>`cast(count(*) as integer)`,
      })
      .from(eventRegistrationsTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .groupBy(sql`date_trunc('day', ${eventRegistrationsTable.registeredAt})`)
      .orderBy(sql`date_trunc('day', ${eventRegistrationsTable.registeredAt})`);

    res.json(daily);
  } catch (err) {
    req.log.error({ err }, "Error getting daily registrations");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/multi-event-participants", requireAdmin, async (req, res) => {
  try {
    const result = await db
      .select({
        nik: participantsTable.nik,
        fullName: participantsTable.fullName,
        eventCount: sql<number>`cast(count(${eventRegistrationsTable.id}) as integer)`,
      })
      .from(participantsTable)
      .innerJoin(eventRegistrationsTable, eq(participantsTable.id, eventRegistrationsTable.participantId))
      .groupBy(participantsTable.id)
      .having(sql`count(${eventRegistrationsTable.id}) > 1`)
      .orderBy(sql`count(${eventRegistrationsTable.id}) desc`);

    const enriched = await Promise.all(
      result.map(async (p) => {
        const events = await db
          .select({ name: eventsTable.name })
          .from(eventRegistrationsTable)
          .innerJoin(eventsTable, eq(eventRegistrationsTable.eventId, eventsTable.id))
          .innerJoin(participantsTable, eq(eventRegistrationsTable.participantId, participantsTable.id))
          .where(eq(participantsTable.nik, p.nik));
        return { ...p, events: events.map((e) => e.name) };
      })
    );

    res.json(enriched);
  } catch (err) {
    req.log.error({ err }, "Error getting multi-event participants");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Top prizes by distributed count
router.get("/top-prizes", requireAdmin, async (req, res) => {
  try {
    const data = await db
      .select({
        id: prizesTable.id,
        name: prizesTable.name,
        eventName: eventsTable.name,
        quantity: prizesTable.quantity,
        distributedCount: prizesTable.distributedCount,
      })
      .from(prizesTable)
      .leftJoin(eventsTable, eq(prizesTable.eventId, eventsTable.id))
      .orderBy(sql`${prizesTable.distributedCount} desc`)
      .limit(8);
    res.json(data);
  } catch (err) {
    req.log.error({ err }, "Error getting top prizes");
    res.status(500).json({ error: "Internal server error" });
  }
});

// All staff with detailed stats
router.get("/staff", requireAdmin, async (req, res) => {
  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // Main stats per staffId
    const staffRows = await db
      .select({
        staffId: eventRegistrationsTable.staffId,
        staffName: usersTable.name,
        totalInput: sql<number>`cast(count(*) as integer)`,
        totalEvent: sql<number>`cast(count(distinct ${eventRegistrationsTable.eventId}) as integer)`,
        recentInput: sql<number>`cast(sum(case when ${eventRegistrationsTable.registeredAt} >= ${sevenDaysAgo.toISOString()} then 1 else 0 end) as integer)`,
        lastActivity: sql<string>`max(${eventRegistrationsTable.registeredAt})`,
      })
      .from(eventRegistrationsTable)
      .innerJoin(usersTable, eq(eventRegistrationsTable.staffId, usersTable.id))
      .where(sql`${eventRegistrationsTable.staffId} is not null`)
      .groupBy(eventRegistrationsTable.staffId, usersTable.name)
      .orderBy(sql`count(*) desc`);

    // Events breakdown per staffId
    const eventsRows = await db
      .select({
        staffId: eventRegistrationsTable.staffId,
        eventName: eventsTable.name,
        count: sql<number>`cast(count(*) as integer)`,
      })
      .from(eventRegistrationsTable)
      .innerJoin(eventsTable, eq(eventRegistrationsTable.eventId, eventsTable.id))
      .where(sql`${eventRegistrationsTable.staffId} is not null`)
      .groupBy(eventRegistrationsTable.staffId, eventsTable.name)
      .orderBy(sql`count(*) desc`);

    // Merge events into staff rows
    const result = staffRows.map((s) => ({
      ...s,
      events: eventsRows
        .filter((e) => e.staffId === s.staffId)
        .map((e) => ({ eventName: e.eventName, count: e.count })),
    }));

    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Error getting staff list");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Top staff by registration count
router.get("/top-staff", requireAdmin, async (req, res) => {
  try {
    const { startDate, endDate, kabupaten, kecamatan, kelurahan } = req.query as Record<string, string>;

    const conds: any[] = [sql`${eventRegistrationsTable.staffName} is not null`];
    if (startDate) conds.push(gte(eventRegistrationsTable.registeredAt, new Date(startDate)));
    if (endDate) conds.push(lte(eventRegistrationsTable.registeredAt, new Date(endDate)));

    const needsDaerah = kabupaten || kecamatan || kelurahan;
    const base = needsDaerah
      ? db
          .select({ staffName: eventRegistrationsTable.staffName, count: sql<number>`cast(count(*) as integer)` })
          .from(eventRegistrationsTable)
          .leftJoin(participantsTable, eq(eventRegistrationsTable.participantId, participantsTable.id))
      : db
          .select({ staffName: eventRegistrationsTable.staffName, count: sql<number>`cast(count(*) as integer)` })
          .from(eventRegistrationsTable);

    if (kabupaten) conds.push(ilike(participantsTable.city, `%${kabupaten}%`));
    if (kecamatan) conds.push(ilike(participantsTable.kecamatan, `%${kecamatan}%`));
    if (kelurahan) conds.push(ilike(participantsTable.kelurahan, `%${kelurahan}%`));

    const result = await (base as any)
      .where(and(...conds))
      .groupBy(eventRegistrationsTable.staffName)
      .orderBy(sql`count(*) desc`)
      .limit(10);

    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Error getting top staff");
    res.status(500).json({ error: "Internal server error" });
  }
});

// New: gender + province breakdown
router.get("/segments", requireAdmin, async (req, res) => {
  try {
    const { startDate, endDate, kabupaten, kecamatan, kelurahan } = req.query as Record<string, string>;
    const needsDateOrDaerah = startDate || endDate || kabupaten || kecamatan || kelurahan;

    // Build conditions for filtering via event_registrations join
    const regJoinConds: any[] = [];
    if (startDate) regJoinConds.push(gte(eventRegistrationsTable.registeredAt, new Date(startDate)));
    if (endDate) regJoinConds.push(lte(eventRegistrationsTable.registeredAt, new Date(endDate)));

    const daerahConds: any[] = [];
    if (kabupaten) daerahConds.push(ilike(participantsTable.city, `%${kabupaten}%`));
    if (kecamatan) daerahConds.push(ilike(participantsTable.kecamatan, `%${kecamatan}%`));
    if (kelurahan) daerahConds.push(ilike(participantsTable.kelurahan, `%${kelurahan}%`));

    // Gender: when date/daerah filter active, use inner join to event_registrations
    let gender: { gender: string; count: number }[];
    if (needsDateOrDaerah) {
      const allConds = [...regJoinConds, ...daerahConds];
      const rows = await db
        .select({ gender: participantsTable.gender, count: sql<number>`cast(count(distinct ${participantsTable.id}) as integer)` })
        .from(participantsTable)
        .innerJoin(eventRegistrationsTable, eq(eventRegistrationsTable.participantId, participantsTable.id))
        .where(allConds.length > 0 ? and(...allConds) : undefined)
        .groupBy(participantsTable.gender)
        .orderBy(sql`count(distinct ${participantsTable.id}) desc`);
      gender = rows;
    } else {
      gender = await db
        .select({ gender: participantsTable.gender, count: sql<number>`cast(count(*) as integer)` })
        .from(participantsTable)
        .groupBy(participantsTable.gender)
        .orderBy(sql`count(*) desc`);
    }

    // Province: filter by daerah only (province breakdown of participants in that area)
    const province = await db
      .select({ province: participantsTable.province, count: sql<number>`cast(count(*) as integer)` })
      .from(participantsTable)
      .where(daerahConds.length > 0 ? and(...daerahConds) : undefined)
      .groupBy(participantsTable.province)
      .orderBy(sql`count(*) desc`)
      .limit(5);

    // DOW: filter by date + daerah on registrations
    const dowConds = [...regJoinConds, ...daerahConds];
    const dow = daerahConds.length > 0
      ? await db
          .select({ dow: sql<number>`cast(extract(dow from ${eventRegistrationsTable.registeredAt}) as integer)`, count: sql<number>`cast(count(*) as integer)` })
          .from(eventRegistrationsTable)
          .leftJoin(participantsTable, eq(eventRegistrationsTable.participantId, participantsTable.id))
          .where(dowConds.length > 0 ? and(...dowConds) : undefined)
          .groupBy(sql`extract(dow from ${eventRegistrationsTable.registeredAt})`)
          .orderBy(sql`extract(dow from ${eventRegistrationsTable.registeredAt})`)
      : await db
          .select({ dow: sql<number>`cast(extract(dow from ${eventRegistrationsTable.registeredAt}) as integer)`, count: sql<number>`cast(count(*) as integer)` })
          .from(eventRegistrationsTable)
          .where(regJoinConds.length > 0 ? and(...regJoinConds) : undefined)
          .groupBy(sql`extract(dow from ${eventRegistrationsTable.registeredAt})`)
          .orderBy(sql`extract(dow from ${eventRegistrationsTable.registeredAt})`);

    res.json({ gender, province, dow });
  } catch (err) {
    req.log.error({ err }, "Error getting segments");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/activity-log", requireAdmin, async (req, res) => {
  try {
    const limit = Math.min(parseInt((req.query.limit as string) || "100"), 200);

    const regRows = await db
      .select({
        id: eventRegistrationsTable.id,
        staffId: eventRegistrationsTable.staffId,
        staffName: eventRegistrationsTable.staffName,
        participantName: participantsTable.fullName,
        participantNik: participantsTable.nik,
        eventName: eventsTable.name,
        registeredAt: eventRegistrationsTable.registeredAt,
        checkedInAt: eventRegistrationsTable.checkedInAt,
        registrationType: eventRegistrationsTable.registrationType,
        action: sql<string | null>`null`,
        adminName: sql<string | null>`null`,
        details: sql<string | null>`null`,
        logType: sql<string>`'registration'`,
      })
      .from(eventRegistrationsTable)
      .innerJoin(participantsTable, eq(eventRegistrationsTable.participantId, participantsTable.id))
      .innerJoin(eventsTable, eq(eventRegistrationsTable.eventId, eventsTable.id))
      .where(sql`${eventRegistrationsTable.staffId} IS NOT NULL`);

    const auditRows = await db
      .select({
        id: adminAuditLogTable.id,
        staffId: adminAuditLogTable.userId,
        staffName: sql<string | null>`null`,
        participantName: adminAuditLogTable.participantName,
        participantNik: adminAuditLogTable.participantNik,
        eventName: sql<string | null>`null`,
        registeredAt: adminAuditLogTable.createdAt,
        checkedInAt: sql<Date | null>`null`,
        registrationType: sql<string | null>`null`,
        action: adminAuditLogTable.action,
        adminName: adminAuditLogTable.userName,
        details: adminAuditLogTable.details,
        logType: sql<string>`'admin'`,
      })
      .from(adminAuditLogTable);

    const combined = [...regRows, ...auditRows].sort((a, b) => {
      const ta = new Date(a.checkedInAt ?? a.registeredAt).getTime();
      const tb = new Date(b.checkedInAt ?? b.registeredAt).getTime();
      return tb - ta;
    }).slice(0, limit);

    res.json(combined);
  } catch (err) {
    req.log.error({ err }, "Error getting activity log");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
