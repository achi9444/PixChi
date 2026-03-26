export type PaletteColor = {
  name: string;
  hex: string;
  rgb: [number, number, number];
  lab: [number, number, number];
};

export type PaletteGroup = {
  id?: string;
  isCustom?: boolean;
  name: string;
  colors: PaletteColor[];
};
