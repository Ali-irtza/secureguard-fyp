# Frontend Scan Components Documentation

## Overview
The scan components directory contains 5 React/TypeScript files that compose the security scanning interface. These components handle file uploads, code display, scan progress tracking, logging, and team/personal scan mode selection. This is the core user interface for initiating and monitoring vulnerability scans.

---

## 1. **CodeViewer.tsx** (147 lines)

### Purpose
Interactive code viewer with real-time syntax highlighting and vulnerability indicators. Displays source code being scanned with status annotations for each line.

### Data Structure
```typescript
interface CodeLine {
  lineNumber: number;
  content: string;
  status: "pending" | "scanning" | "safe" | "vulnerable";
  vulnerability?: string;
}

interface CodeViewerProps {
  lines: CodeLine[];
  currentLine: number;
  language: string;
}
```

### Key Features

#### Syntax Highlighting
- **Language Support:** C and C++ with keyword detection
- **Highlights:**
  - Strings: `"text"` → amber-400
  - Comments: `// text` → muted-foreground (italic)
  - Keywords: `int`, `void`, `struct`, `class`, etc. → purple-400
  - Numbers: `123`, `45.67` → cyan-400
  - Function calls: `func()` → blue-400

- **C Keywords (31 total):**
  - Basic types: int, char, float, double, void
  - Control flow: if, else, for, while, do, switch, case, break, continue, return
  - Storage: struct, typedef, enum, union, const, static, extern, sizeof, unsigned, signed, long, short
  - Preprocessor: include, define, NULL

- **C++ Additional Keywords (30+):**
  - OOP: class, public, private, protected, virtual, override, new, delete
  - Templates: template, typename, namespace, using
  - Exception handling: try, catch, throw
  - Modern C++: nullptr, auto, bool, true, false
  - Casting: const_cast, static_cast, dynamic_cast, reinterpret_cast

#### Line Status Rendering
```typescript
status: "pending"    → opacity-40 (not yet scanned)
status: "scanning"   → bg-primary/20 + glow shadow + moving indicator
status: "safe"       → opacity-70 (safe code)
status: "vulnerable" → bg-destructive/20 + left border + red text + warning
```

#### Auto-Scroll Behavior
- **Default:** Auto-scroll enabled, follows current scanning line
- **User Scroll:** Disables auto-scroll when user manually scrolls
- **Toggle Button:** User can re-enable auto-scroll manually
- **Smooth Behavior:** Scrolls to center of viewport

### Backend Connections
- **No direct API calls** - Component receives scan state from parent
- **Receives data from parent:** Scan progress updates with line statuses
- **Status updates expected from:** Backend websocket or polling for scan progress

### UI Elements
- **Header:** Shows language (C/C++) and total line count
- **Auto-scroll toggle:** Button to control scrolling behavior
- **Line numbers:** Right-aligned, color-coded by status
- **Vulnerability badge:** `⚠ [Vulnerability Name]` pulsing indicator
- **Dark theme:** #0d1117 background (GitHub-like styling)

---

## 2. **FileUploadArea.tsx** (172 lines)

### Purpose
Drag-and-drop file upload interface with validation, file list management, and language support badges.

### Supported File Types
```typescript
SUPPORTED_EXTENSIONS = [".c", ".cpp", ".cc", ".cxx", ".h", ".hpp", ".zip"]

LANGUAGE_BADGES = [
  { ext: ".c", label: "C", color: "bg-purple-500/20 text-purple-400" },
  { ext: ".cpp", label: "C++", color: "bg-pink-500/20 text-pink-400" },
  { ext: ".zip", label: "ZIP", color: "bg-yellow-500/20 text-yellow-400" },
]
```

### Props & Behavior
```typescript
interface FileUploadAreaProps {
  uploadedFiles: File[];          // Currently selected files
  isDragOver: boolean;             // Drag state
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  onFileSelect: (e: React.ChangeEvent) => void;
  onRemoveFile: (index: number) => void;
}
```

### File Validation
- **Validates extension** before accepting files
- **Toast error** for unsupported types:
  ```
  "Unsupported file type: .xyz"
  "Please upload C (.c, .h), C++ (.cpp, .hpp), or .zip files only."
  ```
- **Accepts multiple files** in one upload
- **Max file size:** 50MB (per file or total unclear - likely parent responsibility)

### UI States

#### Drop Zone
- **Default:** Border dashed, hover highlights with primary color
- **Dragging:** Border solid primary, bg-primary/10, scale 1.02
- **Files Selected:** Border primary/50, bg-primary/5

#### Upload Icon
- **Empty:** Upload icon, muted color
- **Dragging:** Upload icon, primary color, scaled up
- **Files Selected:** FileCode icon, primary color

