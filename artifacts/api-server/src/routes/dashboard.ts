import { Router } from "express";
import { db } from "@workspace/db";
import { participantsTable, eventRegistrationsTable, eventsTable, prizeDistributionsTable, prizesTable, usersTable, adminAuditLogTable, programsTable, programRegistrationsTable } from "@workspace/db";
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

    // Total events: if daerah filter active, count only events that have at least 1 participant from that area
    let totalEvents: { count: number };
    if (participantConds.length > 0) {
      const subq = db
        .selectDistinct({ eventId: eventRegistrationsTable.eventId })
        .from(eventRegistrationsTable)
        .innerJoin(participantsTable, eq(eventRegistrationsTable.participantId, participantsTable.id))
        .where(and(...participantConds));
      [totalEvents] = await db
        .select({ count: sql<number>`cast(count(*) as integer)` })
        .from(subq.as("filtered_events"));
    } else {
      [totalEvents] = await db
        .select({ count: sql<number>`cast(count(*) as integer)` })
        .from(eventsTable);
    }

    // Total programs: if daerah filter active, count only programs that have at least 1 participant from that area
    let totalPrograms: { count: number };
    if (participantConds.length > 0) {
      const progSubq = db
        .selectDistinct({ programId: programRegistrationsTable.programId })
        .from(programRegistrationsTable)
        .innerJoin(participantsTable, eq(programRegistrationsTable.participantId, participantsTable.id))
        .where(and(...participantConds));
      [totalPrograms] = await db
        .select({ count: sql<number>`cast(count(*) as integer)` })
        .from(progSubq.as("filtered_programs"));
    } else {
      [totalPrograms] = await db
        .select({ count: sql<number>`cast(count(*) as integer)` })
        .from(programsTable);
    }

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
      totalPrograms: totalPrograms.count,
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

    // Age groups: handle mixed date formats (YYYY-MM-DD and DD-MM-YYYY)
    // Use a CTE to safely parse birthDate regardless of format
    const SAFE_DATE_CTE = `
      safe_date as (
        select id,
          case
            when birth_date is null or trim(birth_date) = '' then null
            when birth_date ~ '^\\d{4}-\\d{2}-\\d{2}$' then birth_date::date
            when birth_date ~ '^\\d{2}-\\d{2}-\\d{4}$' then to_date(birth_date, 'DD-MM-YYYY')
            else null
          end as parsed_date
        from participants
        where birth_date is not null and trim(birth_date) <> ''
      )
    `;
    const AGE_CASE_CTE = `
      case
        when parsed_date is null then 'unknown'
        when extract(year from age(parsed_date)) between 17 and 24 then '17-24'
        when extract(year from age(parsed_date)) between 25 and 34 then '25-34'
        when extract(year from age(parsed_date)) between 35 and 44 then '35-44'
        when extract(year from age(parsed_date)) between 45 and 54 then '45-54'
        when extract(year from age(parsed_date)) between 55 and 64 then '55-64'
        when extract(year from age(parsed_date)) > 64 then 'di atas 64'
        else 'unknown'
      end
    `;

    let ageRawRows: { age_group: string; count: number }[];
    if (needsDateOrDaerah) {
      // Build raw WHERE conditions for daerah (join with participants)
      const esc = (v: string) => v.replace(/'/g, "''");
      const rawConds: string[] = [`${AGE_CASE_CTE} <> 'unknown'`];
      if (startDate) rawConds.push(`er.registered_at >= '${esc(startDate)}'::timestamptz`);
      if (endDate) rawConds.push(`er.registered_at < ('${esc(endDate)}'::date + interval '1 day')::timestamptz`);
      if (kabupaten) rawConds.push(`p.city ilike '%${esc(kabupaten)}%'`);
      if (kecamatan) rawConds.push(`p.kecamatan ilike '%${esc(kecamatan)}%'`);
      if (kelurahan) rawConds.push(`p.kelurahan ilike '%${esc(kelurahan)}%'`);

      const needsParticipantJoin = kabupaten || kecamatan || kelurahan;
      const joinClause = needsParticipantJoin
        ? `inner join participants p on er.participant_id = p.id`
        : "";

      const result = await db.execute(sql.raw(`
        with ${SAFE_DATE_CTE}
        select ${AGE_CASE_CTE} as age_group, cast(count(distinct sd.id) as integer) as count
        from safe_date sd
        inner join event_registrations er on er.participant_id = sd.id
        ${joinClause}
        where ${rawConds.join(" and ")}
        group by 1
        order by min(extract(year from age(sd.parsed_date)))
      `));
      ageRawRows = result.rows as any[];
    } else {
      const result = await db.execute(sql.raw(`
        with ${SAFE_DATE_CTE}
        select ${AGE_CASE_CTE} as age_group, cast(count(*) as integer) as count
        from safe_date
        where ${AGE_CASE_CTE} <> 'unknown'
        group by 1
        order by min(extract(year from age(parsed_date)))
      `));
      ageRawRows = result.rows as any[];
    }

    const AGE_ORDER = ['17-24', '25-34', '35-44', '45-54', '55-64', 'di atas 64'];
    const ageGroups = ageRawRows
      .map(r => ({ ageGroup: r.age_group, count: Number(r.count) }))
      .sort((a, b) => AGE_ORDER.indexOf(a.ageGroup) - AGE_ORDER.indexOf(b.ageGroup));

    res.json({ gender, province, dow, ageGroups });
  } catch (err) {
    req.log.error({ err }, "Error getting segments");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/export", requireAdmin, async (req, res) => {
  try {
    const XLSX = await import("xlsx");
    const { startDate, endDate, kabupaten, kecamatan, kelurahan } = req.query as Record<string, string>;

    const participantConds: any[] = [];
    if (kabupaten) participantConds.push(ilike(participantsTable.city, `%${kabupaten}%`));
    if (kecamatan) participantConds.push(ilike(participantsTable.kecamatan, `%${kecamatan}%`));
    if (kelurahan) participantConds.push(ilike(participantsTable.kelurahan, `%${kelurahan}%`));

    const allRegConds: any[] = [...participantConds];
    if (startDate) allRegConds.push(gte(eventRegistrationsTable.registeredAt, new Date(startDate)));
    if (endDate) allRegConds.push(lte(eventRegistrationsTable.registeredAt, new Date(endDate)));

    // ── 1. Stats ─────────────────────────────────────────────────────────────
    const [[totalKtp], [totalKeg], [totalProg]] = await Promise.all([
      db.select({ count: sql<number>`cast(count(*) as integer)` }).from(participantsTable)
        .where(participantConds.length > 0 ? and(...participantConds) : undefined),
      participantConds.length > 0
        ? db.select({ count: sql<number>`cast(count(*) as integer)` })
            .from(db.selectDistinct({ eventId: eventRegistrationsTable.eventId })
              .from(eventRegistrationsTable)
              .innerJoin(participantsTable, eq(eventRegistrationsTable.participantId, participantsTable.id))
              .where(and(...participantConds)).as("ev"))
        : db.select({ count: sql<number>`cast(count(*) as integer)` }).from(eventsTable),
      participantConds.length > 0
        ? db.select({ count: sql<number>`cast(count(*) as integer)` })
            .from(db.selectDistinct({ programId: programRegistrationsTable.programId })
              .from(programRegistrationsTable)
              .innerJoin(participantsTable, eq(programRegistrationsTable.participantId, participantsTable.id))
              .where(and(...participantConds)).as("pr"))
        : db.select({ count: sql<number>`cast(count(*) as integer)` }).from(programsTable),
    ]);

    // ── 2. Gender ─────────────────────────────────────────────────────────────
    const genderRows = allRegConds.length > 0
      ? await db.select({ gender: participantsTable.gender, count: sql<number>`cast(count(distinct ${participantsTable.id}) as integer)` })
          .from(participantsTable)
          .innerJoin(eventRegistrationsTable, eq(eventRegistrationsTable.participantId, participantsTable.id))
          .where(and(...allRegConds))
          .groupBy(participantsTable.gender)
      : await db.select({ gender: participantsTable.gender, count: sql<number>`cast(count(*) as integer)` })
          .from(participantsTable).groupBy(participantsTable.gender);

    // ── 3. Age groups ─────────────────────────────────────────────────────────
    const esc = (v: string) => v.replace(/'/g, "''");
    const AGE_DATE_EXPR = `case when birth_date ~ '^\\d{4}-\\d{2}-\\d{2}$' then birth_date::date when birth_date ~ '^\\d{2}-\\d{2}-\\d{4}$' then to_date(birth_date,'DD-MM-YYYY') else null end`;
    const AGE_CASE = `case when extract(year from age(${AGE_DATE_EXPR})) between 17 and 24 then '17-24' when extract(year from age(${AGE_DATE_EXPR})) between 25 and 34 then '25-34' when extract(year from age(${AGE_DATE_EXPR})) between 35 and 44 then '35-44' when extract(year from age(${AGE_DATE_EXPR})) between 45 and 54 then '45-54' when extract(year from age(${AGE_DATE_EXPR})) between 55 and 64 then '55-64' when extract(year from age(${AGE_DATE_EXPR})) > 64 then 'di atas 64' else null end`;
    const rawAgeConds: string[] = [`birth_date is not null`, `trim(birth_date) <> ''`, `${AGE_CASE} is not null`];
    if (kabupaten) rawAgeConds.push(`city ilike '%${esc(kabupaten)}%'`);
    if (kecamatan) rawAgeConds.push(`kecamatan ilike '%${esc(kecamatan)}%'`);
    if (kelurahan) rawAgeConds.push(`kelurahan ilike '%${esc(kelurahan)}%'`);
    const ageResult = await db.execute(sql.raw(`select ${AGE_CASE} as age_group, cast(count(*) as integer) as count from participants where ${rawAgeConds.join(" and ")} group by 1 order by min(extract(year from age(${AGE_DATE_EXPR})))`));
    const AGE_ORDER = ['17-24', '25-34', '35-44', '45-54', '55-64', 'di atas 64'];
    const ageRows = (ageResult.rows as any[]).sort((a, b) => AGE_ORDER.indexOf(a.age_group) - AGE_ORDER.indexOf(b.age_group));

    // ── 4. Recent events (filtered by location) ───────────────────────────────
    const eventLocConds: any[] = [];
    if (kabupaten) eventLocConds.push(ilike(eventsTable.location, `%${kabupaten}%`));
    if (kecamatan) eventLocConds.push(ilike(eventsTable.location, `%${kecamatan}%`));
    if (kelurahan) eventLocConds.push(ilike(eventsTable.location, `%${kelurahan}%`));

    const recentEvents = await db
      .select({ id: eventsTable.id, name: eventsTable.name, category: eventsTable.category, location: eventsTable.location, eventDate: eventsTable.eventDate, status: eventsTable.status, participantCount: sql<number>`cast(count(${eventRegistrationsTable.id}) as integer)` })
      .from(eventsTable)
      .leftJoin(eventRegistrationsTable, eq(eventsTable.id, eventRegistrationsTable.eventId))
      .where(eventLocConds.length > 0 ? and(...eventLocConds) : undefined)
      .groupBy(eventsTable.id)
      .orderBy(sql`${eventsTable.createdAt} desc`)
      .limit(10);

    // ── 5. Recent programs (filtered by kabupatenPenerima) ────────────────────
    const programLocConds: any[] = [];
    if (kabupaten) programLocConds.push(ilike(programsTable.kabupatenPenerima, `%${kabupaten}%`));
    if (kecamatan) programLocConds.push(ilike(programsTable.kabupatenPenerima, `%${kecamatan}%`));
    if (kelurahan) programLocConds.push(ilike(programsTable.kabupatenPenerima, `%${kelurahan}%`));

    const recentPrograms = await db
      .select({ id: programsTable.id, name: programsTable.name, komisi: programsTable.komisi, mitra: programsTable.mitra, tahun: programsTable.tahun, totalKtpPenerima: programsTable.totalKtpPenerima, kabupatenPenerima: programsTable.kabupatenPenerima, registeredCount: programsTable.registeredCount, status: programsTable.status })
      .from(programsTable)
      .where(programLocConds.length > 0 ? and(...programLocConds) : undefined)
      .orderBy(sql`${programsTable.createdAt} desc`)
      .limit(10);

    // ── Build workbook ────────────────────────────────────────────────────────
    const wb = XLSX.utils.book_new();
    const dateStr = new Date().toLocaleDateString("id-ID");

    // Sheet 1: Ringkasan
    const summaryData = [
      ["LAPORAN DASHBOARD KTP", "", `Tanggal: ${dateStr}`],
      [],
      ["RINGKASAN STATISTIK"],
      ["Metrik", "Nilai"],
      ["Total KTP Terdaftar", totalKtp.count],
      ["Total Kegiatan", totalKeg.count],
      ["Total Program", totalProg.count],
      [],
      ["JENIS KELAMIN"],
      ["Jenis Kelamin", "Jumlah", "Persentase"],
      ...genderRows.map(r => {
        const total = genderRows.reduce((s, x) => s + x.count, 0);
        const pct = total > 0 ? ((r.count / total) * 100).toFixed(1) + "%" : "0%";
        const label = r.gender === "LAKI-LAKI" ? "Laki-laki" : r.gender === "PEREMPUAN" ? "Perempuan" : r.gender ?? "Lainnya";
        return [label, r.count, pct];
      }),
      [],
      ["KELOMPOK USIA"],
      ["Kelompok", "Jumlah", "Persentase"],
      ...ageRows.map((r: any) => {
        const total = ageRows.reduce((s: number, x: any) => s + Number(x.count), 0);
        const pct = total > 0 ? ((Number(r.count) / total) * 100).toFixed(1) + "%" : "0%";
        return [r.age_group, Number(r.count), pct];
      }),
    ];
    const ws1 = XLSX.utils.aoa_to_sheet(summaryData);
    ws1["!cols"] = [{ wch: 28 }, { wch: 12 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, ws1, "Ringkasan");

    // Sheet 2: Kegiatan Terbaru
    const eventData = [
      ["KEGIATAN TERBARU"],
      ["No", "Nama Kegiatan", "Kategori", "Lokasi", "Tanggal", "Status", "Peserta"],
      ...recentEvents.map((e, i) => [i + 1, e.name, e.category ?? "", e.location ?? "", e.eventDate ?? "", e.status ?? "", e.participantCount]),
    ];
    const ws2 = XLSX.utils.aoa_to_sheet(eventData);
    ws2["!cols"] = [{ wch: 4 }, { wch: 35 }, { wch: 15 }, { wch: 25 }, { wch: 14 }, { wch: 12 }, { wch: 8 }];
    XLSX.utils.book_append_sheet(wb, ws2, "Kegiatan Terbaru");

    // Sheet 3: Program Terbaru
    const programData = [
      ["PROGRAM TERBARU"],
      ["No", "Nama Program", "Komisi", "Mitra", "Tahun", "Kabupaten Penerima", "Status", "Kuota KTP", "Terdaftar"],
      ...recentPrograms.map((p, i) => [i + 1, p.name, p.komisi ?? "", p.mitra ?? "", p.tahun ?? "", p.kabupatenPenerima ?? "", p.status, p.totalKtpPenerima ?? "", p.registeredCount]),
    ];
    const ws3 = XLSX.utils.aoa_to_sheet(programData);
    ws3["!cols"] = [{ wch: 4 }, { wch: 35 }, { wch: 12 }, { wch: 20 }, { wch: 8 }, { wch: 22 }, { wch: 12 }, { wch: 10 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, ws3, "Program Terbaru");

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    const filename = `dashboard-ktp-${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buf);
  } catch (err) {
    req.log.error({ err }, "Error exporting XLSX");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/recent", requireAdmin, async (req, res) => {
  try {
    const { kabupaten, kecamatan, kelurahan } = req.query as Record<string, string>;
    const limit = 5;

    // Events filtered by location text matching daerah filter
    const eventConds: any[] = [];
    if (kabupaten) eventConds.push(ilike(eventsTable.location, `%${kabupaten}%`));
    if (kecamatan) eventConds.push(ilike(eventsTable.location, `%${kecamatan}%`));
    if (kelurahan) eventConds.push(ilike(eventsTable.location, `%${kelurahan}%`));

    const recentEvents = await db
      .select({
        id: eventsTable.id,
        name: eventsTable.name,
        category: eventsTable.category,
        location: eventsTable.location,
        eventDate: eventsTable.eventDate,
        status: eventsTable.status,
        participantCount: sql<number>`cast(count(${eventRegistrationsTable.id}) as integer)`,
      })
      .from(eventsTable)
      .leftJoin(eventRegistrationsTable, eq(eventsTable.id, eventRegistrationsTable.eventId))
      .where(eventConds.length > 0 ? and(...eventConds) : undefined)
      .groupBy(eventsTable.id)
      .orderBy(sql`${eventsTable.createdAt} desc`)
      .limit(limit);

    // Programs filtered by kabupatenPenerima matching daerah filter
    const programConds: any[] = [];
    if (kabupaten) programConds.push(ilike(programsTable.kabupatenPenerima, `%${kabupaten}%`));
    if (kecamatan) programConds.push(ilike(programsTable.kabupatenPenerima, `%${kecamatan}%`));
    if (kelurahan) programConds.push(ilike(programsTable.kabupatenPenerima, `%${kelurahan}%`));

    const recentPrograms = await db
      .select({
        id: programsTable.id,
        name: programsTable.name,
        komisi: programsTable.komisi,
        mitra: programsTable.mitra,
        tahun: programsTable.tahun,
        totalKtpPenerima: programsTable.totalKtpPenerima,
        registeredCount: programsTable.registeredCount,
        status: programsTable.status,
      })
      .from(programsTable)
      .where(programConds.length > 0 ? and(...programConds) : undefined)
      .orderBy(sql`${programsTable.createdAt} desc`)
      .limit(limit);

    res.json({ recentEvents, recentPrograms });
  } catch (err) {
    req.log.error({ err }, "Error getting recent data");
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
