import { useEffect, useState } from 'react';
import { Megaphone, Plus, Pencil, Trash2, Calendar, Users, Info, AlertTriangle, CircleAlert } from 'lucide-react';
import { api, type Announcement, type Severity } from './api';
import { SEVERITY_META, announcementStatus, formatDateTime } from './shared';
import { AnnouncementEditor } from './admin/AnnouncementEditor';
import { ConfirmModal } from './ConfirmModal';

interface EditState {
  mode: 'create' | 'edit';
  initial: Announcement | null;
}

const SEVERITY_ICON: Record<Severity, typeof Info> = {
  info: Info,
  warning: AlertTriangle,
  critical: CircleAlert,
};

const STATUS_META: Record<'scheduled' | 'live' | 'expired', { label: string; chip: string }> = {
  scheduled: { label: 'Scheduled', chip: 'bg-indigo-500/15 text-indigo-300' },
  live:      { label: 'Live',      chip: 'bg-emerald-500/15 text-emerald-300' },
  expired:   { label: 'Expired',   chip: 'bg-white/5 text-ndp-text-dim' },
};

export default function CommunicationAdmin() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditState | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Announcement | null>(null);
  const [deleting, setDeleting] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const { announcements: list } = await api.listAdmin();
      setAnnouncements(list);
      setError(null);
    } catch (err) {
      setError(String((err as Error).message));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    setDeleting(true);
    try {
      await api.remove(deleteConfirm.id);
      setDeleteConfirm(null);
      await refresh();
    } catch (err) {
      setError(String((err as Error).message));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ndp-text">Communication</h1>
          <p className="text-xs text-ndp-text-dim">Broadcast markdown announcements to your users, optionally targeted by role.</p>
        </div>
        <button
          onClick={() => setEditing({ mode: 'create', initial: null })}
          className="btn-primary flex items-center gap-2 text-sm"
        >
          <Plus className="w-4 h-4" />
          New announcement
        </button>
      </div>

      {error && (
        <div className="text-sm text-ndp-danger bg-ndp-danger/10 border border-ndp-danger/20 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {loading && (
        <div className="text-sm text-ndp-text-dim">Loading…</div>
      )}

      {!loading && announcements.length === 0 && (
        <div className="card p-8 text-center">
          <Megaphone className="w-10 h-10 text-ndp-text-dim mx-auto" />
          <h3 className="mt-3 text-sm font-semibold text-ndp-text">No announcements yet</h3>
          <p className="mt-1 text-xs text-ndp-text-dim">Create your first announcement to broadcast a message to your users.</p>
        </div>
      )}

      {!loading && announcements.length > 0 && (
        <div className="space-y-3">
          {announcements.map((a) => {
            const status = announcementStatus(a.publishedAt, a.expiresAt);
            const sev = SEVERITY_META[a.severity];
            const SevIcon = SEVERITY_ICON[a.severity];
            return (
              <div
                key={a.id}
                className={`card p-4 border-l-4 ${sev.leftBorder}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <SevIcon className={`w-4 h-4 ${sev.iconColor}`} />
                      <h3 className="text-sm font-semibold text-ndp-text truncate">{a.title}</h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${sev.chip}`}>{sev.label}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_META[status].chip}`}>
                        {STATUS_META[status].label}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 mt-2 text-xs text-ndp-text-dim flex-wrap">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {status === 'scheduled' ? 'Publishes ' : 'Published '}
                        {formatDateTime(a.publishedAt)}
                      </span>
                      {a.expiresAt && (
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          Expires {formatDateTime(a.expiresAt)}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        {a.targetRoles && a.targetRoles.length > 0
                          ? a.targetRoles.join(', ')
                          : 'Everyone'}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => setEditing({ mode: 'edit', initial: a })}
                      className="p-2 rounded-lg text-ndp-text-dim hover:text-ndp-text hover:bg-white/5 transition-colors"
                      title="Edit"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(a)}
                      className="p-2 rounded-lg text-ndp-text-dim hover:text-ndp-danger hover:bg-ndp-danger/10 transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <AnnouncementEditor
          mode={editing.mode}
          initial={editing.initial}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
        />
      )}

      <ConfirmModal
        open={!!deleteConfirm}
        title="Delete announcement?"
        message={`"${deleteConfirm?.title ?? ''}" will be removed immediately.`}
        description="Users who have already opened their inbox won't see it again on refresh."
        confirmLabel="Delete"
        variant="danger"
        busy={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteConfirm(null)}
      />
    </div>
  );
}
