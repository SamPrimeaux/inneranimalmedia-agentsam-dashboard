import React, { useEffect, useState } from 'react';

interface Theme {
  id: string;
  name: string;
  slug: string;
  config: string;
  preview_color: string;
}

export const ThemeSwitcher: React.FC = () => {
  const [themes, setThemes] = useState<Theme[]>([]);
  const [activeSlug, setActiveSlug] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/themes')
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setThemes(data.data);
        }
      })
      .catch(console.error);

    // IAM Theme & Color Stubs
    const stubs = [
      '/api/colors/all',
      '/api/themes/apply'
    ];
    stubs.forEach(url => console.log('TODO: wire', url));

    // Initial active theme from localStorage or default
    const cached = localStorage.getItem('mcad_theme_slug');
    if (cached) setActiveSlug(cached);
  }, []);

  const applyTheme = (theme: Theme) => {
    const config = JSON.parse(theme.config);
    
    // Apply CSS variables instantly
    Object.entries(config).forEach(([k, v]) => {
      document.documentElement.style.setProperty(k, v as string);
    });

    // Persist to DB (Standardized IAM Route)
    fetch('/api/themes/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug: theme.slug,
        theme_id: theme.id,
        workspace_id: 'meauxcad'
      })
    }).catch(() => {
      console.log('TODO: wire PATCH /api/settings/preferences {theme_preset}');
    });


    // Update state and local storage
    setActiveSlug(theme.slug);
    localStorage.setItem('mcad_theme_slug', theme.slug);
    localStorage.setItem('mcad_theme_css', theme.config);
  };

  return (
    <div className="p-4">
      <h3 className="text-sm font-medium text-[var(--text-main)] mb-4 uppercase tracking-wider">Themes</h3>
      <div className="grid grid-cols-2 gap-3">
        {themes.map((theme) => (
          <button
            key={theme.id}
            onClick={() => applyTheme(theme)}
            className={`flex items-center gap-3 p-2 rounded-lg border transition-all ${
              activeSlug === theme.slug
                ? 'border-[var(--solar-cyan)] bg-[var(--bg-hover)]'
                : 'border-[var(--border-subtle)] bg-[var(--bg-panel)] hover:bg-[var(--bg-hover)]'
            }`}
          >
            <div 
              className="w-6 h-6 rounded-full border border-[var(--border-subtle)]"
              style={{ backgroundColor: theme.preview_color }}
            />
            <span className="text-xs font-medium text-[var(--text-main)]">
              {theme.name}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};
