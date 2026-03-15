

## Plan: Update Scan History Page with Team Support

### File to Modify
| File | Action |
|------|--------|
| `src/pages/ScanHistory.tsx` | Modify — add scan type filter, team selector, View Report button, team scan rows, dynamic stat cards, empty states |

### Changes

**1. ScanRecord Interface Update**
Add `type: "personal" | "team"`, `teamId?: string`, `teamName?: string`, `memberName?: string`, `branch?: string` to `ScanRecord`. Tag ~half of mock scans as team scans with member/branch info from existing `mockTeams` data.

**2. Scan Type Filter (Change 1)**
- New state: `scanTypeFilter: "all" | "personal" | "team"` and `selectedTeamId: string`
- New `Select` dropdown added next to the existing Status filter, options: "All Scans", "Personal", "Team"
- "Team" option hidden if user has no teams (`mockTeams.length === 0`)
- When "Team" selected, a team selector dropdown appears (same style as dashboard `TeamViewToggle`) showing all user's teams with role badges
- Default team: first admin team or first team
- Filter logic added to existing `filteredScans` useMemo

**3. View Report Button (Change 2)**
- Add a "View Report" ghost button with `FileText` icon next to Re-run in the Actions column
- Only rendered when `scan.status === "completed"` — navigates to `/reports/${scan.id}`
- For `in_progress`: Re-run is disabled, no View Report
- For `failed`: Re-run only, no View Report

**4. Team Scan Row Enhancements (Change 3)**
- For team scans: show green "Team" badge next to project name, and `memberName · branch` in `text-xs text-muted-foreground` below the project name
- Personal scans unchanged

**5. Dynamic Stat Cards (Change 4)**
- `stats` useMemo updated to compute from filtered scan list (based on `scanTypeFilter` and `selectedTeamId`) instead of always from `mockScanHistory`
- When team filter active, each stat card shows a small `text-[10px] text-muted-foreground` "Team" label below the existing label
- Card structure/styles unchanged

**6. Empty States (Change 5)**
- When `paginatedScans.length === 0`, render inline message in table body (full-width `TableCell` with `colSpan={6}`)
- Personal filter: "No personal scans yet. Start a new scan to see your history here."
- Team filter: "No team scans found for this team yet."
- Default: existing behavior (empty table)

### Data Dependencies
- Imports `mockTeams`, `CURRENT_USER_ID` from `src/lib/team-data.ts`
- Imports `Crown` from lucide-react for team selector
- Reuses `Badge` for team/role badges

### What Stays Unchanged
- All 4 stat card styles and layout
- Export button and both export functions
- All table columns and sort functionality
- Search bar, status filter, date range picker
- Failure details dialog
- Pagination
- Row click behavior

