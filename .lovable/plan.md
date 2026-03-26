

## Plan: Update Reports Page with Team Support

### Files to Modify
| File | Action |
|------|--------|
| `src/pages/Reports.tsx` | Major update — remove scheduled reports, add team filter, update stat cards, update table rows, add empty states |
| `src/components/dashboard/GenerateReportDialog.tsx` | Rewrite — simplified modal with 2 report types, single project dropdown, remove schedule/checkbox grid |

---

### Changes

**1. Reports.tsx — Data & State**
- Remove `scheduledReports` array and `Clock` import
- Update `recentReports` interface to add `type: "personal" | "team"`, `teamId?: string`, `teamName?: string`. Tag 2 reports as team reports (e.g. Weekly Security Summary → SecureGuard Team, Dependencies Analysis → Ali's Project)
- Update stat cards: replace "Scheduled" with "Team Reports" (value = count of team reports, icon = `Users`)
- Add state: `reportTypeFilter: "all" | "personal" | "team"`, `selectedTeamId: string`, `dialogOpen`
- Import `mockTeams`, `CURRENT_USER_ID` from team-data
- Compute `hasTeams` from mockTeams, default selectedTeamId to first admin team
- `filteredReports` useMemo filters by type and selectedTeamId
- When team filter active, stat cards recompute from filtered data and show small "Team" label

**2. Reports.tsx — Filter Row**
- New row between stat cards and Recent Reports table
- Left: Select dropdown — "All Reports" / "Personal" / "Team" (Team hidden if no teams)
- Right: team selector dropdown (visible only when Team selected) — same pattern as ScanHistory page with Crown icon + role badges

**3. Reports.tsx — Table Updates**
- Team report rows show green "Team" badge (`bg-primary/15 text-primary`) next to name + team name in `text-xs text-muted-foreground` below
- Personal rows unchanged
- Card subtitle changed to "All your generated security reports"

**4. Reports.tsx — Remove Scheduled Section**
- Delete the entire Scheduled Reports `Card` block (lines 152-180)
- Delete `scheduledReports` const

**5. Reports.tsx — Empty States**
- If no reports at all: centered empty state with FileText icon, "No Reports Yet" heading, subtext, green "Generate Report" button
- If filtered empty with personal: "No personal reports yet."
- If filtered empty with team: "No team reports found for this team yet."

**6. GenerateReportDialog.tsx — Simplified Modal**
- Accept new prop: `scanTypeFilter` and `selectedTeamId` to know context
- Report Type: only 2 options — "Full Scan Report" (description below) and "Team Summary Report" (only visible if user has teams AND user's role in selected team is admin)
- Project: single Select dropdown replacing checkbox grid. In team mode, show team-related project names from mockTeams scans. In personal mode, show personal projects list
- Keep Date Range exactly as is
- Keep Export Format exactly as is
- Remove: Schedule toggle, Frequency dropdown, multi-project checkbox grid
- Generate button disabled until reportType AND project are selected

### What Stays Unchanged
- All action icons (download, share, delete)
- Table columns (Name, Type, Date, Format, Status, Actions)
- Header with "Generate Report" button
- All existing card/table styles
- Sidebar and other pages

