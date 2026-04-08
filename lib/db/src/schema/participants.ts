import { pgTable, text, serial, timestamp, integer, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

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
  location: text("location"),
  eventDate: text("event_date").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const eventRegistrationsTable = pgTable(
  "event_registrations",
  {
    id: serial("id").primaryKey(),
    eventId: integer("event_id").notNull().references(() => eventsTable.id, { onDelete: "cascade" }),
    participantId: integer("participant_id").notNull().references(() => participantsTable.id, { onDelete: "cascade" }),
    registeredAt: timestamp("registered_at").defaultNow().notNull(),
  },
  (t) => [unique("uq_event_participant").on(t.eventId, t.participantId)]
);

export const insertParticipantSchema = createInsertSchema(participantsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertParticipant = z.infer<typeof insertParticipantSchema>;
export type Participant = typeof participantsTable.$inferSelect;

export const insertEventSchema = createInsertSchema(eventsTable).omit({ id: true, createdAt: true });
export type InsertEvent = z.infer<typeof insertEventSchema>;
export type Event = typeof eventsTable.$inferSelect;

export const insertEventRegistrationSchema = createInsertSchema(eventRegistrationsTable).omit({ id: true, registeredAt: true });
export type InsertEventRegistration = z.infer<typeof insertEventRegistrationSchema>;
export type EventRegistration = typeof eventRegistrationsTable.$inferSelect;
