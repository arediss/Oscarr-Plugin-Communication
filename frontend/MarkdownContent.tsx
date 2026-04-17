import { useMemo } from 'react';
import { renderMarkdown } from './markdown';

interface Props {
  source: string;
  className?: string;
}

const SCOPE = 'oscarr-comm-md';

// All typography inherits Oscarr's Inter font stack via `color: inherit` on the container.
// Colors mirror the ndp-* palette (ndp-text #f3f4f6, ndp-text-muted #9ca3af, ndp-text-dim #6b7280, ndp-accent #6366f1).
const CSS = `
.${SCOPE} { color: #f3f4f6; font-size: 0.875rem; line-height: 1.6; }
.${SCOPE} > *:first-child { margin-top: 0; }
.${SCOPE} > *:last-child { margin-bottom: 0; }
.${SCOPE} h1 { font-size: 1.125rem; font-weight: 700; margin: 1rem 0 0.5rem; color: #f3f4f6; }
.${SCOPE} h2 { font-size: 1rem;     font-weight: 600; margin: 1rem 0 0.5rem; color: #f3f4f6; }
.${SCOPE} h3 { font-size: 0.9rem;   font-weight: 600; margin: 0.85rem 0 0.4rem; color: #f3f4f6; }
.${SCOPE} h4, .${SCOPE} h5, .${SCOPE} h6 { font-size: 0.85rem; font-weight: 600; margin: 0.75rem 0 0.35rem; color: #f3f4f6; }
.${SCOPE} p { margin: 0.55rem 0; color: #d1d5db; }
.${SCOPE} ul { list-style: disc;    padding-left: 1.25rem; margin: 0.55rem 0; }
.${SCOPE} ol { list-style: decimal; padding-left: 1.4rem;  margin: 0.55rem 0; }
.${SCOPE} li { margin: 0.2rem 0; color: #d1d5db; }
.${SCOPE} li::marker { color: #6b7280; }
.${SCOPE} li > p { margin: 0; }
.${SCOPE} strong { font-weight: 600; color: #f3f4f6; }
.${SCOPE} em { font-style: italic; }
.${SCOPE} a { color: #818cf8; text-decoration: underline; text-underline-offset: 2px; text-decoration-thickness: 1px; }
.${SCOPE} a:hover { color: #a5b4fc; }
.${SCOPE} code {
  background: rgba(255, 255, 255, 0.06);
  color: #f3f4f6;
  padding: 0.1rem 0.35rem;
  border-radius: 0.25rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.8rem;
}
.${SCOPE} pre {
  background: rgba(0, 0, 0, 0.3);
  padding: 0.75rem 0.9rem;
  border-radius: 0.5rem;
  border: 1px solid rgba(255, 255, 255, 0.05);
  overflow-x: auto;
  margin: 0.75rem 0;
}
.${SCOPE} pre code { background: transparent; padding: 0; font-size: 0.8rem; }
.${SCOPE} blockquote {
  border-left: 2px solid rgba(255, 255, 255, 0.15);
  padding-left: 0.85rem;
  margin: 0.75rem 0;
  color: #9ca3af;
}
.${SCOPE} hr { border: 0; border-top: 1px solid rgba(255, 255, 255, 0.08); margin: 1rem 0; }
.${SCOPE} img { max-width: 100%; border-radius: 0.5rem; margin: 0.5rem 0; }
.${SCOPE} table { border-collapse: collapse; margin: 0.75rem 0; font-size: 0.82rem; width: 100%; }
.${SCOPE} th, .${SCOPE} td { border: 1px solid rgba(255, 255, 255, 0.08); padding: 0.4rem 0.65rem; text-align: left; }
.${SCOPE} th { background: rgba(255, 255, 255, 0.03); font-weight: 600; color: #f3f4f6; }
`.trim();

let stylesInjected = false;

function ensureStyles() {
  if (stylesInjected || typeof document === 'undefined') return;
  const existing = document.querySelector(`style[data-oscarr-plugin="communication-md"]`);
  if (existing) {
    stylesInjected = true;
    return;
  }
  const style = document.createElement('style');
  style.setAttribute('data-oscarr-plugin', 'communication-md');
  style.textContent = CSS;
  document.head.appendChild(style);
  stylesInjected = true;
}

export function MarkdownContent({ source, className }: Props) {
  ensureStyles();
  const html = useMemo(() => renderMarkdown(source), [source]);
  return (
    <div
      className={[SCOPE, className].filter(Boolean).join(' ')}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
