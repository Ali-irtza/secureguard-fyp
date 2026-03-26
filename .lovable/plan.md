

## Plan: Update Settings Page with Team Features & Profile Dropdown

### Files to Modify
| File | Action |
|------|--------|
| `src/pages/Settings.tsx` | Major rewrite — password section, notifications update, appearance cleanup, new Team & Permissions tab |
| `src/components/dashboard/DashboardTopBar.tsx` | Update profile dropdown with avatar header + role badge |

---

### Changes

**1. Profile Tab Updates (`Settings.tsx`)**
- Replace email helper text with "Your email address cannot be changed here for security reasons."
- Add a `Separator` divider after the Save Changes button
- Add "Change Password" section with 3 password inputs (current, new, confirm) each with show/hide eye toggle
- New state: `currentPassword`, `newPassword`, `confirmPassword`, `showCurrentPassword`, `showNewPassword`, `showConfirmPassword`
- Separate green "Update Password" button independent of "Save Changes"

**2. Notifications Tab Updates (`Settings.tsx`)**
- Remove "Weekly Summary" toggle entirely
- Remove `weeklySummary` from notifications state
- Keep: Critical Bug Alerts, Scan Completed, New Project Added
- Add "Team Member Scanned" toggle below existing ones — "Get notified when a team member completes a scan", default off
- Only visible if `hasTeams === true` (computed from `mockTeams`)

**3. Appearance Tab Cleanup (`Settings.tsx`)**
- Remove `accentColors` const entirely
- Remove `accentColor` and `density` state
- Remove Accent Color section and UI Density RadioGroup section
- Keep only Theme selector (Light/Dark/System) + Save Preferences button
- Remove unused imports: `RadioGroup`, `RadioGroupItem`

**4. New "Team & Permissions" Tab (`Settings.tsx`)**
- New tab in sidebar between Notifications and Appearance, icon: `Users`, label: "Team & Permissions"
- Completely hidden if `hasTeams === false`
- Update `useEffect` tab validation to include `"team-permissions"` as valid tab value
- Content structure based on role in selected team:

**Admin view (3 sections):**
- **Team Info card** — team name with pencil edit icon, created date (mock), red "Delete Team" button with AlertDialog confirmation
- **Members card** — heading with count badge, table: Member (avatar+name+email), Role (editable Select dropdown per row, own row locked), Branch (editable for developers, "All Branches" badge for admin, lock icon for viewer), Actions (trash icon, hidden on own row). Green "Invite Member" button opens a Dialog: email input, role selector (Developer/Viewer only), Send Invite button
- **GitHub Repository card** — if repo connected: name, URL link, green "Connected" badge, "Refresh Branches" ghost button, red "Disconnect" button. If not connected: dashed area, GitHub icon, "No repository connected", green "Connect Repository" button opens Dialog: repo URL input, PAT input with show/hide, info note, Connect button

**Developer/Viewer view:**
- Info banner: "Only the team Admin can manage members and settings."
- Members table — read-only, no dropdowns, no remove. User's own row has "You" badge
- GitHub repo — read-only info, no action buttons
- No invite, no delete team

**State additions:** `selectedTeamId`, `inviteModalOpen`, `inviteEmail`, `inviteRole`, `connectGithubOpen`, `repoUrl`, `repoPat`, `showPat`, `editingTeamName`, `tempTeamName`

**5. Profile Dropdown Update (`DashboardTopBar.tsx`)**
- Replace "My Account" label section with a profile header: Avatar circle (green bg, initials), bold name, muted email, role badge (colored: green for admin, blue for developer, gray for viewer)
- Then separator
- Keep: Profile Settings, API Keys menu items
- Keep: separator + red Log out
- Import `mockTeams`, `CURRENT_USER_ID` from team-data to determine primary role
- Add mock email constant

**6. Cleanup**
- Remove `accentColors` array
- Remove unused imports (`RadioGroup`, `RadioGroupItem`, `Palette` if only used for appearance icon — keep it since it's still the Appearance tab icon)

---

### My Suggestions & Feedback

A few thoughts on the design:

1. **The Team & Permissions tab is doing a lot.** It's essentially a mini Teams management page inside Settings. This works for now since there's no dedicated Teams page yet, but once you build the Teams page, you'll want to decide: does Settings show a read-only summary linking to the Teams page, or does it stay as the full management UI? I'd recommend keeping full management on the Teams page and making Settings a lightweight "your teams" overview with links.

2. **GitHub PAT in the Connect modal is fine for mock**, but in production you'd want OAuth flow instead of raw token input. Worth noting for later.

3. **The "Invite Member" flow** — the modal says "An invite link will be sent to their email" but there's no backend. For mock, I'll just add the member to local state with a toast. This is consistent with how other mock flows work in the app.

4. **Role badge in the profile dropdown** — the current user (John Doe) is Admin in SecureGuard Team, Developer in Ali's Project, and Viewer in University Group. I'll show the highest-privilege role (Admin) as the primary badge, which matches the existing "Admin" text already shown in the top bar.

5. **Everything else looks solid** — the change password section, notification cleanup, and appearance simplification are all clean improvements.