#### File List Display
```typescript
// Each file shows:
- FileCode icon
- File name (truncated)
- File size in KB
- Remove button (X icon)
```

### Backend Connections
- **No direct API calls** - Component handles local file selection
- **Files need to be sent to backend via:** Parent component (not shown)
- **Expected backend endpoint:** `/api/scan/upload` or similar (to be implemented)
- **File handling:** Likely sent as FormData with multipart/form-data

### Key Features
- **Drag & drop validation** - Validates before accepting drop
- **Multiple file selection** - Supports multiple files
- **File removal** - Can remove selected files before uploading
- **Language badges** - Shows supported languages
- **Size display** - Shows file size in KB for each file

---

## 3. **ScanLogTerminal.tsx** (86 lines)

### Purpose
Collapsible terminal-style log viewer displaying real-time scan process logs with timestamps and color-coded message types.

### Data Structure
```typescript
export interface LogEntry {
  timestamp: string;        // e.g., "14:32:45"
  message: string;          // Log message text
  type: "info" | "warning" | "error" | "success";
}

interface ScanLogTerminalProps {
  logs: LogEntry[];
  isExpanded: boolean;
  onToggleExpand: () => void;
}
```

### Log Type Styling
```typescript
type: "info"    → blue-400
type: "warning" → yellow-400 (+ ⚠ prefix)
type: "error"   → red-400 (+ ✗ prefix)
type: "success" → green-400 (+ ✓ prefix)
```

### UI Behavior
- **Header:** Always visible, shows entry count
- **Collapsed:** Height = 12 (h-12)
- **Expanded:** Height = 48 (h-48)
- **Smooth transition:** 300ms duration

#### Auto-Scroll
- Automatically scrolls to bottom when new logs appear
- Smooth scrolling behavior
- ScrollArea component for efficient rendering

#### Blinking Cursor
- Terminal-style `>` prompt
- Pulsing cursor animation at end of logs

### Backend Connections
- **Receives logs from:** Parent component via props
- **Expected log source:** WebSocket stream or polling for scan progress
- **Backend should send:** LogEntry objects with timestamp, message, type
- **Real-time updates:** Should push new LogEntry objects as scan progresses

### Example Log Flow
```
[14:32:01] ✓ AI Engine initialized
[14:32:02] ⚠ Large file detected: main.cpp
[14:32:05] Parsing source code...
[14:32:12] ✓ Parsing complete: 1250 lines
[14:32:13] Scanning for vulnerabilities...
[14:32:45] ⚠ Potential buffer overflow at line 234
[14:32:46] ✗ SQL injection risk detected at line 456
```

### Styling
- Dark background: #0d1117 (GitHub style)
- Monospace font (terminal aesthetic)
- Compact 3px padding
- Auto-scroll container with ScrollArea

---

## 4. **ScanModeToggle.tsx** (110 lines)

### Purpose
Allows users to switch between personal and team scans, with team selection dropdown and role-based access control.

### Data Structure
```typescript
interface ScanModeToggleProps {
  scanMode: "personal" | "team";
  onScanModeChange: (mode: "personal" | "team") => void;
  teams: Team[];
  selectedTeamId: string;
  onTeamChange: (teamId: string) => void;
}

type TeamRole = "admin" | "developer" | "viewer";
```

### Role-Based Access Control
```typescript
roleBadgeStyles = {
  admin:      "bg-primary/20 text-primary border-primary/30",
  developer:  "bg-blue-500/20 text-blue-400 border-blue-500/30",
  viewer:     "bg-muted text-muted-foreground border-border"
}
```

### Scan Permissions
- **Personal Scan:** Always available to all users
- **Team Scan:** Only for admin and developer roles
  - **Admin:** Can scan, sees all team members
  - **Developer:** Can scan, sees assigned branches/code
  - **Viewer:** CANNOT initiate scans, sees info message

### UI Components

#### Mode Toggle Buttons
```typescript
- "Personal Scan" button - Default selected
- "Team Scan" button - Shows team dropdown when selected
```

#### Team Selector (Visible when scanMode === "team")
- Dropdown with scanned-capable teams only (filters out viewer-only)
- Shows team name, role badge, and crown icon for admins
- Empty if user is viewer in all teams

#### Viewer-Only Info Box (When applicable)
```
Icon: Info icon
Title: "You have Viewer access in your team. You cannot initiate team scans."
Description: "You can still run Personal Scans or contact your Admin to change your role."
```

### Backend Connections
- **No direct API calls** - Component handles mode/team selection
- **Receives team data from:** Parent component (from mockTeams or backend)
- **Sends selections to parent:** onScanModeChange, onTeamChange callbacks
- **Backend integration:** Parent handles sending selected mode/team with scan files

