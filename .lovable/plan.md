

## Plan: Team-Aware New Scan Page

### Overview
Add project naming, Personal/Team scan toggle, multi-file upload, and role-based GitHub import behavior to the New Scan page. Uses existing mock team data from `src/lib/team-data.ts`.

---

### Data Changes

**`src/lib/team-data.ts`** — Add optional `githubRepo` field to `Team` interface:
- SecureGuard Team: `"https://github.com/secureguard/main-app"` with branches `["main", "develop", "staging", "feature/login", "feature/payments", "hotfix/auth", "dev/api-v2"]`
- Ali's Project: `"https://github.com/ali-raza/mobile-app"` with branches `["main", "feature/dashboard", "dev/testing"]`
- University Group: no repo (undefined)

---

### New Component

**`src/components/scan/ScanModeToggle.tsx`** — Reusable component containing:
- Personal/Team toggle buttons (green active, ghost inactive — same pattern as dashboard `TeamViewToggle`)
- Team selector dropdown (visible only in Team mode, excludes Viewer-only teams)
- Viewer info box when user only has Viewer roles
- Hidden entirely if user has no teams

---

### Changes to `src/components/scan/FileUploadArea.tsx`

- Change interface: `uploadedFile: File | null` → `uploadedFiles: File[]`
- Add `.zip` to supported extensions
- Enable `multiple` on the file input
- Update drop zone text: "Drop your files or .zip folder here" / "Supports .py, .c, .cpp, .h, .hpp files or a .zip archive up to 50MB"
- When files selected, show a file list below the drop zone (each with name, size, X remove button) instead of the single file display
- Validation: allow `.zip` files, validate each non-zip file individually

---

### Changes to `src/pages/NewScan.tsx`

#### State additions
```tsx
const [projectName, setProjectName] = useState("");
const [scanMode, setScanMode] = useState<"personal" | "team">("personal");
const [selectedTeamId, setSelectedTeamId] = useState<string>("");
const [uploadedFiles, setUploadedFiles] = useState<File[]>([]); // replaces uploadedFile
```

#### Pre-scan UI layout (between header and tabs):

1. **Project Name input** — Required field with label and placeholder. In team mode, show helper text below.

2. **ScanModeToggle** — Only if user has teams. Controls `scanMode` and `selectedTeamId`.

3. **canStartScan** updated: must also check `projectName.trim() !== ""`

#### GitHub tab in Team Scan mode — role-based rendering:

- **Admin**: Repo URL pre-filled from team data but editable (no lock icon). Branch dropdown shows all team branches, freely selectable. If no repo → "Connect Repository" button.
- **Developer**: Repo URL pre-filled and read-only with lock icon. Branch dropdown locked to their assigned branch with helper text. If no branch → disabled dropdown "No branch assigned". If no repo → info box.
- **Viewer**: Team scan content is blocked entirely (handled by ScanModeToggle showing info box).

#### Scan in-progress header (line ~476-481):
- Show `projectName · filename` instead of just filename
- If `scanMode === "team"`, add a small green "Team" badge (`bg-primary/20 text-primary text-xs px-2 py-0.5 rounded-full`)

#### Multi-file handling:
- `uploadedFile` state → `uploadedFiles: File[]`
- `handleDrop` and `handleFileSelect` updated to handle multiple files
- For scanning, use first file's content (existing mock scan behavior unchanged)
- `handleReset` clears `uploadedFiles` array and `projectName`

---

### Files to Create/Modify

| File | Action |
|------|--------|
| `src/lib/team-data.ts` | Add `githubRepo?: string` and `branches?: string[]` to Team interface + mock data |
| `src/components/scan/ScanModeToggle.tsx` | Create — toggle + team selector + viewer info box |
| `src/components/scan/FileUploadArea.tsx` | Modify — multi-file support, zip support, file list UI |
| `src/pages/NewScan.tsx` | Modify — add project name, scan mode state, role-based GitHub tab, scan header updates |

---

### Role Behavior Summary

| Feature | No Teams | Admin | Developer | Viewer |
|---------|----------|-------|-----------|--------|
| Toggle visible | No | Yes | Yes | Yes |
| Team scan content | N/A | Full access | Upload + locked GitHub | Info box only |
| GitHub repo URL | Free text | Pre-filled, editable | Pre-filled, locked | Blocked |
| GitHub branch | Free select | All branches | Own branch only, locked | Blocked |
| Multi-file upload | Yes | Yes | Yes | Personal only |
| Project name | Yes | Yes | Yes | Yes (personal) |

