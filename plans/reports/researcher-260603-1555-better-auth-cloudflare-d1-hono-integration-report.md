# Better Auth + Cloudflare Workers + D1 + Hono Research Report

**Date:** 2026-06-03  
**Status:** Complete — Ready for Implementation Planning

---

## Executive Summary

Better Auth (v1.6.13 as of 2026) **fully supports** Cloudflare Workers + D1 + Hono via:
1. **Native D1 adapter** — no middleware translation layer needed
2. **`better-auth-cloudflare` library** — community CLI + helpers for D1/KV/R2/geolocation
3. **Official Hono integration** — mount auth handler to `/api/auth/*` routes
4. **Admin plugin** — built-in user management with role-based access control

**Limitation (Critical):** Session bug #4203 (Jan 2026) causes 5-minute forced logout regardless of session lifetime config. **Workaround:** Disable `cookieCache` + `secondaryStorage` combo until resolved; use database-backed sessions directly or JWT tokens.

**Recommendation:** Use Better Auth with D1 for new projects. Mature ecosystem, production-ready, but **test session persistence in your specific environment** before scaling.

---

## 1. Installation — Exact Packages

### Core Packages
```bash
npm install better-auth
npm install better-auth/react         # if using React client
npm install better-auth/client        # vanilla JS client
```

### Cloudflare-Specific (Optional but Recommended)
```bash
npm install @zpg6/better-auth-cloudflare  # CLI + helpers
npm install drizzle-orm wrangler         # for D1 adapter
npm install drizzle-kit                  # schema generation
```

### By Feature
| Feature | Package | Version |
|---------|---------|---------|
| Core Auth | `better-auth` | `^1.6.13` |
| React Client | `better-auth/react` | bundled with better-auth |
| Vanilla Client | `better-auth/client` | bundled with better-auth |
| Drizzle Adapter | `drizzle-orm` | `^0.30+` |
| Cloudflare D1 Driver | wrangler's D1 (built-in) | included in wrangler |
| Organization Plugin | `better-auth` (bundled) | `^1.6.13` |
| Admin Plugin | `better-auth` (bundled) | `^1.6.13` |

### Quick Start (CLI)
```bash
# Generate new Hono + D1 + Better Auth project
npx @zpg6/better-auth-cloudflare@latest generate \
  --app-name=my-auth-app \
  --template=hono \
  --database=d1 \
  --kv=true
```

**No separate adapter package needed** — Better Auth's built-in Drizzle support works directly with Cloudflare D1.

---

## 2. Cloudflare Workers Compatibility

### Official Status
✅ **Fully supported** as of Better Auth 1.3+ (July 2025).
- No Node.js APIs used in core auth logic
- Edge runtime compatible with V8 isolate constraints
- Tested in production by community (zpg6/better-auth-cloudflare)

### How It Works
1. **D1 Database Binding** — Passed to Drizzle → Better Auth config
2. **KV Storage** (optional) — Secondary storage for session cache (with workarounds; see limitations)
3. **Request Context** — Auth instance created per-request in Hono middleware
4. **Response Headers** — Session cookies set in HTTP headers (no Node.js specific APIs)

### Code Example
```typescript
// src/auth/index.ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/d1";

export const auth = betterAuth({
  database: drizzleAdapter(
    drizzle(env.DB)  // D1 binding from wrangler.toml
  ),
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL || "http://localhost:8787",
  trustedOrigins: [env.FRONTEND_URL],
  plugins: [admin(), organization()],
});
```

### D1 Binding in wrangler.toml
```toml
[[d1_databases]]
binding = "DB"
database_name = "auth-db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"

[env.production]
[[d1_databases]]
binding = "DB"
database_name = "auth-db-prod"
database_id = "yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy"
```

---

## 3. Hono Integration

### Handler Mount
```typescript
// src/index.ts
import { Hono } from "hono";
import { auth } from "./auth";

const app = new Hono<{ Bindings: CloudflareEnv }>();

// Mount auth handler to all /api/auth/* routes
app.on(["POST", "GET"], "/api/auth/*", (c) => {
  return auth.handler(c.req.raw);
});

export default app;
```

