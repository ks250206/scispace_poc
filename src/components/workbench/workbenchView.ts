export const centerViewport = { x: -1920, y: -1080, scale: 1 };
export const minScale = 0.1;
export const maxScale = 3;
export const wheelPanSensitivity = 0.75;
export const baseDotSpacing = 24;
export const baseMajorGridSpacing = 240;

export const quoteCommandArg = (value: string): string =>
  /\s|["']/.test(value) ? `"${value.replaceAll('"', '\\"')}"` : value;
