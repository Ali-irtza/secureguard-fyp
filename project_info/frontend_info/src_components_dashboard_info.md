# Frontend Dashboard Components Documentation

## Overview
The dashboard components directory contains 14 React/TypeScript files that compose the main security dashboard interface. These components handle UI rendering, real-time updates, data visualization, and user interactions.

---

## 1. **BranchFileExplorer.tsx** (24 KB - Largest File)

### Purpose
Interactive file explorer component that displays repository files from GitHub branches. Allows team members to browse and view source code directly from connected GitHub repositories.

### Key Features
- **File tree structure** - Hierarchical file/folder navigation with expand/collapse
- **Branch selection** - Admin can select from all branches; developers see assigned branches only
- **File content viewer** - Click to view file content with syntax highlighting
- **Full-screen modal** - Expand file viewer for better readability
- **Caching system** - Module-level cache for files and content (survives navigation)

### Backend Connections
- **API Calls:**
  - `fetchBranchFiles(team.id, selectedBranch)` - Fetches file tree from GitHub repo
  - `fetchFileContent(team.id, selectedBranch, path)` - Gets file content
  - `getCachedBranchFiles()` - Retrieves cached files
  - `getCachedFileContent()` - Retrieves cached file content
  - `isBranchFilesCacheFresh()` - Checks cache freshness

- **Data Flow:**
  - Implements **stale-while-revalidate** pattern: shows cached data instantly, fetches fresh data in background
  - No cache hit → shows loading spinner while fetching
  - Cache hit → instantly displays cached data, background refresh runs silently
  
- **Role-based Access:**
  - **Viewer:** No access - shows lock icon message
  - **Developer:** Only assigned branches visible; auto-selects first branch
  - **Admin:** All branches selectable

### Components Used
- File tree rendering with depth-based indentation
- Icon system for file types (code, JSON, images, config, markdown, etc.)
- Language detection for syntax highlighting (TypeScript, Python, Java, Go, Rust, Ruby, PHP, etc.)
- ScrollArea for long file lists
- Dialog for full-screen file viewing

---

## 2. **ConnectionStatus.tsx** (Small - 38 lines)

### Purpose
Compact status indicator widget for real-time WebSocket subscription state.

### Displays
- **SUBSCRIBED** → Returns null (no visual)
- **CHANNEL_ERROR or TIMED_OUT** → Yellow pulsing dot + "Reconnecting… (count)"
- **CLOSED** → Red dot + "Disconnected"

### Backend Connections
- **Type:** `SubscriptionStatus` from `@/types/realtime`
- **Props:**
  - `status` - Real-time subscription status enum
  - `connectionCount` - Number of reconnection attempts

### Use Cases
- Displays in CriticalAlerts header to show real-time data freshness
- Helps users understand if live alert data is current or stale

---

## 3. **CriticalAlerts.tsx** (120 lines)

### Purpose
Displays real-time critical security alerts with priority order: realtime > team > defaults.

### Key Features
- **Dynamic data sources** - Supports realtime alerts, team alerts, or mock defaults
- **Timestamp formatting** - "X minutes/hours/days ago" relative time
- **Connection status badge** - Shows subscription status using ConnectionStatus component
- **Role-based display** - Shows team member info (name, branch) for team view
- **Active count badge** - Red badge showing alert count

### Backend Connections
- **Data Types:**
  - `AlertRecord` - { id, vulnerability_id, user_id, status, created_at, updated_at }
  - `TeamAlert` - Includes memberName and branch
  - `SubscriptionStatus` - From realtime types

- **API Integration:**
  - Accepts `realtimeAlerts` - Live alerts from WebSocket subscription
  - Maps realtime data to display format
  - Falls back to team alerts or defaults if realtime unavailable

### User Interactions
- Clicking "View All Alerts" navigates to `/alerts` page
- Hover states for visual feedback

---

## 4. **DashboardLayout.tsx** (Simple - 25 lines)

### Purpose
Root layout wrapper for the dashboard using sidebar layout pattern.

### Structure
- **SidebarProvider** - Context wrapper for sidebar state
- **Two-column layout:**
  - Left: DashboardSidebar (navigation)
  - Right: DashboardTopBar + main content area (flex column)
- **Responsive** - Gradient background with cyberpunk theme

### No Backend Connections
- Pure UI composition component
- Children (dashboard pages) pass through untouched

---

## 5. **DashboardSidebar.tsx** (118 lines)

### Purpose
Main navigation sidebar with SecureGuard branding and app navigation menu.

