import { useEffect, useRef, useState } from 'react';
import { X, Eye, Pencil } from 'lucide-react';
import { api, fetchRoles, type Announcement, type AnnouncementInput, type Role, type Severity } from '../api';
import { SEVERITY_META, isoToDatetimeLocal, datetimeLocalToIso } from '../shared';
import { MarkdownContent } from '../MarkdownContent';

type Mode = 'create' | 'edit';

interface Props {
  mode: Mode;
  initial: Announcement | null;
  onClose: () => void;
  onSaved: () => void;
}

interface FormState {
  title: string;
  body: string;
  severity: Severity;
  everyone: boolean;
  targetRoles: Set<string>;
  publishedAt: string;
  expiresAt: string;
}

function buildInitialForm(initial: Announcement | null): FormState {
  if (!initial) {
    return {
      title: '',
      body: '',
      severity: 'info',
      everyone: true,
      targetRoles: new Set(),
      publishedAt: isoToDatetimeLocal(new Date().toISOString()),
      expiresAt: '',
    };
  }
  return {
    title: initial.title,
    body: initial.body,
    severity: initial.severity,
    everyone: !initial.targetRoles || initial.targetRoles.length === 0,
    targetRoles: new Set(initial.targetRoles ?? []),
    publishedAt: isoToDatetimeLocal(initial.publishedAt),
    expiresAt: initial.expiresAt ? isoToDatetimeLocal(initial.expiresAt) : '',
  };
}

