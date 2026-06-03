<div align="center">
  <h1>Agentic Inbox</h1>
  <p><em>A self-hosted email client with an AI agent, running entirely on Cloudflare Workers</em></p>
</div>

Agentic Inbox lets you send, receive, and manage emails through a modern web interface -- all powered by your own Cloudflare account. Incoming emails arrive via [Cloudflare Email Routing](https://developers.cloudflare.com/email-routing/), each mailbox is isolated in its own [Durable Object](https://developers.cloudflare.com/durable-objects/) with a SQLite database, and attachments are stored in [R2](https://developers.cloudflare.com/r2/).

An **AI-powered Email Agent** can read your inbox, search conversations, and draft replies -- built with the [Cloudflare Agents SDK](https://developers.cloudflare.com/agents/) and [Workers AI](https://developers.cloudflare.com/workers-ai/).

![Agentic Inbox screenshot](./demo_app.png)


Read the blog post to learn more about Cloudflare Email Service and how to use it with the Agents SDK, MCP, and from the Wrangler CLI: [Email for Agents](https://blog.cloudflare.com/email-for-agents/).

## How to setup

**Important**: Clicking the 'Deploy to Cloudflare' button is only one part of the setup. You must follow the **After deploying** steps as well. For a full step-by-step guide with screenshots, refer to this comment: 
https://github.com/cloudflare/agentic-inbox/issues/4#issuecomment-4269118513

### To set up

1. Deploy to Cloudflare. The deploy flow will automatically provision R2, Durable Objects, and Workers AI. You'll be prompted for **DOMAINS**, which is the domain (yourdomain.com) you want to receive emails for (email@yourdomain.com).

     [![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/bachasia/agentic-inbox)

2. **Create D1 databases** -- Run the following commands and paste the returned IDs into `wrangler.jsonc`:
   ```bash
   npx wrangler d1 create auth-db
   npx wrangler d1 create auth-db-production
   ```
3. **Apply D1 migration** -- Run the migration to create auth tables:
   ```bash
   npx wrangler d1 migrations apply auth-db --local
   npx wrangler d1 migrations apply auth-db-production --remote --env production
   ```
4. **Set required secrets** -- Generate a random 32+ character string for `BETTER_AUTH_SECRET`:
   ```bash
   npx wrangler secret put BETTER_AUTH_SECRET --env production
   npx wrangler secret put BETTER_AUTH_URL --env production
   # BETTER_AUTH_URL = your deployed Worker URL, e.g. https://your-inbox.workers.dev
   ```
5. **Set up Email Routing** -- In the Cloudflare dashboard, go to your domain > Email Routing and create a catch-all rule that forwards to this Worker
6. **Enable Email Service** -- The worker needs the `send_email` binding to send outbound emails. See [Email Service docs](https://developers.cloudflare.com/email-routing/email-workers/send-email-workers/)
7. **Create the Vectorize index for semantic search** -- Run both commands (the metadata index is required for per-mailbox filtering):
   ```bash
   npx wrangler vectorize create email-embeddings --dimensions 768 --metric cosine
   npx wrangler vectorize create-metadata-index email-embeddings --property-name=mailboxId --type=string
   ```
8. **Create your admin account** -- Visit your deployed app. You'll be redirected to `/setup` to create the first admin account.
9. **Create mailboxes** -- Log in as admin, then create mailboxes from the home page or admin panel (e.g. `hello@example.com`)
10. **Invite team members** -- Go to `/admin` to create member accounts and assign them mailbox access

### MCP access (optional)

The MCP server at `/mcp` is open by default (for dev/local use). To require an API key in production:
```bash
npx wrangler secret put MCP_API_KEY --env production
```
Then pass `Authorization: Bearer <key>` in your MCP client configuration.

## Features

- **Full email client** — Send and receive emails via Cloudflare Email Routing with a rich text composer, reply/forward threading, folder organization, search, and attachments
- **Per-mailbox isolation** — Each mailbox runs in its own Durable Object with SQLite storage and R2 for attachments
- **Built-in AI agent** — Side panel with email tools for reading, searching, drafting, sending, and semantic Q&A over email history
- **Semantic search** — Find emails by meaning, not just keywords. Natural language queries auto-route to Cloudflare Vectorize; toggle between keyword and semantic mode in the search UI
- **Contact intelligence** — Per-contact stats: email frequency, avg response time, relationship score, and AI-extracted discussion topics
- **Automation rules** — If/then rules (from, subject, category, priority) with actions: label, move, archive, mark-read, notify, webhook. Evaluated on every inbound email
- **Auto-draft on new email** — Agent automatically reads inbound emails and generates draft replies, always requiring explicit confirmation before sending
- **Configurable and persistent** — Custom system prompts per mailbox, persistent chat history, streaming markdown responses, and tool call visibility

### Added in this fork

- **Dark mode** — Toggle dark/light mode via UI; persisted across sessions
- **Email export** — Export mailbox or folder as `.eml` files packaged in a `.zip`, including attachments
- **PWA support** — Install as a desktop/mobile app via Web App Manifest and Service Worker
- **Notifications** — New email alerts via Telegram bot or Discord webhook; configured per-mailbox through the UI
- **Structured error logging** — Centralized logger across the worker layer replacing scattered `console.log` calls
- **Unit tests & CI/CD** — Vitest test suite for core logic (rules engine, search parser, email helpers); GitHub Actions pipeline runs lint and tests on every push/PR

## Stack

- **Frontend:** React 19, React Router v7, Tailwind CSS, Zustand, TipTap, `@cloudflare/kumo`
- **Backend:** Hono, Cloudflare Workers, Durable Objects (SQLite), R2, Email Routing
- **AI Agent:** Cloudflare Agents SDK (`AIChatAgent`), AI SDK v6, Workers AI (`@cf/moonshotai/kimi-k2.5`), `react-markdown` + `remark-gfm`
- **Auth:** Better Auth (email/password, D1-backed sessions, Admin/Member RBAC)

## Getting Started

```bash
npm install
npm run dev
```

### Configuration

1. Set your domain in `wrangler.jsonc`
2. Create an R2 bucket named `agentic-inbox`: `wrangler r2 bucket create agentic-inbox`

### Deploy

```bash
npm run deploy
```

## Prerequisites

- Cloudflare account with a domain
- [Email Routing](https://developers.cloudflare.com/email-routing/) enabled for receiving
- [Email Service](https://developers.cloudflare.com/email-service/) enabled for sending
- [Workers AI](https://developers.cloudflare.com/workers-ai/) enabled (for the agent)
Users authenticate via email/password. Admins manage team members and assign mailbox access via the `/admin` panel. Members only see mailboxes assigned to them. The MCP server at `/mcp` supports optional API key auth via the `MCP_API_KEY` secret.

## Architecture

```
┌──────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Browser    │────>│  Hono Worker     │────>│  MailboxDO      │
│  React SPA   │     │  (API + SSR)     │     │  (SQLite + R2)  │
│  Agent Panel │     │                  │     └─────────────────┘
└──────┬───────┘     │  /agents/* ──────┼────>┌─────────────────┐
       │             │                  │     │  EmailAgent DO  │
       │ WebSocket   │                  │     │  (AIChatAgent)  │
       └─────────────┤                  │     │  9 email tools  │
                     │                  │────>│  Workers AI     │
                     └──────────────────┘     └─────────────────┘
```

## License

Apache 2.0 -- see [LICENSE](LICENSE).