**Why `c.req.raw`?** Better Auth expects the native Web Request object, not Hono's wrapper.

### Middleware for Session Context
```typescript
// Apply before your protected routes
app.use("*", async (c, next) => {
  const session = await auth.api.getSession({ 
    headers: c.req.raw.headers 
  });

  if (session) {
    c.set("user", session.user);
    c.set("session", session.session);
  } else {
    c.set("user", null);
    c.set("session", null);
  }

  await next();
});

// Now use in routes
app.get("/api/protected", (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  return c.json({ message: `Hello, ${user.name}` });
});
```

### CORS Setup (Critical)
```typescript
import { cors } from "hono/cors";

app.use(
  "/api/auth/*",
  cors({
    origin: env.FRONTEND_URL,
    credentials: true,
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "OPTIONS"],
  })
);
```

**Order matters:** Register CORS before auth routes so it runs first.

---

## 4. D1 Database Adapter & Schema

### Automatic Schema Generation
```bash
# Run this after configuring Better Auth
npx @better-auth/cli@latest generate --config src/auth/index.ts
```

This command:
- Scans your D1 database
- Generates migration SQL files
- Supports both SQLite (D1) and PostgreSQL

### Core Tables Created
Better Auth auto-creates these 4 tables:

| Table | Columns | Purpose |
|-------|---------|---------|
| `user` | id (PK), email, emailVerified, name, image, createdAt, updatedAt | User accounts |
| `session` | id (PK), userId (FK), token, expiresAt, ipAddress, userAgent, createdAt, updatedAt | Active sessions |
| `account` | id (PK), userId (FK), provider, providerAccountId, accessToken, refreshToken, scope, expiresAt, createdAt, updatedAt | OAuth/provider accounts |
| `verification` | id (PK), identifier, value, expiresAt, createdAt, updatedAt | Email verification, password resets, MFA tokens |

### Schema Customization Example
```typescript
export const auth = betterAuth({
  database: drizzleAdapter(drizzle(env.DB)),
  user: {
    fields: {
      email: "email_address",  // rename column
      name: "full_name",
      createdAt: "joined_at",
    },
  },
  session: {
    fields: {
      userId: "user_id",
      expiresAt: "expires_at",
    },
  },
  plugins: [
    // Plugins (admin, org) add their own tables automatically
  ],
});
```

### Manual D1 Migration (if needed)
```sql
-- migrations/0001_create_auth_schema.sql
CREATE TABLE user (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  emailVerified INTEGER,
  name TEXT,
  image TEXT,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);

CREATE TABLE session (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  token TEXT UNIQUE NOT NULL,
  expiresAt INTEGER NOT NULL,
  ipAddress TEXT,
  userAgent TEXT,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  FOREIGN KEY (userId) REFERENCES user(id) ON DELETE CASCADE
);

-- ... account, verification tables ...
```

Apply with:
```bash
wrangler d1 migrations apply auth-db --local  # or --remote for production
```

---

## 5. Admin Plugin — User Management API

### Enable Plugin
```typescript
import { admin } from "better-auth/plugins";

export const auth = betterAuth({
  database: drizzleAdapter(drizzle(env.DB)),
  plugins: [admin()],
  // ... other config
});
```

### Endpoints Exposed
All endpoints are POST to `/api/auth/admin/<endpoint>`. Require `admin` role by default (configurable via access control).

| Endpoint | Body | Returns | Use |
|----------|------|---------|-----|
| `create-user` | `{ email, password, name, role }` | `{ user, session }` | Admin creates account |
| `list-users` | `{ limit, offset, search, filter }` | `{ users: [], total }` | Paginated user list |
| `get-user` | `{ userId }` | `{ user }` | Fetch single user |
| `update-user` | `{ userId, name, email, ... }` | `{ user }` | Edit user fields |
| `remove-user` | `{ userId }` | `{ success }` | Hard delete user |
| `set-role` | `{ userId, role }` | `{ user }` | Assign role (admin, moderator, etc.) |
| `ban-user` | `{ userId, reason }` | `{ user }` | Ban user (blocks login) |
| `unban-user` | `{ userId }` | `{ user }` | Remove ban |
| `list-user-sessions` | `{ userId }` | `{ sessions }` | All active sessions for user |
| `revoke-user-session` | `{ userId, sessionId }` | `{ success }` | Logout one session |
| `revoke-user-sessions` | `{ userId }` | `{ success }` | Logout all user sessions |
| `set-user-password` | `{ userId, password }` | `{ success }` | Force password change |
| `impersonate-user` | `{ userId }` | `{ session }` | Admin login as user |
| `stop-impersonating` | none | `{ session }` | Return to admin account |

