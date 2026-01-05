import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

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
    python: ["def", "class", "import", "from", "if", "else", "elif", "for", "while", "return", "try", "except", "with", "as", "lambda", "yield", "raise", "pass", "break", "continue", "and", "or", "not", "in", "is", "None", "True", "False", "async", "await", "global", "nonlocal"],
    c: ["int", "char", "float", "double", "void", "if", "else", "for", "while", "do", "switch", "case", "break", "continue", "return", "struct", "typedef", "enum", "union", "const", "static", "extern", "sizeof", "unsigned", "signed", "long", "short", "include", "define", "NULL"],
    cpp: ["int", "char", "float", "double", "void", "if", "else", "for", "while", "do", "switch", "case", "break", "continue", "return", "struct", "typedef", "enum", "union", "const", "static", "extern", "sizeof", "unsigned", "signed", "long", "short", "include", "define", "NULL", "class", "public", "private", "protected", "virtual", "override", "new", "delete", "template", "typename", "namespace", "using", "try", "catch", "throw", "nullptr", "auto", "bool", "true", "false", "const_cast", "static_cast", "dynamic_cast", "reinterpret_cast"]
  };
  return keywords[language] || keywords.python;
};

const highlightSyntax = (content: string, language: string): React.ReactNode => {
  const keywords = getLanguageKeywords(language);
  
  // Simple syntax highlighting
  let result = content;
  
  // Highlight strings
  result = result.replace(/(["'`])(?:(?!\1)[^\\]|\\.)*\1/g, '<span class="text-amber-400">$&</span>');
  
  // Highlight comments
  if (language === "python") {
    result = result.replace(/(#.*)$/gm, '<span class="text-muted-foreground italic">$1</span>');
  } else {
    result = result.replace(/(\/\/.*)$/gm, '<span class="text-muted-foreground italic">$1</span>');
  }
  
  // Highlight keywords
  keywords.forEach(keyword => {
    const regex = new RegExp(`\\b(${keyword})\\b`, 'g');
    result = result.replace(regex, '<span class="text-purple-400 font-medium">$1</span>');
  });
  
  // Highlight numbers
  result = result.replace(/\b(\d+\.?\d*)\b/g, '<span class="text-cyan-400">$1</span>');
  
  // Highlight function calls
  result = result.replace(/(\w+)\s*\(/g, '<span class="text-blue-400">$1</span>(');
  
  return <span dangerouslySetInnerHTML={{ __html: result }} />;
};

export const CodeViewer = ({ lines, currentLine, language }: CodeViewerProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    // Auto-scroll to current line
    if (lineRefs.current[currentLine - 1]) {
      lineRefs.current[currentLine - 1]?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [currentLine]);

  return (
    <div 
      ref={scrollRef}
      className="h-full overflow-auto bg-[#0d1117] rounded-lg border border-border/30 font-mono text-sm"
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
      
      {/* Scan beam effect */}
      <div 
        className="absolute left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-primary to-transparent opacity-50 pointer-events-none"
        style={{
          top: `${(currentLine / lines.length) * 100}%`,
          transition: "top 150ms ease-out"
        }}
      />
    </div>
  );
};
