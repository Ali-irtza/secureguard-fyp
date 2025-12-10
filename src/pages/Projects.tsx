import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, FolderOpen, Eye, RotateCcw, Trash2, Plus } from "lucide-react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";

interface Project {
  id: string;
  name: string;
  language: "Python" | "C" | "C++";
  lastScan: string;
  healthScore: "A" | "B" | "C" | "D" | "F";
}

const mockProjects: Project[] = [
  { id: "1", name: "api-gateway", language: "Python", lastScan: "2024-12-08", healthScore: "A" },
  { id: "2", name: "auth-service", language: "C++", lastScan: "2024-12-07", healthScore: "B" },
  { id: "3", name: "payment-module", language: "Python", lastScan: "2024-12-05", healthScore: "C" },
  { id: "4", name: "data-processor", language: "C", lastScan: "2024-12-04", healthScore: "A" },
  { id: "5", name: "ml-pipeline", language: "Python", lastScan: "2024-12-03", healthScore: "D" },
  { id: "6", name: "embedded-firmware", language: "C", lastScan: "2024-12-01", healthScore: "B" },
  { id: "7", name: "crypto-lib", language: "C++", lastScan: "2024-11-28", healthScore: "F" },
  { id: "8", name: "web-scraper", language: "Python", lastScan: "2024-11-25", healthScore: "A" },
];

const languageBadgeStyles: Record<string, string> = {
  Python: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  C: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  "C++": "bg-purple-500/20 text-purple-400 border-purple-500/30",
};

const healthScoreStyles: Record<string, string> = {
  A: "bg-green-500/20 text-green-400 border-green-500/30",
  B: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  C: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  D: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  F: "bg-red-500/20 text-red-400 border-red-500/30",
};

const Projects = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [languageFilter, setLanguageFilter] = useState("all");
  const [projects, setProjects] = useState<Project[]>(mockProjects);

  const filteredProjects = projects.filter((project) => {
    const matchesSearch = project.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesLanguage = languageFilter === "all" || project.language === languageFilter;
    return matchesSearch && matchesLanguage;
  });

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const handleDelete = (projectId: string, projectName: string) => {
    setProjects(projects.filter((p) => p.id !== projectId));
    toast({
      title: "Project Deleted",
      description: `"${projectName}" has been removed.`,
    });
  };

  const handleRescan = (projectName: string) => {
    toast({
      title: "Re-scan Initiated",
      description: `Starting new scan for "${projectName}"...`,
    });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-foreground">Projects</h1>
            <p className="text-muted-foreground mt-1">Manage and monitor your code repositories</p>
          </div>
          <Button
            onClick={() => navigate("/new-scan")}
            className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-glow-primary"
          >
            <Plus className="w-4 h-4 mr-2" />
            New Project
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search projects..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-card/50 border-border/50 focus:border-primary/50"
            />
          </div>
          <Select value={languageFilter} onValueChange={setLanguageFilter}>
            <SelectTrigger className="w-full sm:w-48 bg-card/50 border-border/50">
              <SelectValue placeholder="Filter by Language" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Languages</SelectItem>
              <SelectItem value="Python">Python</SelectItem>
              <SelectItem value="C">C</SelectItem>
              <SelectItem value="C++">C++</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <div className="rounded-xl border border-border/50 bg-card/30 backdrop-blur-sm overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-border/50 hover:bg-transparent">
                <TableHead className="text-muted-foreground">Project Name</TableHead>
                <TableHead className="text-muted-foreground">Language</TableHead>
                <TableHead className="text-muted-foreground">Last Scan</TableHead>
                <TableHead className="text-muted-foreground">Health Score</TableHead>
                <TableHead className="text-muted-foreground text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredProjects.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-12">
                    <div className="flex flex-col items-center gap-2">
                      <FolderOpen className="w-10 h-10 text-muted-foreground/50" />
                      <p className="text-muted-foreground">No projects found</p>
                      <p className="text-sm text-muted-foreground/70">Try adjusting your search or filters</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filteredProjects.map((project) => (
                  <TableRow key={project.id} className="border-border/30 hover:bg-muted/10">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <FolderOpen className="w-4 h-4 text-primary" />
                        <span className="font-medium text-foreground">{project.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={languageBadgeStyles[project.language]}>
                        {project.language}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(project.lastScan)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={healthScoreStyles[project.healthScore]}>
                        {project.healthScore}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                              <Eye className="w-4 h-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>View Report</TooltipContent>
                        </Tooltip>

                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-foreground"
                              onClick={() => handleRescan(project.name)}
                            >
                              <RotateCcw className="w-4 h-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Re-scan</TooltipContent>
                        </Tooltip>

                        <AlertDialog>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive">
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </AlertDialogTrigger>
                            </TooltipTrigger>
                            <TooltipContent>Delete</TooltipContent>
                          </Tooltip>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Project</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to delete "{project.name}"? This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDelete(project.id, project.name)}
                                className="bg-destructive hover:bg-destructive/90"
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Projects;
