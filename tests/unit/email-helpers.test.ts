import { describe, it, expect } from "vitest";
import {
	escapeHtml,
	stripHtmlToText,
	textToHtml,
	validateSender,
	generateMessageId,
	buildReferencesChain,
	buildThreadingHeaders,
	buildQuotedReplyBlock,
	SenderValidationError,
} from "../../workers/lib/email-helpers";

describe("escapeHtml", () => {
	it("escapes all five OWASP characters", () => {
		expect(escapeHtml('&<>"\''))
			.toBe("&amp;&lt;&gt;&quot;&#39;");
	});

	it("returns empty string for falsy input", () => {
		expect(escapeHtml("")).toBe("");
		expect(escapeHtml(null as any)).toBe("");
		expect(escapeHtml(undefined as any)).toBe("");
	});

	it("passes through safe text unchanged", () => {
		expect(escapeHtml("Hello world 123")).toBe("Hello world 123");
	});
});

describe("stripHtmlToText", () => {
	it("strips HTML tags", () => {
		expect(stripHtmlToText("<p>Hello <b>world</b></p>")).toBe("Hello world");
	});

	it("removes style blocks", () => {
		expect(stripHtmlToText('<style type="text/css">body{color:red}</style><p>Hi</p>')).toBe("Hi");
	});

	it("removes script blocks", () => {
		expect(stripHtmlToText("<script>alert('xss')</script><p>Safe</p>")).toBe("Safe");
	});

	it("normalizes whitespace", () => {
		expect(stripHtmlToText("<p>Hello</p>   <p>World</p>")).toBe("Hello World");
	});

	it("returns empty for falsy input", () => {
		expect(stripHtmlToText("")).toBe("");
		expect(stripHtmlToText(null as any)).toBe("");
	});
});

describe("textToHtml", () => {
	it("wraps text in div with pre-wrap", () => {
		expect(textToHtml("Hello")).toBe('<div style="white-space:pre-wrap">Hello</div>');
	});

	it("converts newlines to br", () => {
		expect(textToHtml("Line 1\nLine 2")).toBe(
			'<div style="white-space:pre-wrap">Line 1<br>Line 2</div>',
		);
	});

	it("escapes HTML entities", () => {
		expect(textToHtml("<script>")).toContain("&lt;script&gt;");
	});

	it("returns empty for falsy input", () => {
		expect(textToHtml("")).toBe("");
	});
});

describe("validateSender", () => {
	it("validates matching sender", () => {
		const result = validateSender("bob@example.com", "alice@example.com", "alice@example.com");
		expect(result.fromEmail).toBe("alice@example.com");
		expect(result.fromDomain).toBe("example.com");
		expect(result.toStr).toBe("bob@example.com");
	});

	it("handles case-insensitive match", () => {
		const result = validateSender("Bob@EXAMPLE.com", "Alice@Example.COM", "alice@example.com");
		expect(result.fromEmail).toBe("alice@example.com");
	});

	it("handles array of recipients", () => {
		const result = validateSender(
			["bob@example.com", "carol@example.com"],
			"alice@example.com",
			"alice@example.com",
		);
		expect(result.toStr).toBe("bob@example.com, carol@example.com");
	});

	it("handles object-form sender", () => {
		const result = validateSender(
			"bob@test.com",
			{ email: "alice@example.com", name: "Alice" },
			"alice@example.com",
		);
		expect(result.fromEmail).toBe("alice@example.com");
	});

	it("throws SenderValidationError on mismatch", () => {
		expect(() => validateSender("bob@test.com", "wrong@test.com", "alice@example.com"))
			.toThrow(SenderValidationError);
	});

	it("throws on invalid domain (no @)", () => {
		expect(() => validateSender("bob@test.com", "nodomain", "nodomain"))
			.toThrow(SenderValidationError);
	});
});

describe("generateMessageId", () => {
	it("returns UUID format messageId and domain-suffixed outgoingMessageId", () => {
		const result = generateMessageId("example.com");
		expect(result.messageId).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
		);
		expect(result.outgoingMessageId).toMatch(/@example\.com$/);
		expect(result.outgoingMessageId).toContain(result.messageId);
	});

	it("generates unique IDs on each call", () => {
		const a = generateMessageId("test.com");
		const b = generateMessageId("test.com");
		expect(a.messageId).not.toBe(b.messageId);
	});
});

describe("buildReferencesChain", () => {
	it("builds chain from email with message_id", () => {
		const original = { message_id: "orig-123", id: "id-456", email_references: null } as any;
		const result = buildReferencesChain(original);
		expect(result.originalMsgId).toBe("orig-123");
		expect(result.references).toEqual(["orig-123"]);
	});

	it("falls back to id when message_id is missing", () => {
		const original = { message_id: "", id: "id-789", email_references: null } as any;
		const result = buildReferencesChain(original);
		expect(result.originalMsgId).toBe("id-789");
	});

	it("appends to existing references", () => {
		const original = {
			message_id: "msg-3",
			id: "id-3",
			email_references: JSON.stringify(["msg-1", "msg-2"]),
		} as any;
		const result = buildReferencesChain(original);
		expect(result.references).toEqual(["msg-1", "msg-2", "msg-3"]);
	});

	it("handles malformed JSON in email_references", () => {
		const original = { message_id: "msg-1", id: "id-1", email_references: "not-json" } as any;
		const result = buildReferencesChain(original);
		expect(result.references).toEqual(["msg-1"]);
	});

	it("sets threadId from original or falls back to id", () => {
		expect(buildReferencesChain({ message_id: "m", id: "i", thread_id: "t1" } as any).threadId).toBe("t1");
		expect(buildReferencesChain({ message_id: "m", id: "i", thread_id: "" } as any).threadId).toBe("i");
	});
});

describe("buildThreadingHeaders", () => {
	it("builds In-Reply-To with angle brackets", () => {
		const headers = buildThreadingHeaders("msg-123", []);
		expect(headers["In-Reply-To"]).toBe("<msg-123>");
	});

	it("builds References from array", () => {
		const headers = buildThreadingHeaders("msg-3", ["msg-1", "msg-2", "msg-3"]);
		expect(headers.References).toBe("<msg-1> <msg-2> <msg-3>");
	});

	it("omits References when array is empty", () => {
		const headers = buildThreadingHeaders("msg-1", []);
		expect(headers).not.toHaveProperty("References");
	});
});

describe("buildQuotedReplyBlock", () => {
	it("builds blockquote with escaped sender and plain-text body", () => {
		const result = buildQuotedReplyBlock({
			date: "2026-01-15T10:00:00Z",
			sender: "Alice <alice@test.com>",
			body: "<p>Hello <b>world</b></p>",
		});
		expect(result).toContain("<blockquote");
		expect(result).toContain("Alice &lt;alice@test.com&gt;");
		expect(result).toContain("Hello world");
		expect(result).not.toContain("<p>");
		expect(result).not.toContain("<b>");
	});

	it("returns empty string when body is missing", () => {
		expect(buildQuotedReplyBlock({ sender: "Alice" })).toBe("");
	});

	it("escapes HTML in sender to prevent XSS", () => {
		const result = buildQuotedReplyBlock({
			sender: '<script>alert("xss")</script>',
			body: "safe body",
		});
		expect(result).not.toContain("<script>");
		expect(result).toContain("&lt;script&gt;");
	});
});
