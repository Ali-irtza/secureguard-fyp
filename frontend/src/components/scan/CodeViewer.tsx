import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { MousePointerClick } from "lucide-react";

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

const getLanguageKeywords = (language: string): string[] => {
  const keywords: Record<string, string[]> = {
    c: ["int", "char", "float", "double", "void", "if", "else", "for", "while", "do", "switch", "case", "break", "continue", "return", "struct", "typedef", "enum", "union", "const", "static", "extern", "sizeof", "unsigned", "signed", "long", "short", "include", "define", "NULL"],
    cpp: ["int", "char", "float", "double", "void", "if", "else", "for", "while", "do", "switch", "case", "break", "continue", "return", "struct", "typedef", "enum", "union", "const", "static", "extern", "sizeof", "unsigned", "signed", "long", "short", "include", "define", "NULL", "class", "public", "private", "protected", "virtual", "override", "new", "delete", "template", "typename", "namespace", "using", "try", "catch", "throw", "nullptr", "auto", "bool", "true", "false", "const_cast", "static_cast", "dynamic_cast", "reinterpret_cast"]
  };
  return keywords[language] || keywords.c;
};

const highlightSyntax = (content: string, language: string): React.ReactNode => {
  const keywords = getLanguageKeywords(language);
  const tokens = content.match(/\/\/.*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b\d+\.?\d*\b|\b[A-Za-z_]\w*\b|\s+|./g) ?? [content];

  return (
    <>
      {tokens.map((token, index) => {
        const nextToken = tokens[index + 1] ?? "";
        if (token.startsWith("//")) {
          return <span key={index} className="text-muted-foreground italic">{token}</span>;
        }
        if (/^(['"]).*\1$/.test(token)) {
          return <span key={index} className="text-amber-400">{token}</span>;
        }
        if (/^\d/.test(token)) {
          return <span key={index} className="text-cyan-400">{token}</span>;
        }
        if (keywords.includes(token)) {
          return <span key={index} className="text-purple-400 font-medium">{token}</span>;
        }
        if (/^[A-Za-z_]\w*$/.test(token) && nextToken.trimStart().startsWith("(")) {
          return <span key={index} className="text-blue-400">{token}</span>;
        }
        return <span key={index}>{token}</span>;
      })}
    </>
  );
};

export const CodeViewer = ({ lines, currentLine, language }: CodeViewerProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(true);
  const lastUserScrollTime = useRef(0);

  // Handle user scroll to temporarily disable auto-scroll
  const handleScroll = () => {
    lastUserScrollTime.current = Date.now();
    setAutoScrollEnabled(false);
  };

  // No auto-re-enable - user has full control once they scroll

  // Auto-scroll to current line only when enabled
  useEffect(() => {
    if (autoScrollEnabled && lineRefs.current[currentLine - 1]) {
      lineRefs.current[currentLine - 1]?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [currentLine, autoScrollEnabled]);

  return (
    <div className="h-full w-full flex flex-col bg-[#0d1117] rounded-lg border border-border/30 font-mono text-sm relative">
      {/* Auto-scroll toggle header */}
      <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-2 bg-[#0d1117]/95 backdrop-blur border-b border-border/30">
        <span className="text-xs text-muted-foreground uppercase tracking-wider">
          {language.toUpperCase()} • {lines.length} lines
        </span>
        <button 
          onClick={() => setAutoScrollEnabled(!autoScrollEnabled)}
          className={cn(
            "flex items-center gap-1.5 text-xs px-2 py-1 rounded transition-colors",
            autoScrollEnabled 
              ? "bg-primary/20 text-primary" 
              : "bg-muted/50 text-muted-foreground hover:bg-muted"
          )}
        >
          <MousePointerClick className="h-3 w-3" />
          Auto-scroll {autoScrollEnabled ? "ON" : "OFF"}
        </button>
      </div>
      
      <div 
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-auto"
      >
      <div className="p-4">
        {lines.map((line, index) => (
          <div
            key={line.lineNumber}
            ref={(el) => (lineRefs.current[index] = el)}
            className={cn(
              "flex transition-all duration-300 rounded",
              line.status === "scanning" && "bg-primary/20 shadow-[0_0_20px_rgba(16,185,129,0.3)]",
              line.status === "vulnerable" && "bg-destructive/20 border-l-2 border-destructive",
              line.status === "safe" && "opacity-70",
              line.status === "pending" && "opacity-40"
            )}
          >
            {/* Line number */}
            <div className={cn(
              "w-12 shrink-0 text-right pr-4 select-none border-r border-border/20 mr-4",
              line.status === "scanning" ? "text-primary" : "text-muted-foreground/50"
            )}>
              {line.lineNumber}
            </div>
            
            {/* Code content */}
            <div className={cn(
              "flex-1 whitespace-pre",
              line.status === "scanning" && "text-foreground",
              line.status === "vulnerable" && "text-destructive-foreground"
            )}>
              {highlightSyntax(line.content, language)}
              
              {/* Vulnerability indicator */}
              {line.status === "vulnerable" && line.vulnerability && (
                <span className="ml-4 text-xs px-2 py-0.5 rounded bg-destructive/30 text-destructive animate-pulse">
                  ⚠ {line.vulnerability}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
      
      </div>
    </div>
  );
};
