import type { FastifyInstance } from 'fastify';

export interface PluginLogger {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
}

export interface PluginUser {
  id: number;
  email: string;
  displayName: string | null;
  role: string;
}

export interface PluginContext {
  log: PluginLogger;
  getUser(userId: number): Promise<PluginUser | null>;
  getPluginDataDir(): Promise<string>;
  registerPluginPermission(permission: string, description?: string): void;
  registerRoutePermission(routeKey: string, rule: { permission: string; ownerScoped?: boolean }): void;
}

export type Severity = 'info' | 'warning' | 'critical';

export interface Announcement {
  id: string;
  title: string;
  body: string;
  severity: Severity;
  /** null = visible to every authenticated user. Otherwise, only users whose role is in this list see it. */
  targetRoles: string[] | null;
  /** ISO string. May be in the future (scheduled). */
  publishedAt: string;
  /** ISO string or null. When set and `now > expiresAt`, the announcement is hidden from users. */
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CommunicationStoreData {
  version: number;
  announcements: Announcement[];
}

export type RegisterRoutes = (app: FastifyInstance, ctx: PluginContext) => Promise<void> | void;