### Example: Create User (Admin Endpoint)
```typescript
// Client-side (admin dashboard)
const response = await fetch("/api/auth/admin/create-user", {
  method: "POST",
  credentials: "include",  // Send admin session cookie
  body: JSON.stringify({
    email: "newuser@example.com",
    password: "secure123",
    name: "New User",
    role: "user",
  }),
});
const { user, session } = await response.json();
```

### Access Control (Custom Permissions)
```typescript
import { admin, createAccessControl } from "better-auth/plugins";

const accessControl = createAccessControl({
  user: {
    actions: ["create", "read", "update", "delete"],
  },
  org: {
    actions: ["manage", "invite"],
  },
});

export const auth = betterAuth({
  plugins: [
    admin({ 
      accessControl,
      roles: {
        admin: { permissions: ["*"] },  // all permissions
        moderator: { permissions: ["user:read", "user:ban"] },
        user: { permissions: ["user:read"] },
      },
    }),
  ],
});
```

---

## 6. Invitation Flow (Invite-Only Registration)

### Option A: Organization Plugin (Recommended)
```typescript
import { organization } from "better-auth/plugins";

export const auth = betterAuth({
  plugins: [
    organization({
      allowUserToCreateOrganization: true,
      sendInvitationEmail: async (email, invitationLink, organization) => {
        // Send via Resend, SendGrid, etc.
        await resend.emails.send({
          from: "noreply@example.com",
          to: email,
          subject: `Join ${organization.name}`,
          html: `<a href="${invitationLink}">Accept Invite</a>`,
        });
      },
    }),
  ],
});
```

**Endpoints:**
- `POST /api/auth/organization/invite` — Send invite (requires org membership)
- `POST /api/auth/organization/accept-invitation` — Accept via token
- `GET /api/auth/organization/pending-invitations` — List pending invites

### Option B: Custom Invite Table (More Control)
```typescript
// 1. Create invite table in D1
CREATE TABLE invite (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  organizationId TEXT NOT NULL,
  token TEXT UNIQUE NOT NULL,
  expiresAt INTEGER NOT NULL,
  createdAt INTEGER NOT NULL,
  FOREIGN KEY (organizationId) REFERENCES organization(id)
);

// 2. Admin endpoint to issue invite
app.post("/api/admin/invites", async (c) => {
  const admin = c.get("user");
  if (admin?.role !== "admin") return c.json({ error: "Forbidden" }, 403);

  const { email } = await c.req.json();
  const inviteToken = generateRandomToken(32);

  await db.insert(invite).values({
    id: crypto.randomUUID(),
    email,
    organizationId: "org-1",
    token: inviteToken,
    expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
  });

  const inviteLink = `${env.FRONTEND_URL}/join?token=${inviteToken}`;
  // Send inviteLink via email...

  return c.json({ success: true });
});

// 3. Registration endpoint validates invite
app.post("/api/auth/signup-invited", async (c) => {
  const { email, password, token } = await c.req.json();

  // Verify token
  const invite = await db.query.invite.findFirst({
    where: and(eq(invite.email, email), eq(invite.token, token)),
  });

  if (!invite || invite.expiresAt < Date.now()) {
    return c.json({ error: "Invalid or expired invite" }, 400);
  }

  // Create user via auth
  const user = await auth.api.signUpEmail({
    email,
    password,
  });

  // Mark invite used
  await db.delete(invite).where(eq(invite.id, invite.id));

  return c.json({ user });
});
```