export function AnnouncementEditor({ mode, initial, onClose, onSaved }: Props) {
  const [form, setForm] = useState<FormState>(() => buildInitialForm(initial));
  const [roles, setRoles] = useState<Role[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'edit' | 'preview'>('edit');
  const mouseDownOnBackdropRef = useRef(false);

  useEffect(() => {
    fetchRoles()
      .then((r) => setRoles(r))
      .catch(() => setRoles([]));
  }, []);

  const toggleRole = (name: string) => {
    setForm((prev) => {
      const next = new Set(prev.targetRoles);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return { ...prev, targetRoles: next };
    });
  };

  const save = async () => {
    if (!form.title.trim() || !form.body.trim()) {
      setError('Title and body are required');
      return;
    }
    const publishedIso = datetimeLocalToIso(form.publishedAt) ?? new Date().toISOString();
    const expiresIso = form.expiresAt ? datetimeLocalToIso(form.expiresAt) : null;
    if (form.expiresAt && !expiresIso) {
      setError('Invalid expiration date');
      return;
    }
    if (expiresIso && Date.parse(expiresIso) <= Date.parse(publishedIso)) {
      setError('Expiration must be after publication');
      return;
    }

    const payload: AnnouncementInput = {
      title: form.title.trim(),
      body: form.body,
      severity: form.severity,
      targetRoles: form.everyone ? null : Array.from(form.targetRoles),
      publishedAt: publishedIso,
      expiresAt: expiresIso,
    };

    setSaving(true);
    setError(null);
    try {
      if (mode === 'create') {
        await api.create(payload);
      } else if (initial) {
        await api.update(initial.id, payload);
      }
      onSaved();
    } catch (err) {
      setError(String((err as Error).message));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in p-4"
      onMouseDown={(e) => { mouseDownOnBackdropRef.current = e.target === e.currentTarget; }}
      onClick={(e) => {
        if (saving) return;
        if (e.target !== e.currentTarget) return;
        if (!mouseDownOnBackdropRef.current) return;
        onClose();
      }}
    >
      <div
        className="card w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 p-5 border-b border-white/5">
          <div>
            <h3 className="text-base font-bold text-ndp-text">
              {mode === 'create' ? 'New announcement' : 'Edit announcement'}
            </h3>
            <p className="text-xs text-ndp-text-dim mt-0.5">
              Markdown is rendered for users. Links, lists, headings, bold and italic are supported.
            </p>
          </div>
          <button
            onClick={() => !saving && onClose()}
            className="p-1 -mt-1 -mr-1 rounded-lg text-ndp-text-dim hover:text-ndp-text hover:bg-white/5 transition-colors flex-shrink-0"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <label className="block">
            <span className="text-xs font-medium text-ndp-text-dim uppercase tracking-wider">Title</span>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="mt-1.5 w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-ndp-text focus:outline-none focus:ring-2 focus:ring-ndp-accent/40"
              placeholder="Scheduled maintenance"
              disabled={saving}
            />
          </label>

          <div>
            <span className="text-xs font-medium text-ndp-text-dim uppercase tracking-wider">Severity</span>
            <div className="mt-1.5 flex gap-2">
              {(['info', 'warning', 'critical'] as Severity[]).map((s) => {
                const selected = form.severity === s;
                return (
                  <button
                    key={s}
                    onClick={() => setForm({ ...form, severity: s })}
                    disabled={saving}
                    className={
                      'px-3 py-1.5 rounded-lg text-xs font-medium transition-all ' +
                      (selected
                        ? SEVERITY_META[s].chip + ' ring-1 ring-white/15'
                        : 'bg-white/5 text-ndp-text-dim hover:bg-white/10')
                    }
                    type="button"
                  >
                    {SEVERITY_META[s].label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <span className="text-xs font-medium text-ndp-text-dim uppercase tracking-wider">Audience</span>
            <div className="mt-1.5 space-y-2">
              <label className="flex items-center gap-2 text-sm text-ndp-text">
                <input
                  type="radio"
                  checked={form.everyone}
                  onChange={() => setForm({ ...form, everyone: true })}
                  disabled={saving}
                />
                Everyone (all authenticated users)
              </label>
              <label className="flex items-center gap-2 text-sm text-ndp-text">
                <input
                  type="radio"
                  checked={!form.everyone}
                  onChange={() => setForm({ ...form, everyone: false })}
                  disabled={saving}
                />
                Specific roles
              </label>
              {!form.everyone && (
                <div className="flex flex-wrap gap-2 mt-2 pl-6">
                  {roles.length === 0 && (
                    <span className="text-xs text-ndp-text-dim">Loading roles…</span>
                  )}
                  {roles.map((r) => {
                    const on = form.targetRoles.has(r.name);
                    return (
                      <button
                        key={r.name}
                        onClick={() => toggleRole(r.name)}
                        type="button"
                        disabled={saving}
                        className={
                          'px-3 py-1 rounded-full text-xs font-medium transition-all ' +
                          (on
                            ? 'bg-ndp-accent/20 text-ndp-accent ring-1 ring-ndp-accent/40'
                            : 'bg-white/5 text-ndp-text-dim hover:bg-white/10')
                        }
                      >
                        {r.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block">
              <span className="text-xs font-medium text-ndp-text-dim uppercase tracking-wider">Published at</span>
              <input
                type="datetime-local"
                value={form.publishedAt}
                onChange={(e) => setForm({ ...form, publishedAt: e.target.value })}
                className="mt-1.5 w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-ndp-text focus:outline-none focus:ring-2 focus:ring-ndp-accent/40"
                disabled={saving}
              />
              <span className="text-xs text-ndp-text-dim mt-1 block">Set in the future to schedule.</span>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-ndp-text-dim uppercase tracking-wider">Expires at (optional)</span>
              <input
                type="datetime-local"
                value={form.expiresAt}
                onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
                className="mt-1.5 w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-ndp-text focus:outline-none focus:ring-2 focus:ring-ndp-accent/40"
                disabled={saving}
              />
              <span className="text-xs text-ndp-text-dim mt-1 block">Empty = never expires.</span>
            </label>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-medium text-ndp-text-dim uppercase tracking-wider">Body (markdown)</span>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => setTab('edit')}
                  className={
                    'flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-colors ' +
                    (tab === 'edit' ? 'bg-white/10 text-ndp-text' : 'text-ndp-text-dim hover:bg-white/5')
                  }
                >
                  <Pencil className="w-3 h-3" />
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => setTab('preview')}
                  className={
                    'flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-colors ' +
                    (tab === 'preview' ? 'bg-white/10 text-ndp-text' : 'text-ndp-text-dim hover:bg-white/5')
                  }
                >
                  <Eye className="w-3 h-3" />
                  Preview
                </button>
              </div>
            </div>
            {tab === 'edit' ? (
              <textarea
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
                rows={10}
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-ndp-text font-mono focus:outline-none focus:ring-2 focus:ring-ndp-accent/40"
                placeholder={'# Heading\n\nWrite your announcement here. [Link](https://example.com)'}
                disabled={saving}
              />
            ) : (
              <div className="min-h-[14rem] px-4 py-3 bg-white/[0.03] border border-white/10 rounded-lg text-sm text-ndp-text">
                {form.body.trim() ? (
                  <MarkdownContent source={form.body} />
                ) : (
                  <span className="text-ndp-text-dim italic">Nothing to preview.</span>
                )}
              </div>
            )}
          </div>

          {error && (
            <div className="text-sm text-ndp-danger bg-ndp-danger/10 border border-ndp-danger/20 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 p-5 border-t border-white/5">
          <button
            onClick={() => !saving && onClose()}
            disabled={saving}
            className="btn-secondary text-sm disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="btn-primary text-sm disabled:opacity-50"
          >
            {saving ? 'Saving…' : mode === 'create' ? 'Publish' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
