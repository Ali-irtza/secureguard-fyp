import { useLocation, Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { ShieldX, Terminal, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

const NotFound = () => {
  const location = useLocation();
  const [typedText, setTypedText] = useState("");
  const fullText = `> ACCESS DENIED\n> Route not found: ${location.pathname}\n> Initializing redirect protocol...`;

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  // Typing effect
  useEffect(() => {
    let index = 0;
    const interval = setInterval(() => {
      if (index <= fullText.length) {
        setTypedText(fullText.slice(0, index));
        index++;
      } else {
        clearInterval(interval);
      }
    }, 30);

    return () => clearInterval(interval);
  }, [fullText]);

  return (
    <div className="min-h-screen gradient-cyber flex items-center justify-center p-4 relative overflow-hidden">
      {/* Scan line effect */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-primary/5 to-transparent animate-scan-line" />
      </div>

      {/* Grid pattern overlay */}
      <div 
        className="absolute inset-0 opacity-10"
        style={{
          backgroundImage: `linear-gradient(hsl(var(--primary) / 0.3) 1px, transparent 1px),
                            linear-gradient(90deg, hsl(var(--primary) / 0.3) 1px, transparent 1px)`,
          backgroundSize: '50px 50px'
        }}
      />

      <div className="relative z-10 text-center max-w-2xl mx-auto">
        {/* Shield Icon */}
        <div className="relative inline-block mb-8">
          <ShieldX className="h-24 w-24 text-destructive animate-pulse" />
          <div className="absolute inset-0 h-24 w-24 bg-destructive/20 blur-xl rounded-full" />
        </div>

        {/* Glitchy 404 Text */}
        <div className="relative mb-8">
          <h1 className="text-[120px] md:text-[180px] font-bold leading-none tracking-tighter text-foreground relative">
            <span className="relative inline-block">
              4
              <span className="absolute inset-0 text-primary/50 animate-glitch-1" aria-hidden="true">4</span>
              <span className="absolute inset-0 text-destructive/50 animate-glitch-2" aria-hidden="true">4</span>
            </span>
            <span className="relative inline-block text-primary">
              0
              <span className="absolute inset-0 text-primary/50 animate-glitch-1" aria-hidden="true">0</span>
              <span className="absolute inset-0 text-destructive/50 animate-glitch-2" aria-hidden="true">0</span>
            </span>
            <span className="relative inline-block">
              4
              <span className="absolute inset-0 text-primary/50 animate-glitch-1" aria-hidden="true">4</span>
              <span className="absolute inset-0 text-destructive/50 animate-glitch-2" aria-hidden="true">4</span>
            </span>
          </h1>
          {/* Glow effect */}
          <div className="absolute inset-0 blur-3xl bg-primary/20 -z-10" />
        </div>

        {/* Error Title */}
        <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-4">
          Security Breach Detected
        </h2>
        <p className="text-muted-foreground text-lg mb-8">
          The requested resource could not be located in our secure systems.
        </p>

        {/* Terminal Box */}
        <div className="bg-background/80 backdrop-blur-sm border border-border/50 rounded-lg p-4 mb-8 text-left font-mono text-sm">
          <div className="flex items-center gap-2 mb-3 pb-3 border-b border-border/50">
            <Terminal className="h-4 w-4 text-primary" />
            <span className="text-muted-foreground">system_error.log</span>
          </div>
          <pre className="text-primary whitespace-pre-wrap">
            {typedText}
            <span className="animate-pulse">█</span>
          </pre>
        </div>

        {/* Return Button */}
        <Link to="/dashboard">
          <Button 
            size="lg" 
            className="gap-2 bg-primary hover:bg-primary/90 shadow-lg shadow-primary/25 transition-all hover:shadow-primary/40"
          >
            <ArrowLeft className="h-4 w-4" />
            Return to Dashboard
          </Button>
        </Link>
      </div>

      {/* Custom keyframes for animations */}
      <style>{`
        @keyframes scan-line {
          0% { transform: translateY(-100%); }
          100% { transform: translateY(100vh); }
        }
        .animate-scan-line {
          animation: scan-line 3s linear infinite;
        }
        @keyframes glitch-1 {
          0%, 100% { clip-path: inset(0 0 0 0); transform: translate(0); }
          20% { clip-path: inset(20% 0 60% 0); transform: translate(-2px, 2px); }
          40% { clip-path: inset(40% 0 40% 0); transform: translate(2px, -2px); }
          60% { clip-path: inset(60% 0 20% 0); transform: translate(-1px, 1px); }
          80% { clip-path: inset(80% 0 5% 0); transform: translate(1px, -1px); }
        }
        @keyframes glitch-2 {
          0%, 100% { clip-path: inset(0 0 0 0); transform: translate(0); }
          20% { clip-path: inset(60% 0 20% 0); transform: translate(2px, -2px); }
          40% { clip-path: inset(20% 0 60% 0); transform: translate(-2px, 2px); }
          60% { clip-path: inset(80% 0 5% 0); transform: translate(1px, -1px); }
          80% { clip-path: inset(40% 0 40% 0); transform: translate(-1px, 1px); }
        }
        .animate-glitch-1 {
          animation: glitch-1 2s infinite linear alternate-reverse;
        }
        .animate-glitch-2 {
          animation: glitch-2 3s infinite linear alternate-reverse;
        }
      `}</style>
    </div>
  );
};

export default NotFound;