### Key Consideration
**Better Auth does NOT natively support "registration disabled" mode** (all signups require invite). You must either:
1. Use Organization plugin + conditional flows, or
2. Build a custom invite table as above

---

## 7. Session Management on Cloudflare Workers

### How Sessions Work
```
User Login → Better Auth creates JWT/token → Set in HTTP-only cookie → 
  Each request: Browser sends cookie → Hono middleware validates → User context set
```

### Configuration
```typescript
export const auth = betterAuth({
  database: drizzleAdapter(drizzle(env.DB)),
  session: {
    expiresIn: 60 * 60 * 24 * 7,  // 7 days in seconds
    updateAge: 60 * 60 * 24,       // Update session age if idle 1 day
    cookieCache: {
      enabled: false,  // CRITICAL: Disable due to bug #4203
    },
    // Use database-backed sessions (default)
  },
});
```

### The Session Bug (Issue #4203, Jan 2026)
**Symptom:** Users logged out after exactly 5 minutes regardless of session lifetime config.  
**Root Cause:** `cookieCache` + `secondaryStorage` (KV) combo broken — session not refreshed in D1 after initial cache read.  
**Status:** Open, under investigation.

**Workaround:**
```typescript
session: {
  cookieCache: { enabled: false },  // Disable cache
  // Don't use secondaryStorage for now
},
```

### Session Flow on Edge
1. **Request arrives** → Hono middleware extracts session from cookie
2. **Middleware calls** `auth.api.getSession({ headers: c.req.raw.headers })`
3. **Better Auth validates** JWT signature + checks expiration
4. **If valid** → Returns user + session object
5. **Middleware stores** in context (`c.set("user", ...)`)
6. **Routes access** via `c.get("user")`
7. **Response sent** → New session cookie (refreshed) in Set-Cookie header

### Token Formats
- **Default:** Signed cookie with opaque token (stored in `session` table)
- **Optional JWT:** Can enable stateless JWT with `enableSessionJWT: true` (v1.5+) — no database lookup per request

```typescript
// Stateless JWT option (advanced)
export const auth = betterAuth({
  session: {
    enableSessionJWT: true,  // Session is signed JWT in cookie
    // No database lookup on each request (faster for edge)
  },
});
```

**Trade-off:** Stateless JWT = no immediate revocation (logout still works but token remains valid if cached). Best for high-traffic edge apps.

---

## 8. React Client Integration

### Installation & Setup
```typescript
// src/lib/auth-client.ts
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:8787",
  // baseURL auto-detects /api/auth if same domain
});
```

### useSession Hook
```typescript
import { authClient } from "@/lib/auth-client";

export function Profile() {
  const { data: session, isPending, error } = authClient.useSession();

  if (isPending) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;
  if (!session) return <div><a href="/login">Login</a></div>;

  return (
    <div>
      <p>Welcome, {session.user.name}</p>
      <img src={session.user.image} alt={session.user.name} />
      <button onClick={() => authClient.signOut()}>Logout</button>
    </div>
  );
}
```

### Sign In
```typescript
async function handleLogin(email: string, password: string) {
  const { data, error } = await authClient.signIn.email({
    email,
    password,
  });

  if (error) {
    console.error(error.message);  // "Invalid credentials"
    return;
  }

  // Redirect to dashboard
  window.location.href = "/dashboard";
}
```

### Sign Up
```typescript
async function handleSignUp(email: string, password: string, name: string) {
  const { data, error } = await authClient.signUp.email({
    email,
    password,
    name,
  });

  if (error) {
    console.error(error.message);  // "Email already exists"
    return;
  }

  // Redirect or show success
  window.location.href = "/onboarding";
}
```

### Available Hooks
| Hook | Returns | Use |
|------|---------|-----|
| `useSession()` | `{ data, isPending, error, refetch }` | Current user + session |
| `useAuthState()` | `{ isAuthenticated, isPending }` | Auth status only |
| `useLists()` | User/org lists | Fetch paginated lists |
| `useSignIn()` | Sign in methods | Trigger login |
| `useSignUp()` | Sign up methods | Trigger registration |

