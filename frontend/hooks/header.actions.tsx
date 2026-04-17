import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Megaphone, X } from 'lucide-react';
import { api, type Announcement } from '../api';
import { SEVERITY_META, formatDateTime } from '../shared';
import { MarkdownContent } from '../MarkdownContent';

interface Props {
  context?: { user?: { id?: number } };
}

const POLL_MS = 5 * 60 * 1000;

type ReadMap = Record<string, string>;

function storageKey(userId: number | undefined): string {
  return `oscarr:plugin-communication:readMap:${userId ?? 'anon'}`;
}

function readReadMap(userId: number | undefined): ReadMap {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const out: ReadMap = {};
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof v === 'string') out[k] = v;
      }
      return out;
    }
    return {};
  } catch {
    return {};
  }
}

function writeReadMap(userId: number | undefined, map: ReadMap) {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

function pruneReadMap(map: ReadMap, visibleIds: Set<string>): ReadMap {
  const out: ReadMap = {};
  for (const [id, ts] of Object.entries(map)) {
    if (visibleIds.has(id)) out[id] = ts;
  }
  return out;
}

export default function CommunicationHeaderAction({ context }: Props) {
  const userId = context?.user?.id;
  const [open, setOpen] = useState(false);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(false);
  const [readMap, setReadMap] = useState<ReadMap>(() => readReadMap(userId));
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const mouseDownOnBackdropRef = useRef(false);

  const fetchAnnouncements = useCallback(async () => {
    setLoading(true);
    try {
      const { announcements: list } = await api.listVisible();
      setAnnouncements(list);
    } catch {
      setAnnouncements([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAnnouncements();
    // Skip polling when the tab isn't visible — most users don't open the
    // overlay, so an unconditional 5-min interval is wasted bandwidth at scale.
    const id = setInterval(() => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') {
        fetchAnnouncements();
      }
    }, POLL_MS);
    return () => clearInterval(id);
  }, [fetchAnnouncements]);

  useEffect(() => {
    setReadMap(readReadMap(userId));
  }, [userId]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open || announcements.length === 0) return;
    setReadMap((prev) => {
      const next: ReadMap = { ...prev };
      let changed = false;
      for (const a of announcements) {
        if (next[a.id] !== a.updatedAt) {
          next[a.id] = a.updatedAt;
          changed = true;
        }
      }
      if (!changed) return prev;
      const pruned = pruneReadMap(next, new Set(announcements.map((a) => a.id)));
      writeReadMap(userId, pruned);
      return pruned;
    });
  }, [open, announcements, userId]);

  const unreadCount = useMemo(
    () => announcements.filter((a) => readMap[a.id] !== a.updatedAt).length,
    [announcements, readMap]
  );

  const handleOpen = () => {
    setOpen(true);
    fetchAnnouncements();
  };

  const handleClose = () => setOpen(false);

  return (
    <>
      <button
        onClick={handleOpen}
        className="relative p-2 rounded-xl hover:bg-white/5 transition-colors"
        title="Announcements"
        aria-label="Announcements"
      >
        <Megaphone className="w-5 h-5 text-ndp-text-muted" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 min-w-[1rem] h-4 px-1 rounded-full bg-ndp-accent text-[10px] font-bold text-white flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <button
            onClick={handleClose}
            className="fixed top-6 right-6 z-[60] p-2.5 rounded-full bg-white/5 hover:bg-white/10 backdrop-blur-md text-white/70 hover:text-white transition-colors border border-white/10"
            aria-label="Close announcements"
          >
            <X className="w-5 h-5" />
          </button>

          <div
            ref={overlayRef}
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md animate-fade-in overflow-y-auto"
            onMouseDown={() => { mouseDownOnBackdropRef.current = true; }}
            onClick={() => {
              if (!mouseDownOnBackdropRef.current) return;
              mouseDownOnBackdropRef.current = false;
              handleClose();
            }}
          >
            <div className="min-h-full flex items-start justify-center px-4 py-16">
              <div className="w-full max-w-3xl">
              {loading && announcements.length === 0 && (
                <div className="flex items-center justify-center py-16">
                  <div className="w-6 h-6 border-2 border-ndp-accent/30 border-t-ndp-accent rounded-full animate-spin" />
                </div>
              )}

              {!loading && announcements.length === 0 && (
                <div className="text-center py-16">
                  <Megaphone className="w-12 h-12 text-white/20 mx-auto mb-4" />
                  <p className="text-sm text-white/50">No announcements right now.</p>
                </div>
              )}

                {announcements.length > 0 && (
                  <div className="space-y-4">
                    {announcements.map((a) => (
                      <AnnouncementFrame
                        key={a.id}
                        announcement={a}
                        isUnread={readMap[a.id] !== a.updatedAt}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}

function AnnouncementFrame({
  announcement,
  isUnread,
}: {
  announcement: Announcement;
  isUnread: boolean;
}) {
  const sev = SEVERITY_META[announcement.severity];

  // Severity-tinted hero band: a diagonal color-to-color wash (never transparent so the
  // surface bg can't bleed through as grey), plus two soft highlight accents and a
  // subtle bottom darkening to seat the band against the body.
  const headerBg = `
    linear-gradient(180deg, transparent 70%, rgba(0, 0, 0, 0.2) 100%),
    radial-gradient(ellipse 70% 90% at 22% 28%, ${sev.heroGlow} 0%, transparent 65%),
    radial-gradient(ellipse 60% 80% at 80% 75%, ${sev.heroGlow} 0%, transparent 65%),
    linear-gradient(135deg, ${sev.heroWash} 0%, ${sev.heroGlow} 50%, ${sev.heroWash} 100%)
  `;

  return (
    <article
      className="bg-ndp-surface rounded-xl border border-white/5 shadow-2xl shadow-black/40 overflow-hidden"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className="relative px-6 py-12 text-center"
        style={{ background: headerBg }}
      >
        {isUnread && (
          <span className="absolute top-3 right-3 px-2 py-0.5 rounded-full bg-ndp-accent text-white text-[9px] font-semibold tracking-wider">
            NEW
          </span>
        )}
        <h3 className="text-xl font-bold text-white drop-shadow-md leading-snug max-w-xl mx-auto">
          {announcement.title}
        </h3>
        <p className="text-[11px] text-white/70 mt-3 tracking-wide">
          {formatDateTime(announcement.publishedAt)}
        </p>
      </div>

      <div className="p-8">
        <MarkdownContent source={announcement.body} />
      </div>
    </article>
  );
}
