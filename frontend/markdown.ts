import { marked } from 'marked';
import DOMPurify from 'dompurify';

marked.setOptions({
  breaks: true,
  gfm: true,
});

// Done via a DOMPurify hook (post-sanitize, parsed DOM) rather than a regex over
// the serialized HTML — string-level rewriting can re-introduce tags that bypass DOMPurify.
let hookInstalled = false;
function ensureHook(): void {
  if (hookInstalled || typeof window === 'undefined') return;
  DOMPurify.addHook('afterSanitizeAttributes', (node: Element) => {
    if (node.tagName === 'A' && node.hasAttribute('href')) {
      const href = node.getAttribute('href') ?? '';
      if (/^https?:\/\//i.test(href)) {
        node.setAttribute('target', '_blank');
        node.setAttribute('rel', 'noopener noreferrer');
      }
    }
  });
  hookInstalled = true;
}

// `img` is forbidden so an admin can't smuggle a tracking pixel that would phone home
// with every viewer's IP — links can be used instead for any screenshot reference.
export function renderMarkdown(source: string): string {
  ensureHook();
  const rawHtml = marked.parse(source ?? '', { async: false }) as string;
  return DOMPurify.sanitize(rawHtml, {
    USE_PROFILES: { html: true },
    ADD_ATTR: ['target', 'rel'],
    FORBID_TAGS: ['style', 'script', 'iframe', 'object', 'embed', 'form', 'img'],
    FORBID_ATTR: ['style', 'onerror', 'onload', 'onclick'],
  });
}