### CORS & Credentials
```typescript
// Ensure credentials sent with cross-origin requests
const authClient = createAuthClient({
  baseURL: "https://api.example.com",
  fetchOptions: {
    credentials: "include",  // Send cookies with requests
  },
});
```

---

## 9. Roles & Permissions (RBAC)

### Built-In Support
Better Auth supports roles natively via Admin plugin. A user can have **multiple roles**.

### Setup
```typescript
import { admin } from "better-auth/plugins";

export const auth = betterAuth({
  plugins: [
    admin({
      roles: {
        admin: {
          description: "Full access",
          permissions: ["*"],  // Wildcard: all permissions
        },
        moderator: {
          description: "Moderate users",
          permissions: [
            "user:read",
            "user:ban",
            "user:unban",
          ],
        },
        user: {
          description: "Regular user",
          permissions: ["user:read"],
        },
      },
    }),
  ],
});
```

### Database Schema
```sql
-- Roles stored as comma-separated string in user.role
-- Example: "user,moderator" = both roles
```

### Check Permission on Server
```typescript
app.get("/api/protected", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  // Check permission
  const hasPermission = await auth.api.hasPermission({
    userId: user.id,
    permission: "user:ban",
  });

  if (!hasPermission) {
    return c.json({ error: "Forbidden" }, 403);
  }

  // Protected endpoint logic
  return c.json({ data: "sensitive data" });
});
```

### Check Permission on Client
```typescript
import { authClient } from "@/lib/auth-client";

export function AdminPanel() {
  const { data: session } = authClient.useSession();

  // Check if user has admin role
  const isAdmin = session?.user.role?.includes("admin");

  if (!isAdmin) {
    return <div>Access Denied</div>;
  }

  return <div>Admin Dashboard</div>;
}
```

### Organization-Level Roles (Alternative)
```typescript
import { organization } from "better-auth/plugins";

export const auth = betterAuth({
  plugins: [
    organization({
      roles: {
        owner: { permissions: ["*"] },
        member: { permissions: ["read", "comment"] },
      },
    }),
  ],
});

// Users have roles per-organization
// user.role in org A = "owner", in org B = "member"
```

---

## 10. Known Limitations on Cloudflare Workers

