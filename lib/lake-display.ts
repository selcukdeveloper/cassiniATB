// Single source of truth for how a lake is identified in the UI.
// We deliberately do NOT use the EU-Hydro NAM field — it's frequently null,
// often "UNK", and not unique. LAKID is a stable, unique identifier per lake
// (e.g. "OE00073164") and works as the primary user-facing label.

export function lakeLabel(lakeId: string): string {
  return `Lake ${lakeId}`;
}
