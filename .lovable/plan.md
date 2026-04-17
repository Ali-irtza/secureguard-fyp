

## Plan: Header-only centering + cleanups

### 1. ScanHistory (`src/pages/ScanHistory.tsx`)
- Revert cell content to original alignment — only headers stay centered.
- For each `TableHead`: keep `text-center` (headers centered).
- For each `TableCell`: remove `text-center` and `justify-center` wrappers added previously, restoring left/original alignment.
- Remove row click navigation (project name no longer clickable → no 404):
  - Remove `onClick={() => handleRowClick(scan)}` and cursor styles from `TableRow`.
  - Remove `handleRowClick` function.
  - Project name becomes plain text (no link/button).
- Keep "Re-run" and "View Report" actions in the Actions column intact.

### 2. Reports (`src/pages/Reports.tsx`)
- Headers stay centered (`text-center` on `TableHead`).
- Remove `text-center` from `TableCell` and `justify-center` from inner divs → restore original cell alignment (left).
- Update mock `recentReports` so all `type` values are only one of: `"Full Scan Report"` or `"Team Summary Report"`.
  - id 1 "Weekly Security Summary" → type `"Team Summary Report"`
  - id 2 "Project Alpha Audit" → type `"Full Scan Report"`
  - id 3 "Dependencies Analysis" → type `"Team Summary Report"`
  - id 4 "Monthly Compliance" → type `"Full Scan Report"`

### 3. Team (`src/pages/Team.tsx`)
- Members table: add `text-center` to all `TableHead` (Member, Role, Assigned Branch, Last Scan, Actions).
- Leave `TableCell` contents unchanged (left-aligned as today).

### Notes
- Headers-only centering matches user intent: column header label appears in middle of its column width, while cell content keeps natural alignment.
- No other files affected.

