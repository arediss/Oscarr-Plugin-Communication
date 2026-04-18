import { createRequire } from 'module'; const require = createRequire(import.meta.url);

// src/index.ts
import { readFile as readFile2 } from "fs/promises";
import { join as join2, dirname } from "path";
import { fileURLToPath } from "url";

// src/permissions.ts
var PERM_ANNOUNCEMENTS_MANAGE = "communication.announcements.manage";
var PERMISSIONS = [
  { key: PERM_ANNOUNCEMENTS_MANAGE, description: "Create, edit and delete announcements broadcast to users" }
];

// src/storage.ts
import { readFile, writeFile, rename, unlink } from "fs/promises";
import { join } from "path";
var FILE_NAME = "data.json";
var CURRENT_VERSION = 1;
var EMPTY = {
  version: CURRENT_VERSION,
  announcements: []
};
var CommunicationStore = class {
  ctx;
  cache = null;
  /** Serialize writes via a chain that always resolves. A failing mutator re-throws to the caller but never poisons the chain for the next call. */
  writeChain = Promise.resolve();
  constructor(ctx) {
    this.ctx = ctx;
  }
  async filePath() {
    const dir = await this.ctx.getPluginDataDir();
    return join(dir, FILE_NAME);
  }
  async load() {
    if (this.cache) return this.cache;
    const path = await this.filePath();
    try {
      const raw = await readFile(path, "utf-8");
      const parsed = JSON.parse(raw);
      this.cache = {
        version: parsed.version ?? CURRENT_VERSION,
        announcements: Array.isArray(parsed.announcements) ? parsed.announcements : []
      };
    } catch (err) {
      const error = err;
      if (error.code === "ENOENT") {
        this.cache = { ...EMPTY, announcements: [] };
      } else if (err instanceof SyntaxError) {
        const corruptPath = path + ".corrupt-" + Date.now();
        this.ctx.log.error(`[Communication] data.json is corrupted, moved to ${corruptPath}. Starting with an empty store.`);
        try {
          await rename(path, corruptPath);
        } catch {
        }
        this.cache = { ...EMPTY, announcements: [] };
      } else {
        throw err;
      }
    }
    return this.cache;
  }
  /** Runs a mutator under a serialized write lock. Persists via tmp + rename so a crash mid-write can never leave a truncated data.json. */
  async mutate(mutator) {
    const run = async () => {
      const data = await this.load();
      await mutator(data);
      data.version = CURRENT_VERSION;
      const path = await this.filePath();
      const tmpPath = path + ".tmp";
      await writeFile(tmpPath, JSON.stringify(data, null, 2), "utf-8");
      try {
        await rename(tmpPath, path);
      } catch (renameErr) {
        try {
          await unlink(tmpPath);
        } catch {
        }
        throw renameErr;
      }
      this.cache = data;
      return data;
    };
    const next = this.writeChain.catch(() => void 0).then(run);
    this.writeChain = next.catch(() => void 0);
    return next;
  }
  async snapshot() {
    const data = await this.load();
    return JSON.parse(JSON.stringify(data));
  }
};

