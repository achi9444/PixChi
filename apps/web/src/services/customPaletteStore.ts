export type CustomPaletteColor = {
  name: string;
  hex: string;
};

export type CustomPaletteGroup = {
  id: string;
  name: string;
  colors: CustomPaletteColor[];
};

const STORAGE_KEY = 'pixchi_custom_palette_groups_v1';

export function loadCustomPaletteGroups(): CustomPaletteGroup[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: CustomPaletteGroup[] = [];
    for (const row of parsed) {
      if (!row || typeof row !== 'object') continue;
      const id = String((row as { id?: string }).id ?? '').trim();
      const name = String((row as { name?: string }).name ?? '').trim();
      const colorsRaw = Array.isArray((row as { colors?: unknown[] }).colors) ? (row as { colors: unknown[] }).colors : [];
      if (!id || !name) continue;
      const colors: CustomPaletteColor[] = [];
      for (const c of colorsRaw) {
        if (!c || typeof c !== 'object') continue;
        const cn = String((c as { name?: string }).name ?? '').trim();
        const ch = String((c as { hex?: string }).hex ?? '').trim().toUpperCase();
        if (!cn || !/^#[0-9A-F]{6}$/.test(ch)) continue;
        colors.push({ name: cn, hex: ch });
      }
      out.push({ id, name, colors });
    }
    return out;
  } catch {
    return [];
  }
}

export function saveCustomPaletteGroups(groups: CustomPaletteGroup[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(groups));
}

export function makeCustomPaletteId() {
  return `cp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
