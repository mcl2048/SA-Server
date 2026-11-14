// Native formations are two rows of five slots per side (0..9 / 10..19).
// Never infer adjacency from drawing coordinates or allow 4↔5 / 14↔15 wraps.
export const PRIMAL_CROSS_FUNC = "PETSKILL_PrimalCross";
export function primalCrossSlots(center: number): number[] {
  if (!Number.isInteger(center) || center < 0 || center >= 20) return [];
  const local = center % 10, col = local % 5;
  return [center, ...(col > 0 ? [center - 1] : []), ...(col < 4 ? [center + 1] : []), center + (local < 5 ? 5 : -5)];
}
