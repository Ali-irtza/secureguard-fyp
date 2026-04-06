import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { Terminal, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

export interface LogEntry {
  timestamp: string;
  message: string;
  type: "info" | "warning" | "error" | "success";
}

interface ScanLogTerminalProps {
  logs: LogEntry[];
  isExpanded: boolean;
  onToggleExpand: () => void;
}

export const ScanLogTerminal = ({ logs, isExpanded, onToggleExpand }: ScanLogTerminalProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Auto-scroll to bottom when new logs appear
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className={cn(
      "bg-[#0d1117] border border-border/30 rounded-lg overflow-hidden transition-all duration-300",
      isExpanded ? "h-48" : "h-12"
    )}>
      {/* Header */}
      <Button
        variant="ghost"
        className="w-full h-12 flex items-center justify-between px-4 rounded-none hover:bg-muted/10"
        onClick={onToggleExpand}
      >
        <div className="flex items-center gap-2 text-muted-foreground">
          <Terminal className="h-4 w-4" />
          <span className="text-sm font-medium">Process Logs</span>
          <span className="text-xs text-muted-foreground/60">({logs.length} entries)</span>
        </div>
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        )}
      </Button>

      {/* Log Content */}
      {isExpanded && (
        <ScrollArea className="h-36">
          <div ref={scrollRef} className="p-3 font-mono text-xs space-y-1">
            {logs.map((log, index) => (
              <div key={index} className="flex">
                <span className="text-muted-foreground/50 mr-2 shrink-0">
                  [{log.timestamp}]
                </span>
                <span className={cn(
                  log.type === "info" && "text-blue-400",
                  log.type === "warning" && "text-yellow-400",
                  log.type === "error" && "text-red-400",
                  log.type === "success" && "text-green-400"
                )}>
                  {log.type === "warning" && "⚠ "}
                  {log.type === "error" && "✗ "}
                  {log.type === "success" && "✓ "}
                  {log.message}
                </span>
              </div>
            ))}
            
            {/* Blinking cursor */}
            <div className="flex items-center">
              <span className="text-muted-foreground/50 mr-2">{">"}</span>
              <span className="w-2 h-4 bg-primary animate-pulse" />
            </div>
          </div>
        </ScrollArea>
      )}
    </div>
  );
};
