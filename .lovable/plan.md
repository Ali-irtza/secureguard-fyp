

## Plan: Add Dedicated Team Management Page

### Files to Create/Modify
| File | Action |
|------|--------|
| `src/pages/Team.tsx` | **Create** — Full team management page |
| `src/components/dashboard/DashboardSidebar.tsx` | **Modify** — Add "Team" nav item between Projects and Scan History |
| `src/App.tsx` | **Modify** — Add `/team` route |

---

### Changes

**1. Sidebar (`DashboardSidebar.tsx`)**
- Import `Users` from lucide-react
- Insert `{ title: "Team", url: "/team", icon: Users }` into `mainNavItems` array between Projects (index 2) and Scan History (index 3)

**2. Route (`App.tsx`)**
- Import `Team` from `./pages/Team`
- Add `<Route path="/team" element={<Team />} />` alongside other dashboard routes

**3. Team Page (`src/pages/Team.tsx`)**

The page is essentially a standalone version of the Settings Team & Permissions tab, expanded with additional sections. It reuses the same patterns from Settings (modals, tables, badges, cards) and the `TeamHealthOverview` component from the Dashboard.

**State & Data:**
- Import `mockTeams`, `CURRENT_USER_ID` from team-data
- Compute `userTeams`, `hasTeams`, `selectedTeam`, `currentUserRole`, `isAdmin`
- State: `selectedTeamId`, `inviteModalOpen`, `connectGithubOpen`, `inviteEmail`, `inviteRole`, `repoUrl`, `repoPat`, `showPat`, `editingTeamName`, `tempTeamName`, `createTeamOpen`, `newTeamName`

**Empty State (no teams):**
- Centered: Users icon (muted), "No Team Yet" heading, subtext, green "Create Team" button
- Create Team modal: team name input, disabled confirm until filled

**Team Switcher (multiple teams):**
- Horizontal row of selectable team pills/buttons (not a dropdown — more prominent than Settings)
- Each shows Crown icon for admin teams, team name, role badge
- Default: first admin team
- Hidden if only one team (show team name as heading instead)

**Page Header:**
- Left: team name + pencil edit (admin only, inline input on click), "Team · X members" muted subtitle
- Right (admin only): ghost "Connect GitHub Repo" button + green "Invite Member" button

**Members Card:**
- Same table as Settings Team & Permissions: Member (avatar+name+email, "You" badge+green left border for self), Role (editable dropdown for admin, badge for others), Assigned Branch (dropdown for admin editing developers, "All Branches" badge for admin row, lock+"No branch" for viewer, "Connect repo first" disabled if no repo), Last Scan (new column not in Settings — uses `member.lastScan`), Actions (trash, admin only, not on self)
- Non-admin info banner above table
- Same invite modal as Settings

**GitHub Repository Card:**
- Same as Settings: connected state (name, URL, badge, date, branch count, Refresh+Disconnect for admin) and disconnected state (dashed, icon, text, Connect button for admin)
- Same connect modal as Settings

**Team Health Summary Card:**
- Render the existing `TeamHealthOverview` component, passing `selectedTeam`, `CURRENT_USER_ID`, and `currentUserRole`

**Danger Zone Card (admin only):**
- Red-bordered card at bottom
- "Danger Zone" heading in red, description text, red outlined "Delete Team" button
- AlertDialog confirmation with team name in message

---

### My Feedback

1. **Duplication with Settings Team & Permissions tab.** The Team page and the Settings tab now share ~80% of the same UI (members table, GitHub card, invite/connect modals). After this page ships, I'd recommend simplifying the Settings tab to just show a list of your teams with "Manage →" links to `/team`, rather than duplicating full management UI in both places. This avoids drift and keeps one source of truth.

2. **Team switcher as horizontal pills vs dropdown.** Since this is the primary team page, a horizontal pill/tab bar feels more prominent and scannable than a dropdown. But if the user could belong to 5+ teams it won't scale well horizontally. For now with mock data (3 teams) it's fine. Future consideration: switch to dropdown at 4+ teams.

3. **The "Create Team" flow** only captures a name. That's good for MVP. Later you'll want to immediately prompt for GitHub repo connection and first member invite as a guided onboarding flow after creation.

4. **Last Scan column** is a nice addition over the Settings table. The data already exists on `TeamMember.lastScan` so it's free to add.

5. **Everything else maps cleanly** — the mock data structure supports all the UI elements described, and the component patterns (modals, badges, cards, tables) are well-established across the app.

