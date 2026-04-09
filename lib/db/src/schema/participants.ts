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
