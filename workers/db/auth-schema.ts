import { sqliteTable, text } from "drizzle-orm/sqlite-core";

// Junction table linking users to mailboxes they can access
export const mailboxPermission = sqliteTable("mailbox_permission", {
	id: text("id").primaryKey(),
	userId: text("userId").notNull(),
	mailboxId: text("mailboxId").notNull(),
});
