import { pgTable, text, serial, timestamp, integer, unique, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("petugas"),
  name: text("name").notNull(),
  jabatan: text("jabatan"),
  wilayah: text("wilayah"),
  phone: text("phone"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const participantsTable = pgTable("participants", {
  id: serial("id").primaryKey(),
  nik: text("nik").notNull().unique(),
  fullName: text("full_name").notNull(),
  address: text("address"),
  birthPlace: text("birth_place"),
  birthDate: text("birth_date"),
  gender: text("gender"),
  religion: text("religion"),
  maritalStatus: text("marital_status"),
  occupation: text("occupation"),
  nationality: text("nationality"),
  rtRw: text("rt_rw"),
  kelurahan: text("kelurahan"),
  kecamatan: text("kecamatan"),
  province: text("province"),
  city: text("city"),
  bloodType: text("blood_type"),
  ktpImagePath: text("ktp_image_path"),
  phone: text("phone"),
  email: text("email"),
  socialStatus: text("social_status"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const eventsTable = pgTable("events", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  category: text("category"),
  location: text("location"),
  eventDate: text("event_date").notNull(),
  startTime: text("start_time"),
  endTime: text("end_time"),
  targetParticipants: integer("target_participants"),
  isRsvp: boolean("is_rsvp").default(false),
  status: text("status").default("active"),
  registrationToken: text("registration_token").unique(),
  attendanceToken: text("attendance_token").unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const eventRegistrationsTable = pgTable(
  "event_registrations",
  {
    id: serial("id").primaryKey(),
    eventId: integer("event_id").notNull().references(() => eventsTable.id, { onDelete: "cascade" }),
    participantId: integer("participant_id").notNull().references(() => participantsTable.id, { onDelete: "cascade" }),
    staffName: text("staff_name"),
    staffId: integer("staff_id").references(() => usersTable.id),
    phone: text("phone"),
    email: text("email"),
    notes: text("notes"),
    tags: text("tags"),
    registrationType: text("registration_type").default("onsite"),
    registeredAt: timestamp("registered_at").defaultNow().notNull(),
    checkedInAt: timestamp("checked_in_at"),
  },
  (t) => [unique("uq_event_participant").on(t.eventId, t.participantId)]
);

export const prizesTable = pgTable("prizes", {
  id: serial("id").primaryKey(),
  eventId: integer("event_id").references(() => eventsTable.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  description: text("description"),
  quantity: integer("quantity").notNull().default(1),
  distributedCount: integer("distributed_count").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const prizeDistributionsTable = pgTable("prize_distributions", {
  id: serial("id").primaryKey(),
  prizeId: integer("prize_id").notNull().references(() => prizesTable.id, { onDelete: "cascade" }),
  participantId: integer("participant_id").notNull().references(() => participantsTable.id, { onDelete: "cascade" }),
  distributedBy: text("distributed_by"),
  distributedAt: timestamp("distributed_at").defaultNow().notNull(),
  notes: text("notes"),
});

export const adminAuditLogTable = pgTable("admin_audit_log", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => usersTable.id),
  userName: text("user_name"),
  action: text("action").notNull(),
  participantNik: text("participant_nik"),
  participantName: text("participant_name"),
  details: text("details"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;

export const insertParticipantSchema = createInsertSchema(participantsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertParticipant = z.infer<typeof insertParticipantSchema>;
export type Participant = typeof participantsTable.$inferSelect;

export const insertEventSchema = createInsertSchema(eventsTable).omit({ id: true, createdAt: true });
export type InsertEvent = z.infer<typeof insertEventSchema>;
export type Event = typeof eventsTable.$inferSelect;

export const insertEventRegistrationSchema = createInsertSchema(eventRegistrationsTable).omit({ id: true, registeredAt: true });
export type InsertEventRegistration = z.infer<typeof insertEventRegistrationSchema>;
export type EventRegistration = typeof eventRegistrationsTable.$inferSelect;

export const insertPrizeSchema = createInsertSchema(prizesTable).omit({ id: true, createdAt: true, distributedCount: true });
export type InsertPrize = z.infer<typeof insertPrizeSchema>;
export type Prize = typeof prizesTable.$inferSelect;

export const insertPrizeDistributionSchema = createInsertSchema(prizeDistributionsTable).omit({ id: true, distributedAt: true });
export type InsertPrizeDistribution = z.infer<typeof insertPrizeDistributionSchema>;
export type PrizeDistribution = typeof prizeDistributionsTable.$inferSelect;
