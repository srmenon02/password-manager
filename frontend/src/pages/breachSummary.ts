export interface BreachDashboardEntry {
  id: string
  site: string
  username: string
}

export function getBreachDashboardEntries(
  entries: BreachDashboardEntry[],
  breachedIds: Set<string>
): BreachDashboardEntry[] {
  return entries
    .filter((entry) => breachedIds.has(entry.id))
    .sort((a, b) => a.site.localeCompare(b.site, undefined, { sensitivity: 'base' }))
}