### Navigation Items
**Main Menu:**
- Dashboard (LayoutDashboard icon)
- New Scan (Plus icon) - Primary highlight
- Projects (FolderKanban)
- Team (Users)
- Scan History (FileBarChart)
- Reports (FileText)

**Bottom Menu:**
- Help (HelpCircle)
- Settings (Settings)
- Logout (LogOut) - Red button

### Backend Connections
- **Logout Implementation:**
  - Clears `localStorage.dev_authenticated`
  - Clears `localStorage.dev_user_email`
  - Shows success toast
  - Navigates to `/auth`

### Features
- **Active state styling** - Current page highlighted with primary color
- **Hover animations** - Icons scale on hover
- **Responsive icons** - All use lucide-react
- **Animated entrance** - Staggered slide-up animations

---

## 6. **DashboardTopBar.tsx** (176 lines)

### Purpose
Header bar with search, notifications, and user profile dropdown.

### Sections

#### Left Section
- **Sidebar Toggle** - Mobile menu trigger
- **Global Search** (hidden on mobile) - 
  - Searches: scans, reports, vulnerabilities
  - Enter key navigates to `/scan-history?search={query}`

#### Right Section
**Notifications Dropdown:**
- Bell icon with pulsing red dot if notifications exist
- Mock notifications: critical vulnerability, scan completed
- "View all notifications" link

**User Profile Dropdown:**
- Avatar with user initials
- Name and email
- **Role badge** - Color-coded (admin/developer/viewer)
- Profile Settings link
- API Keys link
- Logout button

### Backend Connections
- **Supabase Auth:**
  - `supabase.auth.signOut()` - Server-side logout
  - Sets user context: displayName, email, avatarUrl, initials
  
- **Data Sources:**
  - `mockTeams` and `CURRENT_USER_ID` from team-data
  - `useCurrentUser()` hook - Gets current user info
  - Primary role determined from team roles (admin > developer > viewer)

### User Role Display
- Dynamically calculates highest privilege across teams
- Shows appropriate badge styling per role

---

## 7. **EmptyState.tsx** (43 lines)

### Purpose
Landing page shown when user has no scans yet. Encourages starting first scan.

### Design
- **Animated shield icon** - Primary focus with pulse effect and blur glow
- **Large + button** - Opens `/new-scan` page
- **Heading:** "Start Your First Scan"
- **Subtext:** Instructions about uploading code or connecting repo

### No Backend Connections
- Pure UI component
- Navigation only

---

## 8. **GenerateReportDialog.tsx** (187 lines)

### Purpose
Modal dialog for generating security reports with filtering and export options.

### Form Fields
1. **Report Type** - Dropdown:
   - Full Scan Report (all vulnerabilities)
   - Team Summary Report (admin only, high-level overview)

2. **Select Project** - Dynamic list:
   - Personal view: hardcoded projects (Project Alpha, Beta, API Gateway, Mobile App)
   - Team view: projects from `selectedTeam.scans.map(s => s.projectName)`

3. **Date Range** - Calendar picker (from/to dates optional)

4. **Export Format** - Dropdown:
   - PDF
   - CSV
   - Both PDF & CSV

### Backend Connections
- **Team Context:**
  - Filters `mockTeams` by current user membership
  - Checks if user is admin for team-level reports
  - Scans data comes from team object

- **Validation:**
  - Report type AND project must be selected to enable "Generate" button
  - Toast message on success: "Report generation started. You'll be notified when it's ready."

### Role-based Features
- **Admins:** See "Team Summary Report" option
- **Non-admins:** Only see "Full Scan Report" option

---

## 9. **MetricsRow.tsx** (103 lines)

### Purpose
Dashboard KPI display showing 4 key security metrics in a responsive grid.

### Metrics Displayed
1. **Total Scans** - Count badge with Shield icon (default color)
2. **Critical Vulnerabilities** - Count badge with ShieldAlert icon (destructive red)
3. **Health Score** - Radial progress circle with Activity icon (success green)
4. **Pending Scans** - Count badge with Clock icon (warning yellow)

### Design Features
- **Responsive grid** - 1 col (mobile), 2 cols (tablet), 4 cols (desktop)
- **Glass-card styling** - Semi-transparent cards with border
- **Variant colors** - Each metric has color-coded styling
- **Staggered animation** - Slides up on load with delays
- **Team label option** - Shows "Team" subtitle when `isTeamView=true`

### Component Structure
- **MetricCard** sub-component - Reusable card with icon placement
- **Value styles** - Responsive text sizing and colors

### No Backend Calls
- Receives data as props; doesn't fetch
- Data source: parent dashboard page

---

## 10. **RadialProgress.tsx** (64 lines)

### Purpose
Animated circular progress indicator for displaying percentage-based metrics.

