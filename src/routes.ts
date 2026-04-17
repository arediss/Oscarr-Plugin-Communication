import { randomUUID } from 'crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { PluginContext, Announcement, Severity } from './types.js';
import type { CommunicationStore } from './storage.js';
import { PERM_ANNOUNCEMENTS_MANAGE } from './permissions.js';

const PREFIX = '/api/plugins/communication';
const SEVERITIES: Severity[] = ['info', 'warning', 'critical'];
const MAX_TITLE_CHARS = 200;
const MAX_BODY_CHARS = 50_000;

function newAnnouncementId(): string {
  return `ann_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

function getAuthUser(request: FastifyRequest): { id: number; role: string } | null {
  const user = (request as unknown as { user?: { id?: number; role?: string } }).user;
  if (typeof user?.id !== 'number') return null;
  const role = typeof user.role === 'string' ? user.role : '';
  return { id: user.id, role };
}

function isVisibleToRole(ann: Announcement, role: string, now: number): boolean {
  const published = Date.parse(ann.publishedAt);
  if (!Number.isFinite(published) || published > now) return false;
  if (ann.expiresAt) {
    const expires = Date.parse(ann.expiresAt);
    if (Number.isFinite(expires) && expires <= now) return false;
  }
  if (ann.targetRoles && ann.targetRoles.length > 0 && !ann.targetRoles.includes(role)) return false;
  return true;
}

function validateSeverity(value: unknown): Severity | null {
  return typeof value === 'string' && (SEVERITIES as string[]).includes(value) ? (value as Severity) : null;
}

function normalizeTargetRoles(value: unknown): string[] | null {
  if (value === null || value === undefined) return null;
  if (!Array.isArray(value)) return null;
  const cleaned = value.filter((v): v is string => typeof v === 'string' && v.length > 0);
  return cleaned.length === 0 ? null : cleaned;
}

function validateIso(value: unknown, allowNull: boolean): string | null | undefined {
  if (value === null) return allowNull ? null : undefined;
  if (typeof value !== 'string') return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString();
}

function validateTitle(value: unknown): string | { error: string } {
  if (typeof value !== 'string' || !value.trim()) return { error: 'title is required' };
  if (value.length > MAX_TITLE_CHARS) return { error: `title must be ${MAX_TITLE_CHARS} characters or less` };
  return value.trim();
}

function validateBody(value: unknown): string | { error: string } {
  if (typeof value !== 'string' || !value.trim()) return { error: 'body is required' };
  if (value.length > MAX_BODY_CHARS) return { error: `body must be ${MAX_BODY_CHARS} characters or less` };
  return value;
}

/** Strip admin-only fields before sending to non-admins — `targetRoles` would otherwise leak the RBAC structure. */
function toPublicAnnouncement(ann: Announcement) {
  return {
    id: ann.id,
    title: ann.title,
    body: ann.body,
    severity: ann.severity,
    publishedAt: ann.publishedAt,
    expiresAt: ann.expiresAt,
    updatedAt: ann.updatedAt,
  };
}

export async function registerCommunicationRoutes(
  app: FastifyInstance,
  ctx: PluginContext,
  store: CommunicationStore
): Promise<void> {
  ctx.registerRoutePermission(`GET:${PREFIX}/admin/announcements`, { permission: PERM_ANNOUNCEMENTS_MANAGE });
  ctx.registerRoutePermission(`POST:${PREFIX}/admin/announcements`, { permission: PERM_ANNOUNCEMENTS_MANAGE });
  ctx.registerRoutePermission(`PUT:${PREFIX}/admin/announcements/:id`, { permission: PERM_ANNOUNCEMENTS_MANAGE });
  ctx.registerRoutePermission(`DELETE:${PREFIX}/admin/announcements/:id`, { permission: PERM_ANNOUNCEMENTS_MANAGE });

  // GET /announcements inherits the default /api/plugins/* = AUTH rule.

  app.get('/admin/announcements', async () => {
    const data = await store.snapshot();
    const sorted = [...data.announcements].sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
    return { announcements: sorted };
  });

  app.post<{
    Body: {
      title?: string;
      body?: string;
      severity?: string;
      targetRoles?: string[] | null;
      publishedAt?: string;
      expiresAt?: string | null;
    };
  }>('/admin/announcements', async (request, reply) => {
    const { title, body, severity, targetRoles, publishedAt, expiresAt } = request.body ?? {};

    const titleResult = validateTitle(title);
    if (typeof titleResult !== 'string') return reply.status(400).send(titleResult);
    const bodyResult = validateBody(body);
    if (typeof bodyResult !== 'string') return reply.status(400).send(bodyResult);

    const sev = validateSeverity(severity) ?? 'info';
    const pub = validateIso(publishedAt ?? new Date().toISOString(), false);
    if (pub === undefined) return reply.status(400).send({ error: 'Invalid publishedAt' });
    const exp = validateIso(expiresAt ?? null, true);
    if (exp === undefined) return reply.status(400).send({ error: 'Invalid expiresAt' });
    if (exp !== null && Date.parse(exp as string) <= Date.parse(pub as string)) {
      return reply.status(400).send({ error: 'expiresAt must be after publishedAt' });
    }

    let created: Announcement | null = null;
    try {
      await store.mutate((data) => {
        const now = new Date().toISOString();
        const ann: Announcement = {
          id: newAnnouncementId(),
          title: titleResult,
          body: bodyResult,
          severity: sev,
          targetRoles: normalizeTargetRoles(targetRoles),
          publishedAt: pub as string,
          expiresAt: exp as string | null,
          createdAt: now,
          updatedAt: now,
        };
        data.announcements.push(ann);
        created = ann;
      });
    } catch (err) {
      ctx.log.error(`[Communication] Failed to persist new announcement: ${String((err as Error).message)}`);
      return reply.status(500).send({ error: 'Failed to persist announcement' });
    }

    if (!created) {
      return reply.status(500).send({ error: 'Announcement was not persisted' });
    }
    return reply.status(201).send({ announcement: created });
  });

  app.put<{
    Params: { id: string };
    Body: Partial<{
      title: string;
      body: string;
      severity: string;
      targetRoles: string[] | null;
      publishedAt: string;
      expiresAt: string | null;
    }>;
  }>('/admin/announcements/:id', async (request, reply) => {
    const { id } = request.params;
    const patch = request.body ?? {};

    // Validate up-front so a rejected patch doesn't trigger a no-op disk write.
    let nextTitle: string | undefined;
    let nextBody: string | undefined;
    let nextSeverity: Severity | undefined;
    let nextPublishedAt: string | undefined;
    let nextExpiresAt: string | null | undefined;
    let nextTargetRoles: string[] | null | undefined;

    if (patch.title !== undefined) {
      const r = validateTitle(patch.title);
      if (typeof r !== 'string') return reply.status(400).send(r);
      nextTitle = r;
    }
    if (patch.body !== undefined) {
      const r = validateBody(patch.body);
      if (typeof r !== 'string') return reply.status(400).send(r);
      nextBody = r;
    }
    if (patch.severity !== undefined) {
      const sev = validateSeverity(patch.severity);
      if (!sev) return reply.status(400).send({ error: 'Invalid severity' });
      nextSeverity = sev;
    }
    if (patch.publishedAt !== undefined) {
      const pub = validateIso(patch.publishedAt, false);
      if (pub === undefined) return reply.status(400).send({ error: 'Invalid publishedAt' });
      nextPublishedAt = pub as string;
    }
    if (patch.expiresAt !== undefined) {
      const exp = validateIso(patch.expiresAt, true);
      if (exp === undefined) return reply.status(400).send({ error: 'Invalid expiresAt' });
      nextExpiresAt = exp;
    }
    if (patch.targetRoles !== undefined) {
      nextTargetRoles = normalizeTargetRoles(patch.targetRoles);
    }

    let updated: Announcement | null = null;
    try {
      await store.mutate((data) => {
        const ann = data.announcements.find((a) => a.id === id);
        if (!ann) throw new Error('NOT_FOUND');

        if (nextTitle !== undefined) ann.title = nextTitle;
        if (nextBody !== undefined) ann.body = nextBody;
        if (nextSeverity !== undefined) ann.severity = nextSeverity;
        if (nextPublishedAt !== undefined) ann.publishedAt = nextPublishedAt;
        if (nextExpiresAt !== undefined) ann.expiresAt = nextExpiresAt;
        if (nextTargetRoles !== undefined) ann.targetRoles = nextTargetRoles;

        if (ann.expiresAt && Date.parse(ann.expiresAt) <= Date.parse(ann.publishedAt)) {
          throw new Error('EXPIRES_BEFORE_PUBLISH');
        }

        ann.updatedAt = new Date().toISOString();
        updated = ann;
      });
    } catch (err) {
      const msg = String((err as Error).message);
      if (msg === 'NOT_FOUND') return reply.status(404).send({ error: 'Announcement not found' });
      if (msg === 'EXPIRES_BEFORE_PUBLISH') {
        return reply.status(400).send({ error: 'expiresAt must be after publishedAt' });
      }
      ctx.log.error(`[Communication] Failed to update announcement ${id}: ${msg}`);
      return reply.status(500).send({ error: 'Failed to persist update' });
    }

    if (!updated) return reply.status(500).send({ error: 'Announcement was not updated' });
    return { announcement: updated };
  });

  app.delete<{ Params: { id: string } }>('/admin/announcements/:id', async (request, reply) => {
    const { id } = request.params;
    let existed = false;
    await store.mutate((data) => {
      const next = data.announcements.filter((a) => a.id !== id);
      existed = next.length !== data.announcements.length;
      data.announcements = next;
    });
    if (!existed) return reply.status(404).send({ error: 'Announcement not found' });
    return { ok: true };
  });

  app.get('/announcements', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = getAuthUser(request);
    if (!user) return reply.status(401).send({ error: 'Unauthorized' });
    const data = await store.snapshot();
    const now = Date.now();
    const visible = data.announcements
      .filter((a) => isVisibleToRole(a, user.role, now))
      .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
      .map(toPublicAnnouncement);
    return { announcements: visible, serverTime: new Date(now).toISOString() };
  });
}