### Filter Logic
```typescript
// Filters teams to only those where user has scan permission
scanableTeams = teams.filter(
  (t) => t.currentUserRole === "admin" || t.currentUserRole === "developer"
);
isViewerOnly = scanableTeams.length === 0;
```

---

## 5. **ScanningProgress.tsx** (155 lines)

### Purpose
Real-time scan progress display showing phases, statistics, and progress bar. Tracks scan completion across 5 phases.

### Data Structure
```typescript
interface ScanPhase {
  id: string;
  label: string;
  icon: React.ReactNode;
  status: "pending" | "active" | "completed";
}

interface ScanStats {
  linesScanned: number;      // Current progress
  totalLines: number;        // Total to scan
  vulnerabilitiesFound: number;
  elapsedTime: number;       // Seconds
}

interface ScanningProgressProps {
  currentPhase: number;      // 0-4 (which phase is active)
  stats: ScanStats;
  isComplete: boolean;
}
```

### 5 Scan Phases

#### Phase 0: Initializing AI Engine
- Icon: CPU chip
- Task: Loads AI models and prepares scanning engine

#### Phase 1: Parsing Source Code
- Icon: File search
- Task: Parses code into AST, validates syntax

#### Phase 2: Scanning for Vulnerabilities
- Icon: Bug
- Task: Runs vulnerability patterns, detects issues

#### Phase 3: Deep Analysis
- Icon: Shield
- Task: Performs advanced analysis, context understanding

#### Phase 4: Generating Report
- Icon: File text
- Task: Compiles results into vulnerability report

### Progress Calculation
```typescript
progressPercentage = (linesScanned / totalLines) * 100

// Example:
// Lines: 450/1250 scanned → 36%
// Time: 5:32 (5 min 32 sec)
// Vulnerabilities: 3 found
```

### Time Display
```typescript
// Converts elapsedTime (seconds) to MM:SS format
minutes = Math.floor(elapsedTime / 60)
seconds = elapsedTime % 60
display = "MM:SS"

// Example: 332 seconds → "05:32"
```

### Phase Status Indicators
```typescript
Status: "pending"   → Circle outline (○) + opacity-40 + muted color
Status: "active"    → Spinning loader + bg-primary/10 + primary color
Status: "completed" → Check mark (✓) + opacity-60 + foreground color
```

### Stats Display
```
Compact row showing:
450 / 1250 lines  |  05:32  |  ⚠ 3

Left: Lines scanned / Total
Center: Elapsed time MM:SS
Right: Vulnerabilities found (red if > 0)
```

### Progress Bar
```typescript
<Progress value={36} />
Status text: "Scanning..." or "Complete"
Percentage: "36%"
```

### Backend Connections
- **Receives updates from:** WebSocket or polling (parent component)
- **Data source:** Backend `/api/scan/progress` endpoint
- **Real-time updates expected:**
  - currentPhase increments (0 → 1 → 2 → 3 → 4)
  - stats.linesScanned increments incrementally
  - stats.vulnerabilitiesFound updates when issues found
  - stats.elapsedTime increments every second
  - isComplete becomes true when phase reaches 4

### Example Progress Timeline
```
Time 0s:   Phase 0 (init)
Time 2s:   Phase 1 (parsing) | 0/1250 lines
Time 5s:   Phase 2 (scanning) | 250/1250 lines | 0 vulns
Time 15s:  Phase 2 (scanning) | 600/1250 lines | 1 vuln
Time 25s:  Phase 2 (scanning) | 1250/1250 lines | 3 vulns
Time 26s:  Phase 3 (deep analysis) | 100% complete
Time 28s:  Phase 4 (report) | 100% complete
Time 30s:  Complete → isComplete = true
```

---

## Architecture & Data Flow

### Typical Scan Flow

```
1. User selects mode (Personal / Team)
   ↓ ScanModeToggle
   
2. User selects files
   ↓ FileUploadArea
   
3. Files uploaded to backend
   ↓ POST /api/scan/upload (to be implemented)
   
4. Backend returns scan job ID + starts processing
   
5. Frontend opens real-time connection (WebSocket)
   ↓ Receives progress updates
   
6. Progress updates received:
   - ScanningProgress shows phase and % complete
   - ScanLogTerminal displays log entries
   - CodeViewer shows current line being scanned
   
7. Scan completes → Results shown
```