### Features
- **SVG-based rendering** - Smooth animations with CSS transitions
- **Gradient fill** - Primary color to emerald glow gradient
- **Animated counter** - Value animates from 0 to target on mount (100ms delay)
- **Customizable:**
  - `size` - Default 64px
  - `strokeWidth` - Default 6px
  - `label` - Optional text below circle
  - `value` - Percentage (0-100)

### Animation
- 1000ms smooth transition for progress fill
- Uses SVG strokeDasharray/strokeDashoffset technique
- Center text displays percentage

### Used By
- MetricsRow component displays health score
- TeamHealthOverview shows mini versions for each team member

---

## 11. **RecentScansTable.tsx** (134 lines)

### Purpose
Data table showing recent security scans with status, vulnerabilities, and action buttons.

### Table Columns
1. **Project** - Project name
2. **Date** - Formatted date and time
3. **Status** - Badge (Completed/Failed/In Progress)
4. **Vulnerabilities** - Breakdown:
   - Shows "X Critical" if count > 0 (destructive badge)
   - Shows "X High" if count > 0 (warning badge)
   - Shows "X Issues" for medium/low combined if no critical/high

5. **Actions** - "View Report" button (hidden for viewers)

### Data Structure
```typescript
interface Scan {
  id: string;
  projectName: string;
  date: Date;
  status: "completed" | "failed" | "in_progress";
  vulnerabilities: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  memberId?: string;
}
```

### Features
- **Status badges** - Color-coded with spinning loader for in-progress
- **Responsive design** - Full table on desktop
- **Hover effects** - Rows highlight on hover
- **Staggered animation** - Rows animate in sequentially
- **Role-based actions** - "View Report" hidden for viewers

### Backend Connections
- **Props:**
  - `scans` - Array of scan data
  - `userRole` - Optional role for permission checks

- **No direct API calls** - Receives data from parent
- **Date formatting** - Uses Intl API for locale-aware formatting

---

## 12. **TeamHealthOverview.tsx** (104 lines)

### Purpose
Displays health scores and scan status for each team member in a horizontal scrollable view.

### Team Member Card Display
Each member shows:
- **Avatar** - Circle with initials
- **Name** - Member name with "You" badge for current user
- **Branch** - Assigned branch name
- **Health Score** - Mini radial progress (if scanned)
- **Last Scan** - Timestamp or "Not scanned yet"

### Mini Radial Features
- **40px circles** - Compact version of full radial
- **Color coding:**
  - Green (stroke-primary) - Score ≥ 80
  - Yellow (stroke-warning) - Score 50-79
  - Red (stroke-destructive) - Score < 50
  - Gray (stroke-muted) - No score

### Layout
- **Horizontal scroll** - Flex layout with minWidth
- **Current user highlight** - Left border in primary color
- **Glass-card container** - Semi-transparent background

### Backend Connections
- **Data from:** Team object with members array
- **Member structure:** { id, initials, name, branch, healthScore, lastScan }
- **Props:**
  - `team` - Team object with members
  - `currentUserId` - To highlight current user
  - `userRole` - For display purposes

---

## 13. **TeamViewToggle.tsx** (87 lines)

### Purpose
Toggle between personal and team views with team selector dropdown.

### Components
1. **View Mode Toggle Buttons**
   - "Personal" button - Default state
   - "Team" button - Shows team selector when active

2. **Team Selector Dropdown** (visible only in team view)
   - Displays list of teams user belongs to
   - Shows role badge for each team (admin/developer/viewer)
   - Admin teams show crown icon

### Role Badge Styling
- **Admin:** Primary color background
- **Developer:** Blue color
- **Viewer:** Muted color

### Backend Connections
- **Props:**
  - `viewMode` - "personal" | "team"
  - `onViewModeChange` - Callback to parent
  - `teams` - Array of Team objects
  - `selectedTeamId` - Current team selection
  - `onTeamChange` - Callback for team selection

- **Data validation:**
  - Returns null if no teams (hidden for solo users)
  - Filters teams by user membership

### Used By
- Main dashboard page to filter displayed data
- Affects which data MetricsRow, CriticalAlerts, etc. display

---

## 14. **VulnerabilityChart.tsx** (102 lines)

### Purpose
Line chart showing vulnerability trends over the last week (7 days).

### Chart Data
- **X-axis:** Days (Mon-Sun)
- **Y-axis:** Vulnerability count
- **3 lines:**
  - **Critical** (Red) - Destructive color
  - **High** (Orange) - Warning color
  - **Medium** (Blue) - Chart-3 color

