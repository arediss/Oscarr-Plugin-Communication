const BASE = '/api/plugins/communication';

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let message = res.statusText;
    try {
      const data = (await res.json()) as { error?: string };
      if (data.error) message = data.error;
    } catch { /* ignore */ }
    throw new Error(message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export type Severity = 'info' | 'warning' | 'critical';

export interface Announcement {
  id: string;
  title: string;
  body: string;
  severity: Severity;
  targetRoles: string[] | null;
  publishedAt: string;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AnnouncementInput {
  title: string;
  body: string;
  severity: Severity;
  targetRoles: string[] | null;
  publishedAt: string;
  expiresAt: string | null;
}

export interface Role {
  name: string;
}

export async function fetchRoles(): Promise<Role[]> {
  const res = await fetch('/api/admin/roles', { credentials: 'include' });
  if (!res.ok) throw new Error(`Failed to load roles (${res.status})`);
  const data = (await res.json()) as Role[] | { roles?: Role[] };
  return Array.isArray(data) ? data : data.roles ?? [];
}

export const api = {
  listAdmin: () => request<{ announcements: Announcement[] }>('GET', '/admin/announcements'),
  create: (payload: AnnouncementInput) =>
    request<{ announcement: Announcement }>('POST', '/admin/announcements', payload),
  update: (id: string, patch: Partial<AnnouncementInput>) =>
    request<{ announcement: Announcement }>('PUT', `/admin/announcements/${id}`, patch),
  remove: (id: string) => request<{ ok: true }>('DELETE', `/admin/announcements/${id}`),

  listVisible: () =>
    request<{ announcements: Announcement[]; serverTime: string }>('GET', '/announcements'),
};
