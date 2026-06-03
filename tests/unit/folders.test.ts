import { describe, it, expect } from "vitest";
import {
	Folders,
	SYSTEM_FOLDER_IDS,
	FOLDER_DISPLAY_NAMES,
	getFolderDisplayName,
} from "../../shared/folders";

describe("Folders constants", () => {
	it("has expected folder IDs", () => {
		expect(Folders.INBOX).toBe("inbox");
		expect(Folders.SENT).toBe("sent");
		expect(Folders.DRAFT).toBe("draft");
		expect(Folders.ARCHIVE).toBe("archive");
		expect(Folders.TRASH).toBe("trash");
		expect(Folders.SPAM).toBe("spam");
	});
});

describe("SYSTEM_FOLDER_IDS", () => {
	it("includes core folders in sidebar order", () => {
		expect(SYSTEM_FOLDER_IDS).toEqual(["inbox", "sent", "draft", "archive", "trash"]);
	});

	it("excludes spam", () => {
		expect(SYSTEM_FOLDER_IDS).not.toContain("spam");
	});
});

describe("FOLDER_DISPLAY_NAMES", () => {
	it("maps all folder IDs to display names", () => {
		expect(FOLDER_DISPLAY_NAMES.inbox).toBe("Inbox");
		expect(FOLDER_DISPLAY_NAMES.draft).toBe("Drafts");
		expect(FOLDER_DISPLAY_NAMES.spam).toBe("Spam");
	});
});

describe("getFolderDisplayName", () => {
	it("returns known display names", () => {
		expect(getFolderDisplayName("inbox")).toBe("Inbox");
		expect(getFolderDisplayName("draft")).toBe("Drafts");
		expect(getFolderDisplayName("spam")).toBe("Spam");
	});

	it("is case-insensitive for known folders", () => {
		expect(getFolderDisplayName("INBOX")).toBe("Inbox");
		expect(getFolderDisplayName("Sent")).toBe("Sent");
	});

	it("capitalizes unknown folder IDs", () => {
		expect(getFolderDisplayName("custom")).toBe("Custom");
		expect(getFolderDisplayName("myFolder")).toBe("MyFolder");
	});
});
