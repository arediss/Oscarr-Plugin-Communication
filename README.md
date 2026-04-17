# Oscarr Plugin — Communication

A zero-dependency-on-external-services announcement broadcaster for [Oscarr](https://github.com/arediss/Oscarr). Write markdown announcements in the admin panel, target specific roles (or everyone), schedule them for later, and users see a megaphone icon with an unread badge in the header — click, read, done.

No email, no Slack, no push provider. All data lives in a single JSON file under the Oscarr data directory.

## Features

- **Markdown** — headings, bold, italic, lists, links, code. HTML and `<img>` are stripped; output sanitized with DOMPurify and external links auto-rewritten with `target="_blank" rel="noopener noreferrer"` via a DOMPurify hook.
- **Targeting** — broadcast to every authenticated user, or restrict to one or more roles.
- **Severity** — three levels: `info` / `warning` / `critical`. Each announcement gets a colored gradient hero header (sky / amber / rose) with the title centered.
- **Scheduled publish** — set `publishedAt` in the future; the announcement only becomes visible once the date passes. No cron needed — it's a live filter.
- **Optional expiration** — set `expiresAt` to auto-hide an announcement after a given date. Leave empty to never expire.
- **Unread tracking** — purely client-side: a per-announcement read state (keyed by `id` + `updatedAt`) is stored in `localStorage`. New = never seen on this browser. Edited = `updatedAt` changes, becomes unread again. Deleted = entry pruned automatically.
- **Admin UI** — one list view with create / edit / delete. Live markdown preview in the editor with severity / audience / scheduling controls.
- **No server-side read state** — zero per-user DB rows, zero RGPD footprint. The user-facing list endpoint also strips admin-only fields (`targetRoles`, `createdAt`) before serving.

## Requirements

- **Oscarr core** with plugin API `v1` exposing these ctx methods: `log`, `getPluginDataDir`, `registerPluginPermission`, `registerRoutePermission`.
- **Node 20+** with native `fetch` and ESM support.

### Core endpoint consumed by the frontend

- `GET /api/admin/roles` — list RBAC roles for the audience picker in the editor.

## Install

1. Clone anywhere you like:
   ```bash
   git clone https://github.com/arediss/Oscarr-Plugin-Communication.git
   cd Oscarr-Plugin-Communication
   npm install
   npm run build
   ```

2. Symlink (or copy) the folder into your Oscarr instance's plugins directory:
   ```bash
   ln -s /absolute/path/to/Oscarr-Plugin-Communication /absolute/path/to/oscarr/packages/plugins/communication
   ```

3. Restart the Oscarr backend — the loader discovers the new plugin and mounts its routes at `/api/plugins/communication`.

4. Visit **Admin → Plugins**, confirm the plugin is enabled.

5. Visit **Admin → Communication** and create your first announcement.

## Data & uninstall

All data is stored at `<oscarr>/packages/backend/data/plugins/communication/data.json`.

To uninstall:
1. Remove the symlink from `packages/plugins/`.
2. Restart the Oscarr backend.
3. Optional: delete `<oscarr>/packages/backend/data/plugins/communication/` to drop historical data, and delete the `PluginState` row for `communication` to drop plugin enable state.

Nothing else is persisted — no Prisma tables, no schema migrations to roll back.

## Data model

`data.json`:

```jsonc
{
  "version": 1,
  "announcements": [
    {
      "id": "ann_xxxx",
      "title": "Scheduled maintenance",
      "body": "# Downtime on Sunday\n\nWe'll be offline **03:00 → 04:00 UTC**.",
      "severity": "warning",
      "targetRoles": null,
      "publishedAt": "2026-04-17T09:00:00.000Z",
      "expiresAt": "2026-04-18T00:00:00.000Z",
      "createdAt": "2026-04-16T12:00:00.000Z",
      "updatedAt": "2026-04-16T12:00:00.000Z"
    }
  ]
}
```

- `severity`: `"info" | "warning" | "critical"`.
- `targetRoles`: `null` = everyone. Otherwise a list of RBAC role names.
- `publishedAt`: ISO string. If it's in the future, the announcement is **scheduled** — admins see it, users don't.
- `expiresAt`: ISO string or `null`. Past this date, users don't see it anymore.

Writes are serialized in-memory and persisted via `tmp` + `rename()` so a crash mid-write cannot leave a truncated file. A corrupted `data.json` is renamed to `data.json.corrupt-<ts>` on the next load and the store is reinitialized empty (with a loud log).

## Permissions

Declared via `ctx.registerPluginPermission`:

| Permission | Scope |
|---|---|
| `communication.announcements.manage` | Create / edit / delete announcements |

`/api/plugins/communication/announcements` inherits the default `/api/plugins/*` rule (any authenticated user can read announcements visible to their role).

## Unread badge

Per-browser, per-user:

- Storage key: `oscarr:plugin-communication:readMap:<userId>` (`localStorage`)
- Value: `{ [announcementId]: updatedAt }` — JSON map
- Unread = any announcement whose id is missing from the map, or whose `updatedAt` differs from the stored value (i.e. it was edited since last view)

Implications:
- Users on a new device see all currently-visible announcements as unread.
- Deleting an announcement immediately removes it from everyone's list (entry is pruned from the map on next sync).
- An admin who edits an announcement (typo fix, content update) will re-trigger the unread badge for everyone.
- No server-side per-user read state, so no privacy implications and no DB bloat.

## Validation limits

- Title: ≤ 200 characters.
- Body: ≤ 50 000 characters (markdown source).
- Severity: must be one of `info` / `warning` / `critical`.
- `expiresAt` must be after `publishedAt` if set.

## Known limitations

- Unread state is per-browser, not per-account — switching device resets it.
- The list endpoint is fetched on mount and every 5 minutes (skipped when the tab isn't visible) — not real-time push.
- Markdown rendering uses `marked` + `DOMPurify`. HTML tags and `<img>` are stripped (admins can't smuggle a tracking pixel) — only the standard markdown subset + links is rendered.
- No i18n for admin UI copy — English only.

## Development

```bash
npm install
npm run dev   # esbuild watch mode
```

Sources in `src/` (backend) and `frontend/` (admin + header hook). `npm run build` produces:
- `dist/index.js` — backend entry
- `dist/frontend/index.js` — admin tab bundle
- `dist/frontend/hooks/header.actions.js` — header megaphone bundle

## License

MIT.
