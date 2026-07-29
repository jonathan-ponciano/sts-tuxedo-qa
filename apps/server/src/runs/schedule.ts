const UNIT_MS: Record<string, number> = { m: 60_000, h: 3_600_000, d: 86_400_000 };

/** Schedule strings look like "1h", "30m", "6h", "24h", "7d". */
export function parseIntervalMs(schedule: string): number | null {
  const match = /^(\d+)([mhd])$/.exec(schedule.trim());
  if (!match) return null;
  const amount = Number(match[1]);
  const unitMs = UNIT_MS[match[2] as string];
  return unitMs === undefined ? null : amount * unitMs;
}

export function nextDueAtIso(schedule: string, from: Date = new Date()): string | null {
  const ms = parseIntervalMs(schedule);
  return ms === null ? null : new Date(from.getTime() + ms).toISOString();
}

/**
 * Whenever a test's `schedule` column is set or changed, next_due_at needs
 * re-seeding so the scheduler picks it up on its next tick instead of
 * waiting a full interval. Shared by create_test/update_test (MCP) and the
 * REST PATCH route so the two don't drift.
 */
export function computeNextDueAt(
  newSchedule: string | null | undefined,
  existingSchedule: string | null,
  existingNextDueAt: string | null,
): string | null {
  if (newSchedule === undefined) return existingNextDueAt;
  if (newSchedule === null) return null;
  if (newSchedule !== existingSchedule || !existingNextDueAt) return new Date().toISOString();
  return existingNextDueAt;
}
