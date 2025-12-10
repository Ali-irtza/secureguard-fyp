import { Button } from "@/components/ui/button";
import { ArrowRight, Play } from "lucide-react";
import heroImage from "@/assets/hero-minimal.png";

const HeroSection = () => {
  return (
    <section className="relative min-h-screen flex items-center pt-16 overflow-hidden">
      {/* Background Image */}
      <div 
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url(${heroImage})` }}
      />
      
      {/* Dark Overlay for readability */}
      <div className="absolute inset-0 bg-gradient-to-r from-background via-background/95 to-background/70" />
      
      {/* Animated Grid Pattern */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(16,185,129,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(16,185,129,0.05)_1px,transparent_1px)] bg-[size:48px_48px] animate-pulse" />

      <div className="container mx-auto px-4 relative z-10">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left Content */}
          <div className="text-left">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/30 mb-8 backdrop-blur-sm">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
              </span>
              <span className="text-sm font-medium text-primary">AI-Powered Security Analysis</span>
            </div>

            {/* Headline */}
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-foreground mb-6 leading-tight">
              Secure Your Code with{" "}
              <span className="text-gradient-emerald relative">
                AI-Driven Precision
                <svg className="absolute -bottom-2 left-0 w-full" viewBox="0 0 300 12" fill="none">
                  <path d="M2 10C50 4 100 2 150 6C200 10 250 4 298 8" stroke="hsl(var(--primary))" strokeWidth="3" strokeLinecap="round" className="opacity-60"/>
                </svg>
              </span>
            </h1>

            {/* Subhead */}
            <p className="text-lg md:text-xl text-muted-foreground mb-10 max-w-xl">
              Detect hidden vulnerabilities in Python and C++ before deployment. 
              Protect your applications with enterprise-grade security analysis.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row items-start gap-4">
              <Button size="lg" className="glow-emerald text-lg px-8 py-6 group">
                Scan Code Now
                <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
              </Button>
              <Button size="lg" variant="outline" className="text-lg px-8 py-6 border-primary/30 hover:bg-primary/10 backdrop-blur-sm">
                <Play className="mr-2 h-5 w-5" />
                View Demo
              </Button>
            </div>

            {/* Stats Row */}
            <div className="flex flex-wrap gap-8 mt-12 pt-8 border-t border-border/30">
              <div className="text-left">
                <p className="text-3xl md:text-4xl font-bold text-primary">50K+</p>
                <p className="text-sm text-muted-foreground mt-1">Scans Completed</p>
              </div>
              <div className="text-left">
                <p className="text-3xl md:text-4xl font-bold text-primary">99.9%</p>
                <p className="text-sm text-muted-foreground mt-1">Detection Rate</p>
              </div>
              <div className="text-left">
                <p className="text-3xl md:text-4xl font-bold text-primary">2.5s</p>
                <p className="text-sm text-muted-foreground mt-1">Avg Scan Time</p>
              </div>
            </div>
          </div>

          {/* Right Side - Code Preview Card */}
          <div className="hidden lg:block">
            <div className="glass-card p-6 rounded-2xl border border-primary/20 shadow-2xl shadow-primary/10 backdrop-blur-xl">
              {/* Terminal Header */}
              <div className="flex items-center gap-2 mb-4 pb-4 border-b border-border/50">
                <div className="w-3 h-3 rounded-full bg-destructive/80"></div>
                <div className="w-3 h-3 rounded-full bg-warning/80"></div>
                <div className="w-3 h-3 rounded-full bg-primary/80"></div>
                <span className="ml-3 text-xs text-muted-foreground font-mono">vulnerability_scan.py</span>
              </div>
              
              {/* Code Content */}
              <pre className="text-sm font-mono overflow-hidden">
                <code>
                  <div className="flex">
                    <span className="text-muted-foreground/50 w-8">1</span>
                    <span><span className="text-purple-400">def</span> <span className="text-primary">check_auth</span>(user_input):</span>
                  </div>
                  <div className="flex">
                    <span className="text-muted-foreground/50 w-8">2</span>
                    <span className="text-muted-foreground">    # SQL Injection vulnerability</span>
                  </div>
                  <div className="flex bg-destructive/10 -mx-6 px-6 border-l-2 border-destructive">
                    <span className="text-muted-foreground/50 w-8">3</span>
                    <span>    query = <span className="text-amber-400">f"SELECT * FROM users WHERE id=</span><span className="text-destructive">{'{'}user_input{'}'}</span><span className="text-amber-400">"</span></span>
                  </div>
                  <div className="flex">
                    <span className="text-muted-foreground/50 w-8">4</span>
                    <span>    <span className="text-purple-400">return</span> db.execute(query)</span>
                  </div>
                  <div className="flex mt-4">
                    <span className="text-muted-foreground/50 w-8">5</span>
                    <span><span className="text-purple-400">def</span> <span className="text-primary">check_auth_safe</span>(user_input):</span>
                  </div>
                  <div className="flex">
                    <span className="text-muted-foreground/50 w-8">6</span>
                    <span className="text-muted-foreground">    # Parameterized query (safe)</span>
                  </div>
                  <div className="flex bg-primary/10 -mx-6 px-6 border-l-2 border-primary">
                    <span className="text-muted-foreground/50 w-8">7</span>
                    <span>    query = <span className="text-amber-400">"SELECT * FROM users WHERE id=?"</span></span>
                  </div>
                  <div className="flex">
                    <span className="text-muted-foreground/50 w-8">8</span>
                    <span>    <span className="text-purple-400">return</span> db.execute(query, (user_input,))</span>
                  </div>
                </code>
              </pre>

              {/* Scan Result Badge */}
              <div className="mt-6 pt-4 border-t border-border/50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-destructive animate-pulse"></div>
                  <span className="text-sm text-muted-foreground">1 vulnerability detected</span>
                </div>
                <span className="text-xs font-mono text-primary bg-primary/10 px-2 py-1 rounded">SQL_INJECTION</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
