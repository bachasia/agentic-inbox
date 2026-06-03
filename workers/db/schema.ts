// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { sqliteTable, text, integer, real, primaryKey } from "drizzle-orm/sqlite-core";

export const folders = sqliteTable("folders", {
	id: text("id").primaryKey(),
	name: text("name").notNull().unique(),
	is_deletable: integer("is_deletable").notNull().default(1),
});

export const emails = sqliteTable("emails", {
	id: text("id").primaryKey(),
	folder_id: text("folder_id")
		.notNull()
		.references(() => folders.id, { onDelete: "cascade" }),
	subject: text("subject"),
	sender: text("sender"),
	recipient: text("recipient"),
	cc: text("cc"),
	bcc: text("bcc"),
	date: text("date"),
	read: integer("read").default(0),
	starred: integer("starred").default(0),
	body: text("body"),
	in_reply_to: text("in_reply_to"),
	email_references: text("email_references"),
	thread_id: text("thread_id"),
	message_id: text("message_id"),
	raw_headers: text("raw_headers"),
	snooze_until: text("snooze_until"),
	scheduled_send_at: text("scheduled_send_at"),
	triage_category: text("triage_category"),
	triage_priority: integer("triage_priority"),
	triage_summary: text("triage_summary"),
	triage_confidence: real("triage_confidence"),
});

export const labels = sqliteTable("labels", {
	id:    text("id").primaryKey(),
	name:  text("name").notNull().unique(),
	color: text("color").notNull().default("#6366f1"),
});

export const emailLabels = sqliteTable("email_labels", {
	email_id: text("email_id").notNull().references(() => emails.id, { onDelete: "cascade" }),
	label_id: text("label_id").notNull().references(() => labels.id, { onDelete: "cascade" }),
}, (t) => ({ pk: primaryKey({ columns: [t.email_id, t.label_id] }) }));

export const contacts = sqliteTable("contacts", {
	id:           text("id").primaryKey(),
	email:        text("email").notNull().unique(),
	name:         text("name"),
	frequency:    integer("frequency").notNull().default(1),
	last_seen:    text("last_seen").notNull(),
	intelligence: text("intelligence"),
});

export const pendingAlarms = sqliteTable("pending_alarms", {
	id:      text("id").primaryKey(),
	type:    text("type").notNull(),
	payload: text("payload").notNull(),
	fire_at: text("fire_at").notNull(),
});

export const actionItems = sqliteTable("action_items", {
	id:           text("id").primaryKey(),
	email_id:     text("email_id").notNull(),
	description:  text("description").notNull(),
	due_date:     text("due_date"),
	completed_at: text("completed_at"),
	created_at:   text("created_at").notNull(),
});

export const emailEmbeddings = sqliteTable("email_embeddings", {
	email_id:    text("email_id").notNull().primaryKey(),
	embedded_at: text("embedded_at").notNull(),
});

export const automationRules = sqliteTable("automation_rules", {
	id:         text("id").primaryKey(),
	name:       text("name").notNull(),
	enabled:    integer("enabled").notNull().default(1),
	priority:   integer("priority").notNull().default(0),
	conditions: text("conditions").notNull(),
	actions:    text("actions").notNull(),
	created_at: text("created_at").notNull(),
	updated_at: text("updated_at").notNull(),
});

export const attachments = sqliteTable("attachments", {
	id: text("id").primaryKey(),
	email_id: text("email_id")
		.notNull()
		.references(() => emails.id, { onDelete: "cascade" }),
	filename: text("filename").notNull(),
	mimetype: text("mimetype").notNull(),
	size: integer("size").notNull(),
	content_id: text("content_id"),
	disposition: text("disposition"),
});
