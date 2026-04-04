/**
 * Apply theme variables from GET /api/themes/active (cms_themes + settings.appearance.theme).
 * Source of truth is the database; localStorage is a cache for offline / failed fetch fallback only.
 */

export type CmsActiveThemePayload = {
  slug?: string;
  name?: string;
  is_dark?: boolean;
  data?: Record<string, string>;
};

export function applyCmsThemeToDocument(payload: CmsActiveThemePayload): boolean {
  const vars = payload.data;
  if (!vars || typeof vars !== 'object' || Object.keys(vars).length === 0) return false;
  Object.entries(vars).forEach(([k, v]) => {
    if (v == null || k == null) return;
    document.documentElement.style.setProperty(k, String(v));
  });
  try {
    localStorage.setItem('mcad_theme_css', JSON.stringify(vars));
  } catch {
    /* ignore quota */
  }
  if (payload.slug) {
    try {
      localStorage.setItem('mcad_theme_slug', payload.slug);
    } catch {
      /* ignore */
    }
  }
  if (typeof payload.is_dark === 'boolean') {
    document.documentElement.setAttribute('data-theme', payload.is_dark ? 'dark' : 'light');
  }
  return true;
}

function activeThemeUrl(workspaceId: string | null | undefined): string {
  const ws = workspaceId?.trim() || '';
  return ws
    ? `/api/themes/active?workspace_id=${encodeURIComponent(ws)}`
    : '/api/themes/active';
}

/** Load active theme from API and apply to :root. Returns parsed payload or null. */
export async function fetchAndApplyActiveCmsTheme(
  workspaceId: string | null | undefined,
): Promise<CmsActiveThemePayload | null> {
  const res = await fetch(activeThemeUrl(workspaceId), { credentials: 'same-origin' });
  if (!res.ok) return null;
  const raw = (await res.json()) as CmsActiveThemePayload;
  applyCmsThemeToDocument(raw);
  return raw;
}

/** Read active slug for UI (e.g. ThemeSwitcher highlight) without re-applying vars. */
export async function fetchActiveCmsThemeSlug(
  workspaceId: string | null | undefined,
): Promise<string | null> {
  const res = await fetch(activeThemeUrl(workspaceId), { credentials: 'same-origin' });
  if (!res.ok) return null;
  const raw = (await res.json()) as { slug?: string };
  return typeof raw.slug === 'string' ? raw.slug : null;
}

export function applyCachedCmsThemeFallback(): boolean {
  try {
    const cached = localStorage.getItem('mcad_theme_css');
    if (!cached) return false;
    const vars = JSON.parse(cached) as Record<string, string>;
    if (!vars || typeof vars !== 'object') return false;
    return applyCmsThemeToDocument({ data: vars });
  } catch {
    return false;
  }
}
