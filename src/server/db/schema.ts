// Mirrors docs/04-RBAC-DATA-MODEL.md §4. SQL column names follow the doc; TS property names
// follow Auth.js adapter conventions (emailVerified, sessionToken, userId, ...) for T020.
import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  check,
  customType,
  date,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
  vector,
} from "drizzle-orm/pg-core";

const bytea = customType<{ data: Uint8Array; driverData: Uint8Array }>({
  dataType: () => "bytea",
});

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());
const timestamps = () => ({ createdAt: createdAt(), updatedAt: updatedAt() });
const tstz = (name: string) => timestamp(name, { withTimezone: true });
const userRef = (name = "user_id") =>
  uuid(name)
    .notNull()
    .references(() => users.id, { onDelete: "cascade" });

export const roleEnum = pgEnum("role", ["OWNER", "MEMBER"]);

export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  emailVerified: tstz("email_verified_at"),
  passwordHash: text("password_hash"), // null for Google-only accounts
  name: text("display_name").notNull(),
  role: roleEnum("role").notNull().default("MEMBER"),
  timeZone: text("time_zone").notNull().default("Asia/Kolkata"),
  disabled: boolean("disabled").notNull().default(false),
  ...timestamps(),
});

// Auth.js OAuth link table
export const accounts = pgTable(
  "accounts",
  {
    userId: userRef(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    ...timestamps(),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
);

export const sessions = pgTable(
  "sessions",
  {
    id: id(),
    userId: userRef(),
    sessionToken: text("session_token").notNull().unique(),
    expires: tstz("expires").notNull(),
    ...timestamps(),
  },
  (t) => [index("sessions_user_id_idx").on(t.userId)],
);

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: tstz("expires").notNull(),
    ...timestamps(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);

export const invites = pgTable("invites", {
  id: id(),
  tokenHash: text("token_hash").notNull().unique(), // store hash, never the raw token
  email: text("email"), // lowercased; when set the invite only works for this address (null = legacy open link)
  createdBy: uuid("created_by").references(() => users.id),
  expiresAt: tstz("expires_at").notNull(),
  usedAt: tstz("used_at"),
  usedBy: uuid("used_by").references(() => users.id),
  revokedAt: tstz("revoked_at"),
  ...timestamps(),
});

export const profiles = pgTable("profiles", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  bio: text("bio"),
  avatarPhotoId: uuid("avatar_photo_id"), // no FK on purpose: photos reference users, avoids a cycle
  ...timestamps(),
});

export const profilePhotos = pgTable(
  "profile_photos",
  {
    id: id(),
    userId: userRef(),
    mime: text("mime").notNull().default("image/webp"),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    bytes: bytea("bytes").notNull(), // <= 300 KB
    ...timestamps(),
  },
  (t) => [
    index("profile_photos_user_id_idx").on(t.userId),
    check("profile_photos_max_300kb", sql`octet_length(${t.bytes}) <= 307200`),
  ],
);

// PRIVATE: visible to the owner and the member only. Never join into public projections.
export const bodyMetrics = pgTable(
  "body_metrics",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    weightKg: numeric("weight_kg", { precision: 5, scale: 2 }),
    heightCm: numeric("height_cm", { precision: 5, scale: 1 }),
    proteinMultiplier: numeric("protein_multiplier", { precision: 3, scale: 2 }).notNull().default("1.20"),
    waterTargetL: numeric("water_target_l", { precision: 3, scale: 1 }).notNull().default("3.0"),
    runTargetKm: numeric("run_target_km", { precision: 4, scale: 1 }).notNull().default("5.0"),
    studyMinTarget: integer("study_min_target").notNull().default(60),
    ...timestamps(),
  },
  (t) => [check("body_metrics_study_min_target_range", sql`${t.studyMinTarget} BETWEEN 60 AND 90`)],
);

// The 75 Hard program per user
export const commitments = pgTable(
  "commitments",
  {
    id: id(),
    userId: userRef(),
    name: text("name").notNull().default("75 Hard"),
    startDate: date("start_date").notNull(),
    totalDays: integer("total_days").notNull().default(75),
    active: boolean("active").notNull().default(true),
    ...timestamps(),
  },
  (t) => [index("commitments_user_id_idx").on(t.userId)],
);

// One row per user per day
export const dailyLogs = pgTable(
  "daily_logs",
  {
    id: id(),
    userId: userRef(),
    commitmentId: uuid("commitment_id")
      .notNull()
      .references(() => commitments.id, { onDelete: "cascade" }),
    logDate: date("log_date").notNull(),
    dayNumber: integer("day_number").notNull(),
    isSunday: boolean("is_sunday").notNull(),
    runKm: numeric("run_km", { precision: 5, scale: 2 }).notNull().default("0"),
    warmupPreDone: boolean("warmup_pre_done").notNull().default(false),
    warmupPostDone: boolean("warmup_post_done").notNull().default(false),
    stretchMin: integer("stretch_min").notNull().default(0),
    waterL: numeric("water_l", { precision: 4, scale: 2 }).notNull().default("0"),
    electrolytesDone: boolean("electrolytes_done").notNull().default(false),
    proteinG: integer("protein_g").notNull().default(0),
    studyMin: integer("study_min").notNull().default(0),
    studyTopic: text("study_topic"),
    techNote: text("tech_note"),
    githubContribution: boolean("github_contribution").notNull().default(false),
    readingMin: integer("reading_min").notNull().default(0),
    readingTitle: text("reading_title"),
    updateText: text("update_text"), // short public line
    privateNotes: text("private_notes"), // PRIVATE
    completed: boolean("completed").notNull().default(false),
    // Stored when the day is saved, so public (circle-wide) queries can show "6/8" without ever
    // reading body_metrics (whose targets decide what counts as done).
    doneCount: integer("done_count").notNull().default(0),
    requiredCount: integer("required_count").notNull().default(0),
    // Which required tasks are ticked (task names only, never amounts), so the circle can see who did what
    // without reading body_metrics. Stored on save like done_count.
    doneTasks: text("done_tasks").array().notNull().default(sql`'{}'::text[]`),
    // Logged misses never reset the day count (BR4)
    missedTasks: text("missed_tasks").array().notNull().default(sql`'{}'::text[]`),
    ...timestamps(),
  },
  (t) => [unique("daily_logs_user_commitment_date_key").on(t.userId, t.commitmentId, t.logDate)],
);

// For future pgvector use
export const journalEntries = pgTable(
  "journal_entries",
  {
    id: id(),
    userId: userRef(),
    body: text("body").notNull(),
    visibility: text("visibility").notNull(),
    embedding: vector("embedding", { dimensions: 1536 }), // NULL in v1
    ...timestamps(),
  },
  (t) => [
    index("journal_entries_user_id_idx").on(t.userId),
    check("journal_entries_visibility_check", sql`${t.visibility} IN ('PUBLIC','PRIVATE')`),
  ],
);

// No FK on actor_id so audit rows outlive a removed member.
export const auditLog = pgTable("audit_log", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  actorId: uuid("actor_id"),
  action: text("action").notNull(),
  target: text("target"),
  at: tstz("at").notNull().defaultNow(),
});
