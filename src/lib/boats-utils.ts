/** Formátuje umístění lodě pro zobrazení: "Mříž 1 / 15", "Dlouhé", "—" */
export function fmtBoatLocation(grid: string | null, position: number | null): string {
    if (!grid) return "—";
    if (grid === "dlouhé") return "Dlouhé";
    return position != null ? `Mříž ${grid} / ${position}` : `Mříž ${grid}`;
}