### 1. **Session Bug #4203 (Open, Jan 2026)**
- **Issue:** 5-minute forced logout (cookieCache + secondaryStorage combo broken)
- **Workaround:** Disable `cookieCache`, use database-backed sessions
- **Status:** Under investigation; follow [GitHub issue #4203](https://github.com/better-auth/better-auth/issues/4203)

### 2. **No Node.js APIs**
- ✅ Drizzle ORM works (Web-standard SQLite driver via D1)
- ✅ Fetch API works (native in edge runtime)
- ❌ `fs` module not available
- ❌ `child_process` not available
- **Impact:** Can't use Node.js-specific email libraries; use web-native alternatives (Resend, SendGrid API)

### 3. **CPU Time Limit (50ms)**
- Cloudflare Workers CPU: max 50ms execution
- **Impact:** Heavy crypto ops (PBKDF2, argon2) may timeout
- **Solution:** Better Auth uses `bcrypt` (edge-friendly); verify in your stress tests
- **Not an issue:** For typical auth operations (login, session check)

### 4. **Memory Constraint (128MB)**
- Cloudflare Workers: 128MB max
- **Impact:** None for Better Auth (core library ~2MB)
- **Caution:** Large payload handling or image uploads need care

### 5. **V8 Isolate Restrictions**
- No shared global state between requests
- No persistent in-memory cache
- **Impact:** Auth instance created per-request (acceptable; handled by Hono)
- **Not an issue:** KV and D1 provide shared state across requests

### 6. **KV Consistency (Eventually Consistent)**
- Cloudflare KV is eventually consistent
- **Impact:** If using KV for session cache, brief inconsistency possible
- **Mitigation:** Use D1 (SQLite, strongly consistent) as primary; KV as optional cache only
- **Recommendation:** Disable KV session cache for now (see bug #4203)

### 7. **D1 Cold Starts (Regional)**
- D1 has regional latency (e.g., 10–100ms if hitting non-local replica)
- **Impact:** Session lookup adds 10–50ms per request
- **Optimization:** Use JWT stateless sessions to avoid DB lookup (advanced option)

### 8. **Email Sending**
- No built-in Node.js SMTP
- **Solution:** Use Cloudflare Email Routing + SendGrid/Resend API (webhook or fetch)

### 9. **File Storage**
- No local filesystem
- **Solution:** Use Cloudflare R2 (S3-compatible) for avatars, documents
- **Better Auth integration:** `@zpg6/better-auth-cloudflare` has R2 support

### 10. **Rate Limiting**
- Cloudflare Workers: standard rate limits apply
- **Impact:** If auth endpoints get hammered, Workers throttles
- **Mitigation:** Use Cloudflare Rate Limiting rules or implement in Hono

---

## Implementation Strategy & Phase Breakdown

### Phase 1: Database & Auth Setup
- Configure D1 in `wrangler.toml`
- Initialize Better Auth with Drizzle + D1 adapter
- Run schema migration (`npx @better-auth/cli@latest generate`)
- **Expected duration:** 30 min
- **Deliverable:** `src/auth/index.ts` with auth config

### Phase 2: Hono Integration
- Mount auth handler to `/api/auth/*`
- Add session middleware to extract user context
- Configure CORS
- Test `/api/auth/signin` endpoint
- **Expected duration:** 45 min
- **Deliverable:** `src/index.ts` with Hono app + auth routes

### Phase 3: Admin Plugin & User Management
- Enable admin plugin in auth config
- Implement admin endpoints (create user, list, ban, etc.)
- Add role-based access control
- **Expected duration:** 1 hour
- **Deliverable:** `/api/admin/*` endpoints + tests

### Phase 4: React Client Integration
- Create `authClient` instance with `createAuthClient`
- Build login/signup pages with hooks
- Implement protected route wrapper
- Test useSession hook
- **Expected duration:** 1.5 hours
- **Deliverable:** Login/signup pages, profile page, protected routes

### Phase 5: Invite Flow (Optional)
- Implement custom invite table + logic, or use Organization plugin
- Admin endpoint to issue invites
- Registration endpoint to accept invites
- Email integration (Resend/SendGrid)
- **Expected duration:** 2 hours
- **Deliverable:** Admin invite page + invite acceptance flow

### Phase 6: Session Management & Security
- Disable `cookieCache` (workaround for bug #4203)
- Configure session expiration & refresh logic
- Add CSRF protection
- Test session persistence under edge runtime
- **Expected duration:** 1 hour
- **Deliverable:** Session config + tests verifying 7-day session lifetime

### Phase 7: Testing & Production Hardening
- Unit tests for auth endpoints
- Integration tests with D1
- Load testing session persistence
- Security audit (OWASP auth checklist)
- **Expected duration:** 2 hours
- **Deliverable:** Test suite + audit report

---

## Code Snippets — Quick Reference

### Minimal Hono + Better Auth Setup
```typescript
// src/auth/index.ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/d1";
import { admin } from "better-auth/plugins";

export const createAuth = (env: CloudflareEnv) => {
  return betterAuth({
    database: drizzleAdapter(drizzle(env.DB)),
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    trustedOrigins: [env.FRONTEND_URL],
    plugins: [admin()],
  });
};

// src/index.ts
import { Hono } from "hono";
import { cors } from "hono/cors";
import { createAuth } from "./auth";

type Env = {
  Bindings: CloudflareEnv;
  Variables: {
    user: any;
    session: any;
  };
};

const app = new Hono<Env>();

// CORS
app.use(
  "/api/auth/*",
  cors({
    origin: (c) => c.env.FRONTEND_URL,
    credentials: true,
  })
);

// Auth handler
app.on(["POST", "GET"], "/api/auth/*", async (c) => {
  const auth = createAuth(c.env);
  return auth.handler(c.req.raw);
});

// Session middleware
app.use("*", async (c, next) => {
  const auth = createAuth(c.env);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  c.set("user", session?.user || null);
  c.set("session", session?.session || null);
  await next();
});

// Protected route
app.get("/api/me", (c) => {
  const user = c.get("user");
  return user ? c.json(user) : c.json({ error: "Unauthorized" }, 401);
});

export default app;
```

### React Client + useSession
```typescript
// src/lib/auth-client.ts
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:8787",
});

// src/pages/Profile.tsx
import { authClient } from "@/lib/auth-client";

export default function Profile() {
  const { data: session, isPending } = authClient.useSession();

  if (isPending) return <div>Loading...</div>;
  if (!session) return <div>Not logged in</div>;

  return (
    <div>
      <h1>Welcome, {session.user.name}</h1>
      <button onClick={() => authClient.signOut()}>Logout</button>
    </div>
  );
}
```

### Admin Create User
```typescript
// Server-side (Hono)
app.post("/api/admin/users", async (c) => {
  const admin = c.get("user");
  if (admin?.role !== "admin") return c.json({ error: "Forbidden" }, 403);

  const auth = createAuth(c.env);
  const { email, password, name, role } = await c.req.json();

  const { user } = await auth.api.createUser({
    email,
    password,
    name,
    data: { role },
  });

  return c.json(user);
});

// Client-side
async function createUser(email, password, name) {
  const res = await fetch("/api/admin/users", {
    method: "POST",
    credentials: "include",
    body: JSON.stringify({ email, password, name, role: "user" }),
  });
  return res.json();
}
```

---

## Verification Checklist

Before implementing, verify:

- [ ] D1 database created in Cloudflare account (free tier included)
- [ ] `wrangler.toml` has D1 binding configured
- [ ] `BETTER_AUTH_SECRET` generated (32+ char random string)
- [ ] `BETTER_AUTH_URL` set to correct base URL (e.g., `http://localhost:8787` dev, `https://api.example.com` prod)
- [ ] CORS origin matches frontend URL
- [ ] Node.js 18+ (for local dev with wrangler)
- [ ] Familiarize with bug #4203 workaround (disable `cookieCache`)
- [ ] Plan for email (Resend, SendGrid) if using invites or verification

---

## Unresolved Questions

1. **Session bug #4203 timeline:** Will this be fixed in v1.7? No ETA provided in issue thread.
2. **KV secondary storage:** Once #4203 fixed, what's optimal KV + D1 split? (cache vs. authoritative)
3. **Stateless JWT adoption:** Performance benefit of `enableSessionJWT: true` in edge? No benchmarks found.
4. **Multi-region D1:** Does cross-region replication affect session consistency? Test needed.
5. **Rate limiting integration:** Built-in rate limiting for auth endpoints? Not found in docs; will require custom middleware.

---

## Sources

- [Better Auth Official Docs](https://better-auth.com/docs/installation)
- [Better Auth Hono Integration](https://better-auth.com/docs/integrations/hono)
- [Hono + Better Auth on Cloudflare](https://hono.dev/examples/better-auth-on-cloudflare)
- [Better Auth Admin Plugin](https://better-auth.com/docs/plugins/admin)
- [Better Auth Organization Plugin](https://better-auth.com/docs/plugins/organization)
- [Better Auth Database Concepts](https://better-auth.com/docs/concepts/database)
- [Better Auth React Client](https://better-auth.com/docs/concepts/client)
- [better-auth-cloudflare CLI (zpg6)](https://github.com/zpg6/better-auth-cloudflare)
- [Better Auth GitHub Issue #4203 (Session Bug)](https://github.com/better-auth/better-auth/issues/4203)
- [Medium: Better Auth + Cloudflare Workers Integration](https://medium.com/@senioro.valentino/better-auth-cloudflare-workers-the-integration-guide-nobody-wrote-8480331d805f)
- [DEV Community: Better Auth with React Router & D1](https://dev.to/atman33/setup-better-auth-with-react-router-cloudflare-d1-2ad4)
- [JWT Validation at Cloudflare Edge](https://drcodes.com/posts/jwt-authentication-with-cloudflare-workers-complete-guide)