// src/routes.ts
import { randomUUID } from "crypto";
var PREFIX = "/api/plugins/communication";
var SEVERITIES = ["info", "warning", "critical"];
var MAX_TITLE_CHARS = 200;
var MAX_BODY_CHARS = 5e4;
function newAnnouncementId() {
  return `ann_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
}
function getAuthUser(request) {
  const user = request.user;
  if (typeof user?.id !== "number") return null;
  const role = typeof user.role === "string" ? user.role : "";
  return { id: user.id, role };
}
function isVisibleToRole(ann, role, now) {
  const published = Date.parse(ann.publishedAt);
  if (!Number.isFinite(published) || published > now) return false;
  if (ann.expiresAt) {
    const expires = Date.parse(ann.expiresAt);
    if (Number.isFinite(expires) && expires <= now) return false;
  }
  if (ann.targetRoles && ann.targetRoles.length > 0 && !ann.targetRoles.includes(role)) return false;
  return true;
}
function validateSeverity(value) {
  return typeof value === "string" && SEVERITIES.includes(value) ? value : null;
}
function normalizeTargetRoles(value) {
  if (value === null || value === void 0) return null;
  if (!Array.isArray(value)) return null;
  const cleaned = value.filter((v) => typeof v === "string" && v.length > 0);
  return cleaned.length === 0 ? null : cleaned;
}
function validateIso(value, allowNull) {
  if (value === null) return allowNull ? null : void 0;
  if (typeof value !== "string") return void 0;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return void 0;
  return parsed.toISOString();
}
function validateTitle(value) {
  if (typeof value !== "string" || !value.trim()) return { error: "title is required" };
  if (value.length > MAX_TITLE_CHARS) return { error: `title must be ${MAX_TITLE_CHARS} characters or less` };
  return value.trim();
}
function validateBody(value) {
  if (typeof value !== "string" || !value.trim()) return { error: "body is required" };
  if (value.length > MAX_BODY_CHARS) return { error: `body must be ${MAX_BODY_CHARS} characters or less` };
  return value;
}
function toPublicAnnouncement(ann) {
  return {
    id: ann.id,
    title: ann.title,
    body: ann.body,
    severity: ann.severity,
    publishedAt: ann.publishedAt,
    expiresAt: ann.expiresAt,
    updatedAt: ann.updatedAt
  };
}
async function registerCommunicationRoutes(app, ctx, store) {
  ctx.registerRoutePermission(`GET:${PREFIX}/admin/announcements`, { permission: PERM_ANNOUNCEMENTS_MANAGE });
  ctx.registerRoutePermission(`POST:${PREFIX}/admin/announcements`, { permission: PERM_ANNOUNCEMENTS_MANAGE });
  ctx.registerRoutePermission(`PUT:${PREFIX}/admin/announcements/:id`, { permission: PERM_ANNOUNCEMENTS_MANAGE });
  ctx.registerRoutePermission(`DELETE:${PREFIX}/admin/announcements/:id`, { permission: PERM_ANNOUNCEMENTS_MANAGE });
  app.get("/admin/announcements", async () => {
    const data = await store.snapshot();
    const sorted = [...data.announcements].sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
    return { announcements: sorted };
  });
  app.post("/admin/announcements", async (request, reply) => {
    const { title, body, severity, targetRoles, publishedAt, expiresAt } = request.body ?? {};
    const titleResult = validateTitle(title);
    if (typeof titleResult !== "string") return reply.status(400).send(titleResult);
    const bodyResult = validateBody(body);
    if (typeof bodyResult !== "string") return reply.status(400).send(bodyResult);
    const sev = validateSeverity(severity) ?? "info";
    const pub = validateIso(publishedAt ?? (/* @__PURE__ */ new Date()).toISOString(), false);
    if (pub === void 0) return reply.status(400).send({ error: "Invalid publishedAt" });
    const exp = validateIso(expiresAt ?? null, true);
    if (exp === void 0) return reply.status(400).send({ error: "Invalid expiresAt" });
    if (exp !== null && Date.parse(exp) <= Date.parse(pub)) {
      return reply.status(400).send({ error: "expiresAt must be after publishedAt" });
    }
    let created = null;
    try {
      await store.mutate((data) => {
        const now = (/* @__PURE__ */ new Date()).toISOString();
        const ann = {
          id: newAnnouncementId(),
          title: titleResult,
          body: bodyResult,
          severity: sev,
          targetRoles: normalizeTargetRoles(targetRoles),
          publishedAt: pub,
          expiresAt: exp,
          createdAt: now,
          updatedAt: now
        };
        data.announcements.push(ann);
        created = ann;
      });
    } catch (err) {
      ctx.log.error(`[Communication] Failed to persist new announcement: ${String(err.message)}`);
      return reply.status(500).send({ error: "Failed to persist announcement" });
    }
    if (!created) {
      return reply.status(500).send({ error: "Announcement was not persisted" });
    }
    return reply.status(201).send({ announcement: created });
  });
  app.put("/admin/announcements/:id", async (request, reply) => {
    const { id } = request.params;
    const patch = request.body ?? {};
    let nextTitle;
    let nextBody;
    let nextSeverity;
    let nextPublishedAt;
    let nextExpiresAt;
    let nextTargetRoles;
    if (patch.title !== void 0) {
      const r = validateTitle(patch.title);
      if (typeof r !== "string") return reply.status(400).send(r);
      nextTitle = r;
    }
    if (patch.body !== void 0) {
      const r = validateBody(patch.body);
      if (typeof r !== "string") return reply.status(400).send(r);
      nextBody = r;
    }
    if (patch.severity !== void 0) {
      const sev = validateSeverity(patch.severity);
      if (!sev) return reply.status(400).send({ error: "Invalid severity" });
      nextSeverity = sev;
    }
    if (patch.publishedAt !== void 0) {
      const pub = validateIso(patch.publishedAt, false);
      if (pub === void 0) return reply.status(400).send({ error: "Invalid publishedAt" });
      nextPublishedAt = pub;
    }
    if (patch.expiresAt !== void 0) {
      const exp = validateIso(patch.expiresAt, true);
      if (exp === void 0) return reply.status(400).send({ error: "Invalid expiresAt" });
      nextExpiresAt = exp;
    }
    if (patch.targetRoles !== void 0) {
      nextTargetRoles = normalizeTargetRoles(patch.targetRoles);
    }
    let updated = null;
    try {
      await store.mutate((data) => {
        const ann = data.announcements.find((a) => a.id === id);
        if (!ann) throw new Error("NOT_FOUND");
        if (nextTitle !== void 0) ann.title = nextTitle;
        if (nextBody !== void 0) ann.body = nextBody;
        if (nextSeverity !== void 0) ann.severity = nextSeverity;
        if (nextPublishedAt !== void 0) ann.publishedAt = nextPublishedAt;
        if (nextExpiresAt !== void 0) ann.expiresAt = nextExpiresAt;
        if (nextTargetRoles !== void 0) ann.targetRoles = nextTargetRoles;
        if (ann.expiresAt && Date.parse(ann.expiresAt) <= Date.parse(ann.publishedAt)) {
          throw new Error("EXPIRES_BEFORE_PUBLISH");
        }
        ann.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
        updated = ann;
      });
    } catch (err) {
      const msg = String(err.message);
      if (msg === "NOT_FOUND") return reply.status(404).send({ error: "Announcement not found" });
      if (msg === "EXPIRES_BEFORE_PUBLISH") {
        return reply.status(400).send({ error: "expiresAt must be after publishedAt" });
      }
      ctx.log.error(`[Communication] Failed to update announcement ${id}: ${msg}`);
      return reply.status(500).send({ error: "Failed to persist update" });
    }
    if (!updated) return reply.status(500).send({ error: "Announcement was not updated" });
    return { announcement: updated };
  });
  app.delete("/admin/announcements/:id", async (request, reply) => {
    const { id } = request.params;
    let existed = false;
    await store.mutate((data) => {
      const next = data.announcements.filter((a) => a.id !== id);
      existed = next.length !== data.announcements.length;
      data.announcements = next;
    });
    if (!existed) return reply.status(404).send({ error: "Announcement not found" });
    return { ok: true };
  });
  app.get("/announcements", async (request, reply) => {
    const user = getAuthUser(request);
    if (!user) return reply.status(401).send({ error: "Unauthorized" });
    const data = await store.snapshot();
    const now = Date.now();
    const visible = data.announcements.filter((a) => isVisibleToRole(a, user.role, now)).sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt)).map(toPublicAnnouncement);
    return { announcements: visible, serverTime: new Date(now).toISOString() };
  });
}

// src/index.ts
var __dirname = dirname(fileURLToPath(import.meta.url));
var manifestPath = join2(__dirname, "..", "manifest.json");
async function register(ctx) {
  const manifest = JSON.parse(await readFile2(manifestPath, "utf-8"));
  for (const perm of PERMISSIONS) {
    ctx.registerPluginPermission(perm.key, perm.description);
  }
  const store = new CommunicationStore(ctx);
  await store.load();
  const registerRoutes = async (app) => {
    await registerCommunicationRoutes(app, ctx, store);
  };
  return {
    manifest,
    async registerRoutes(app) {
      await registerRoutes(app, ctx);
    }
  };
}
export {
  register
};
//# sourceMappingURL=index.js.map