### Mock Data Structure
```typescript
{
  date: string,     // "Mon", "Tue", etc.
  critical: number,
  high: number,
  medium: number
}
```

### Chart Features
- **Responsive container** - Scales to parent width
- **200px fixed height**
- **Interactive tooltip** - Shows values on hover
- **Smooth lines** - Monotone curve interpolation
- **Legend** - Color dots below chart for each severity level

### Recharts Configuration
- Grid with dashed pattern (opacity 0.3)
- Custom styling for dark theme
- Animated dots on active (scale up on hover)
- Card styling: semi-transparent background

### Backend Connections
- **Currently:** Uses mock data hardcoded in component
- **Should connect to:** Backend API for historical trend data
- **Planned integration points:**
  - Fetch vulnerability data from scan results
  - Filter by date range
  - Group by severity level
  - Real-time update capability

### No Current API Calls
- Needs backend endpoint for: `/api/vulnerability-trends?teamId=X&days=7`

---

## Architecture Patterns Used

### 1. **Caching Strategy** (BranchFileExplorer)
- Module-level cache survives component unmounting
- Stale-while-revalidate: show cached data + background refresh
- Cache freshness checks prevent unnecessary loads

### 2. **Role-Based Access Control**
- Components check `userRole` prop
- Different UI/functionality for admin/developer/viewer
- Examples: BranchFileExplorer, MetricsRow, RecentScansTable

### 3. **Real-time Integration** (CriticalAlerts, ConnectionStatus)
- Subscribes to WebSocket alerts
- Shows connection status indicators
- Fallback to mock data if realtime unavailable

### 4. **State Management**
- React hooks (useState, useEffect, useMemo, useCallback)
- Props-based data flow
- Minimal local state (mostly UI state)

### 5. **Toast Notifications**
- Error handling: `toast.error(message)`
- Success feedback: `toast.success(message)`
- Used in: DashboardSidebar, DashboardTopBar, BranchFileExplorer, GenerateReportDialog

### 6. **Responsive Design**
- Tailwind CSS with mobile-first approach
- Hidden elements (hidden sm:block for desktop)
- Responsive grids (grid-cols-1 sm:grid-cols-2 lg:grid-cols-4)
- Flexible layouts (flex flex-col lg:flex-row)

### 7. **Animation & Transitions**
- Staggered entrance animations (stagger-1, stagger-2, etc.)
- Fade-in effects (animate-fade-in)
- Slide-up animations (animate-slide-up)
- Hover scale/opacity transitions
- Smooth progress animation (1000ms ease-out)

---

## Type Definitions

### Team-Related
```typescript
type Team {
  id: string;
  name: string;
  members: TeamMember[];
  scans: Scan[];
  github_repo: string;
  github_branches: string[];
  currentUserRole: TeamRole;
}

type TeamRole = "admin" | "developer" | "viewer"

type BranchFileItem {
  path: string;
  type: "file" | "directory";
  size: number | null;
}
```

### Alert-Related
```typescript
type AlertRecord {
  id: string;
  vulnerability_id: string;
  user_id: string;
  status: string;
  created_at: string;
  updated_at: string;
}

type SubscriptionStatus = "SUBSCRIBED" | "CHANNEL_ERROR" | "TIMED_OUT" | "CLOSED"
```

---

## External Dependencies

### UI Libraries
- `lucide-react` - Icons (Shield, AlertTriangle, FileText, etc.)
- `recharts` - Charting library
- Custom UI components (`@/components/ui/*`)
  - Card, Button, Badge, Table, Select, Dialog, Calendar, Popover, Avatar, etc.

### Utilities
- `react-router-dom` - Navigation (useNavigate)
- `sonner` - Toast notifications
- `date-fns` - Date formatting
- Supabase - Authentication

### Hooks
- `@/hooks/use-current-user` - Gets authenticated user info
- `@/lib/team-data` - Team mock data and constants
- `@/lib/teams-api` - API calls for branch files

---

## Summary

These 14 components form the core of the SecureGuard dashboard UI. They handle:
- **Navigation & Layout** (DashboardLayout, DashboardSidebar, DashboardTopBar)
- **Real-time Alerts** (CriticalAlerts, ConnectionStatus)
- **Metrics Display** (MetricsRow, RadialProgress, VulnerabilityChart)
- **Data Tables** (RecentScansTable, TeamHealthOverview)
- **File Management** (BranchFileExplorer)
- **Report Generation** (GenerateReportDialog)
- **View Switching** (TeamViewToggle)
- **Empty States** (EmptyState)

Each component integrates with backend services for user authentication, scan data, team management, GitHub repository access, and real-time alert subscriptions.
