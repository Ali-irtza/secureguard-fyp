

## Plan: Add Team-Aware Features to Dashboard

This is a large feature with 6 changes. Since there's no backend/Supabase connected, everything will use mock data and local state. This sets up the UI and data flow so it's ready for a real Teams page and backend later.

---

### Architecture Overview

```text
Dashboard.tsx (orchestrator)
├── ViewToggle (Personal / Team) + TeamSelector dropdown
├── MetricsRow (receives personal or team metrics)
├── TeamHealthOverview (new, only in Team view)
├── RecentScansTable (receives filtered scans + userRole)
├── VulnerabilityChart (unchanged)
└── CriticalAlerts (receives mode + userRole)
```

**Key state in Dashboard.tsx:**
- `viewMode`: `"personal"` | `"team"` (default: `"personal"`)
- `selectedTeamId`: string
- Current user's role in selected team derived from mock data

---

### Mock Data Structures

A new file `src/lib/team-data.ts` will hold all mock team data:

```ts
type TeamRole = "admin" | "developer" | "viewer";

interface TeamMember {
  id: string; name: string; initials: string;
  branch: string; healthScore: number | null;
  lastScan: string | null;
}

interface Team {
  id: string; name: string;
  currentUserRole: TeamRole;
  metrics: { totalScans; criticalVulns; healthScore; pendingScans };
  members: TeamMember[];
  scans: Scan[];
  alerts: TeamAlert[];
}
```

Mock 3 teams: "SecureGuard Team" (admin), "Ali's Project" (developer), "University Group" (viewer). Current user is "John Doe" (id: "user-1").

---

### New Components

#### 1. `src/components/dashboard/TeamViewToggle.tsx`
A row with two elements:
- **Left**: Two buttons styled as a toggle group — "Personal" and "Team". Active = `bg-primary text-primary-foreground`, inactive = `ghost`. Uses existing button styles.
- **Right**: A `Select` dropdown (from existing UI components), visible only when Team is active. Each option shows team name, crown emoji if admin, and role badge.
- The entire component is hidden if user has no teams.

#### 2. `src/components/dashboard/TeamHealthOverview.tsx`
- Full-width `glass-card` matching existing card styles
- Header: "Team Health Overview" + muted team name
- Horizontal scrollable row (`flex overflow-x-auto gap-4`)
- Each member entry: Avatar (initials), name, branch, circular health badge (green/yellow/red), last scan time
- Current user's entry has `border-l-2 border-primary` and a "You" badge
- If `healthScore` is null → show "Not scanned yet" in muted destructive text

---

### File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/lib/team-data.ts` | **Create** | All mock team data, types, helper functions |
| `src/components/dashboard/TeamViewToggle.tsx` | **Create** | Personal/Team toggle + team selector dropdown |
| `src/components/dashboard/TeamHealthOverview.tsx` | **Create** | Team member health overview card |
| `src/pages/Dashboard.tsx` | **Modify** | Add state management, conditionally render new components, pass mode/role to existing components |
| `src/components/dashboard/MetricsRow.tsx` | **Modify** | Accept optional `teamLabel` prop; show "Team" label below values when in team view |
| `src/components/dashboard/CriticalAlerts.tsx` | **Modify** | Accept optional `alerts` prop + `userRole`; show member/branch info in team mode |
| `src/components/dashboard/RecentScansTable.tsx` | **Modify** | Accept optional `userRole` prop; hide action buttons for viewers |

---

### Dashboard.tsx Changes (Orchestrator Logic)

```tsx
// New state
const [viewMode, setViewMode] = useState<"personal" | "team">("personal");
const [selectedTeamId, setSelectedTeamId] = useState<string>("");

// Derived
const selectedTeam = mockTeams.find(t => t.id === selectedTeamId);
const userRole = selectedTeam?.currentUserRole;
const isTeamView = viewMode === "team" && selectedTeam;

// Default team selection: first admin team, or first team
useEffect(() => {
  const adminTeam = mockTeams.find(t => t.currentUserRole === "admin");
  setSelectedTeamId((adminTeam || mockTeams[0])?.id || "");
}, []);
```

**Layout additions** (inserted between header and MetricsRow):
```tsx
{mockTeams.length > 0 && (
  <TeamViewToggle
    viewMode={viewMode}
    onViewModeChange={setViewMode}
    teams={mockTeams}
    selectedTeamId={selectedTeamId}
    onTeamChange={setSelectedTeamId}
  />
)}
```

**Between MetricsRow and main content grid** (only in team view):
```tsx
{isTeamView && (
  <TeamHealthOverview
    team={selectedTeam}
    currentUserId="user-1"
    userRole={userRole}
  />
)}
```

**MetricsRow** receives either personal or team metrics + `isTeamView` flag.

**RecentScansTable** receives filtered scans based on role:
- Admin: all team scans
- Developer: only their own scans from team
- Viewer: all scans but `userRole="viewer"` hides action buttons

**CriticalAlerts** receives team alerts when in team view with member/branch info.

---

### Role-Based Behavior Summary

| Feature | Admin | Developer | Viewer |
|---------|-------|-----------|--------|
| Toggle visible | ✓ | ✓ | ✓ |
| Team metrics | Full team | Full team | Full team |
| Health Overview | All members | All (own highlighted) | All (own highlighted) |
| Recent Scans | All members | Own only | All, no actions |
| Critical Alerts | See + manage | See only | See only |
| Vuln Chart | Unchanged | Unchanged | Unchanged |

---

### Suggestions for the Upcoming Teams Page

A few things to consider for when you build the Teams page:

1. **Team CRUD** — The teams page will need create/edit/delete team flows. I'd recommend reusing the `glass-card` pattern with a modal/dialog for creation.
2. **Member management** — Invite by email, role assignment, remove member. This will need a Supabase `teams` table, `team_members` table (with role column), and RLS policies.
3. **Branch assignment** — Each member being assigned to a branch is a nice concept. Consider whether branches are free-text or linked to actual Git repos.
4. **The mock data structure** I'm creating in `team-data.ts` is designed to map closely to future Supabase tables, making the migration straightforward.

