import type { Scan } from "@/components/dashboard/RecentScansTable";

export type TeamRole = "admin" | "developer" | "viewer";

export interface TeamMember {
  id: string;
  name: string;
  initials: string;
  branch: string;
  healthScore: number | null;
  lastScan: string | null;
}

export interface TeamAlert {
  id: string;
  title: string;
  project: string;
  timeAgo: string;
  memberName: string;
  branch: string;
}

export interface Team {
  id: string;
  name: string;
  currentUserRole: TeamRole;
  metrics: {
    totalScans: number;
    criticalVulns: number;
    healthScore: number;
    pendingScans: number;
  };
  members: TeamMember[];
  scans: Scan[];
  alerts: TeamAlert[];
  githubRepo?: string;
  branches?: string[];
}

export const CURRENT_USER_ID = "user-1";

export const mockTeams: Team[] = [
  {
    id: "team-1",
    name: "SecureGuard Team",
    currentUserRole: "admin",
    metrics: { totalScans: 512, criticalVulns: 28, healthScore: 79, pendingScans: 7 },
    githubRepo: "https://github.com/secureguard/main-app",
    branches: ["main", "develop", "staging", "feature/login", "feature/payments", "hotfix/auth", "dev/api-v2"],
    members: [
      { id: "user-1", name: "John Doe", initials: "JD", branch: "main", healthScore: 92, lastScan: "30 min ago" },
      { id: "user-2", name: "Ali Hassan", initials: "AH", branch: "feature/login", healthScore: 74, lastScan: "2 hours ago" },
      { id: "user-3", name: "Sara Kim", initials: "SK", branch: "feature/payments", healthScore: 45, lastScan: "1 day ago" },
      { id: "user-4", name: "Mike Chen", initials: "MC", branch: "dev/api-v2", healthScore: null, lastScan: null },
      { id: "user-5", name: "Lina Torres", initials: "LT", branch: "hotfix/auth", healthScore: 88, lastScan: "5 hours ago" },
    ],
    scans: [
      { id: "t1-1", projectName: "auth-service", date: new Date(Date.now() - 1000 * 60 * 30), status: "completed", vulnerabilities: { critical: 3, high: 7, medium: 14, low: 20 }, memberId: "user-2" },
      { id: "t1-2", projectName: "frontend-app", date: new Date(Date.now() - 1000 * 60 * 60), status: "completed", vulnerabilities: { critical: 1, high: 2, medium: 5, low: 10 }, memberId: "user-1" },
      { id: "t1-3", projectName: "payment-module", date: new Date(Date.now() - 1000 * 60 * 60 * 3), status: "in_progress", vulnerabilities: { critical: 0, high: 0, medium: 0, low: 0 }, memberId: "user-3" },
      { id: "t1-4", projectName: "api-gateway", date: new Date(Date.now() - 1000 * 60 * 60 * 6), status: "completed", vulnerabilities: { critical: 0, high: 1, medium: 3, low: 8 }, memberId: "user-5" },
      { id: "t1-5", projectName: "admin-panel", date: new Date(Date.now() - 1000 * 60 * 60 * 24), status: "failed", vulnerabilities: { critical: 0, high: 0, medium: 0, low: 0 }, memberId: "user-1" },
    ],
    alerts: [
      { id: "a1", title: "SQL Injection", project: "auth-service", timeAgo: "2 hours ago", memberName: "Ali Hassan", branch: "feature/login" },
      { id: "a2", title: "XSS Vulnerability", project: "frontend-app", timeAgo: "4 hours ago", memberName: "John Doe", branch: "main" },
      { id: "a3", title: "Hardcoded Secrets", project: "payment-module", timeAgo: "6 hours ago", memberName: "Sara Kim", branch: "feature/payments" },
      { id: "a4", title: "Path Traversal", project: "api-gateway", timeAgo: "1 day ago", memberName: "Lina Torres", branch: "hotfix/auth" },
    ],
  },
  {
    id: "team-2",
    name: "Ali's Project",
    currentUserRole: "developer",
    metrics: { totalScans: 128, criticalVulns: 5, healthScore: 91, pendingScans: 1 },
    members: [
      { id: "user-6", name: "Ali Raza", initials: "AR", branch: "main", healthScore: 95, lastScan: "1 hour ago" },
      { id: "user-1", name: "John Doe", initials: "JD", branch: "feature/dashboard", healthScore: 87, lastScan: "3 hours ago" },
      { id: "user-7", name: "Noor Fatima", initials: "NF", branch: "dev/testing", healthScore: 68, lastScan: "12 hours ago" },
    ],
    scans: [
      { id: "t2-1", projectName: "mobile-app", date: new Date(Date.now() - 1000 * 60 * 60), status: "completed", vulnerabilities: { critical: 0, high: 1, medium: 4, low: 12 }, memberId: "user-6" },
      { id: "t2-2", projectName: "dashboard-ui", date: new Date(Date.now() - 1000 * 60 * 60 * 3), status: "completed", vulnerabilities: { critical: 1, high: 0, medium: 2, low: 5 }, memberId: "user-1" },
      { id: "t2-3", projectName: "test-suite", date: new Date(Date.now() - 1000 * 60 * 60 * 12), status: "completed", vulnerabilities: { critical: 0, high: 2, medium: 6, low: 9 }, memberId: "user-7" },
    ],
    alerts: [
      { id: "a5", title: "Insecure Dependency", project: "mobile-app", timeAgo: "1 hour ago", memberName: "Ali Raza", branch: "main" },
      { id: "a6", title: "CSRF Token Missing", project: "dashboard-ui", timeAgo: "3 hours ago", memberName: "John Doe", branch: "feature/dashboard" },
    ],
  },
  {
    id: "team-3",
    name: "University Group",
    currentUserRole: "viewer",
    metrics: { totalScans: 64, criticalVulns: 2, healthScore: 72, pendingScans: 4 },
    members: [
      { id: "user-8", name: "Prof. Ahmed", initials: "PA", branch: "main", healthScore: 82, lastScan: "2 hours ago" },
      { id: "user-1", name: "John Doe", initials: "JD", branch: "student/project-1", healthScore: 60, lastScan: "2 days ago" },
      { id: "user-9", name: "Zara Malik", initials: "ZM", branch: "student/project-2", healthScore: null, lastScan: null },
      { id: "user-10", name: "Omar Khan", initials: "OK", branch: "student/project-3", healthScore: 55, lastScan: "1 day ago" },
    ],
    scans: [
      { id: "t3-1", projectName: "research-tool", date: new Date(Date.now() - 1000 * 60 * 60 * 2), status: "completed", vulnerabilities: { critical: 1, high: 3, medium: 7, low: 15 }, memberId: "user-8" },
      { id: "t3-2", projectName: "student-portal", date: new Date(Date.now() - 1000 * 60 * 60 * 48), status: "completed", vulnerabilities: { critical: 0, high: 1, medium: 3, low: 6 }, memberId: "user-1" },
      { id: "t3-3", projectName: "lab-dashboard", date: new Date(Date.now() - 1000 * 60 * 60 * 24), status: "in_progress", vulnerabilities: { critical: 0, high: 0, medium: 0, low: 0 }, memberId: "user-10" },
    ],
    alerts: [
      { id: "a7", title: "Open Redirect", project: "research-tool", timeAgo: "2 hours ago", memberName: "Prof. Ahmed", branch: "main" },
      { id: "a8", title: "Weak Password Hash", project: "student-portal", timeAgo: "2 days ago", memberName: "John Doe", branch: "student/project-1" },
    ],
  },
];
