

## Plan: Update Projects Page with Team Support

### Files to Modify
| File | Action |
|------|--------|
| `src/pages/Projects.tsx` | Major rewrite — modal, filter, row updates, rescan nav |

### Changes

**1. Project Interface Update**
Add `type: "personal" | "team"`, `teamId?: string`, `teamName?: string`, `hasGithubRepo?: boolean` to the `Project` interface. Update mock data so some projects are tagged as team projects (auth-service, payment-module → SecureGuard Team; embedded-firmware → Ali's Project).

**2. New Project Modal (replaces navigate to /new-scan)**
- "New Project" button opens a `Dialog` instead of navigating
- Modal contains: Project Name input (required), Project Type selector (two styled cards: Personal with `User` icon, Team with `Users` icon), and a conditional team dropdown when Team is selected
- Team dropdown shows team name + crown icon for admin + role badge (reuses `roleBadgeStyles` pattern from team-data)
- If user has no teams and selects Team type → info box with "Go to Teams page →" link
- "Create Project" button disabled until name is filled (and team selected if Team type)
- Creates a new project entry and adds it to local state

**3. Project Type Filter**
- New `projectTypeFilter` state: `"all" | "personal" | "team"`
- New `Select` dropdown next to existing Language and Health filters
- Options: "All Projects", "Personal", "Team" (Team option hidden if `hasTeams === false`)
- Filtering logic added to the existing `filteredProjects` useMemo

**4. Project Row Updates**
- Team projects show a small green "Team" badge (`bg-primary/15 text-primary border-primary/30`) next to project name
- Team projects show team name in `text-xs text-muted-foreground` below the project name
- Projects with `hasGithubRepo` show a small muted `Github` icon next to the name
- Personal projects remain unchanged

**5. Rescan Action Update**
- `handleRescan` now calls `navigate("/new-scan?project=encodeURIComponent(projectName)")` instead of showing a toast
- The NewScan page would pick up the query param to pre-fill (note: the NewScan page already has `projectName` state, a small `useSearchParams` addition will be needed there too)

**6. Empty States**
- If `projects.length === 0`: full-page centered empty state with folder icon, "No Projects Yet" heading, subtext, and green "Create Project" button
- If filtered results are empty with team filter: "No team projects found. Create a project and assign it to a team."
- If filtered results are empty with personal filter: "No personal projects found."
- Default empty: existing "No projects found" with "Try adjusting your search or filters"

### Data Dependencies
- Imports `mockTeams`, `CURRENT_USER_ID` from `src/lib/team-data.ts` (already exists)
- Imports `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogFooter`, `DialogDescription` from existing UI components
- Imports `Label` from existing UI components
- Imports `User`, `Users`, `Crown`, `Github`, `Info` from lucide-react

### What stays unchanged
- All 4 stat cards — identical
- Table structure and columns — identical
- Eye icon behavior — identical
- Delete behavior — identical
- Bulk actions — identical
- Sort functionality — identical
- All existing styling patterns