### Component Props Flow
```
Parent (Scan Page)
├─ ScanModeToggle
│  ├─ props: scanMode, teams, onScanModeChange, onTeamChange
│  └─ output: Selected mode + team
│
├─ FileUploadArea
│  ├─ props: uploadedFiles, isDragOver, onDrop, onRemoveFile
│  └─ output: File list
│
├─ ScanningProgress (while scanning)
│  ├─ props: currentPhase, stats, isComplete
│  └─ input: Real-time updates from backend
│
├─ ScanLogTerminal (while scanning)
│  ├─ props: logs, isExpanded, onToggleExpand
│  └─ input: Log entries from backend
│
└─ CodeViewer (while scanning)
   ├─ props: lines, currentLine, language
   └─ input: Code + status updates from backend
```

---

## Backend Integration Points

### Required Backend Endpoints

#### 1. File Upload
```
POST /api/scan/upload
Content-Type: multipart/form-data

Request Body:
- files: File[] (multipart files)
- scanMode: "personal" | "team"
- teamId: string (if team mode)

Response:
{
  scanId: string,
  status: "queued",
  uploadedCount: number
}
```

#### 2. Scan Progress WebSocket
```
WebSocket: ws://backend/api/scan/{scanId}/progress

Messages received (JSON):
{
  type: "progress",
  phase: number,      // 0-4
  linesScanned: number,
  totalLines: number,
  vulnerabilitiesFound: number,
  elapsedTime: number
}

{
  type: "log",
  timestamp: string,
  message: string,
  logType: "info" | "warning" | "error" | "success"
}

{
  type: "code-line",
  lineNumber: number,
  content: string,
  status: "pending" | "scanning" | "safe" | "vulnerable",
  vulnerability: string  // if vulnerable
}

{
  type: "complete",
  reportUrl: string,
  vulnerabilitiesCount: number
}
```

#### 3. Scan Results
```
GET /api/scan/{scanId}/results
Response: Full vulnerability report with detailed findings
```

---

## Type Imports

```typescript
// From @/lib/team-data
type Team = {
  id: string;
  name: string;
  members: TeamMember[];
  currentUserRole: TeamRole;
  // ... other properties
}

type TeamRole = "admin" | "developer" | "viewer"

// From component files
interface CodeLine { ... }
interface ScanStats { ... }
interface LogEntry { ... }
interface ScanPhase { ... }
```

---

## External Dependencies

### UI Components
- `Button` - From @/components/ui/button
- `Badge` - From @/components/ui/badge
- `Progress` - From @/components/ui/progress
- `Select` - From @/components/ui/select (SelectTrigger, SelectContent, SelectItem)
- `ScrollArea` - From @/components/ui/scroll-area

### Icons (lucide-react)
- Upload, FileCode, X - FileUploadArea
- Terminal, ChevronDown, ChevronUp - ScanLogTerminal
- Info, Crown - ScanModeToggle
- Loader2, CheckCircle2, AlertTriangle, Shield, Cpu, FileSearch, Bug, FileText - ScanningProgress
- MousePointerClick - CodeViewer

### Utilities
- `cn` - From @/lib/utils (classname merger)
- `toast` - From sonner (notifications)

---

## Styling & Theme

### Color Scheme (Scan Component)
- **Background:** #0d1117 (GitHub dark)
- **Primary:** Emerald (#10b981)
- **Destructive/Error:** Red (#ef4444)
- **Warning/Alert:** Yellow (#eab308) or Orange
- **Success:** Green (#22c55e)
- **Info:** Blue (#3b82f6)

### Responsive Design
- Mobile-first approach
- Uses Tailwind responsive classes
- Full-width on mobile, adjusted on desktop

---

## Key Features & Behaviors

### 1. Real-Time Updates
- Code viewer highlights currently scanning line
- Progress bar updates with linesScanned count
- Logs auto-scroll to show latest entries
- Stats update in real-time

### 2. User Control
- Auto-scroll can be disabled in CodeViewer
- Terminal logs can be expanded/collapsed
- Scan mode can be switched before upload

### 3. Accessibility
- Semantic HTML structure
- Color + icons for status indication (not color-only)
- Proper heading hierarchy
- Keyboard navigation support

### 4. Performance
- Virtualization not needed (reasonable file sizes)
- Efficient re-renders using proper state management
- ScrollArea for optimal log display

---

## Summary

The scan components provide:
- **File Management:** Upload with validation
- **Code Display:** Syntax highlighting with live status
- **Progress Tracking:** 5-phase progress with real-time updates
- **Logging:** Terminal-style logs with auto-scroll
- **Access Control:** Role-based team/personal scanning

These components require backend WebSocket/polling integration to display real-time scan progress and will be connected to:
- FastAPI backend for AI vulnerability scanning
- Docker containers for isolated scans
- AWS infrastructure for scalability
- Real-time data streaming via WebSocket
