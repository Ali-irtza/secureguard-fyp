import { Button } from "@/components/ui/button";
import { ArrowRight, Shield, Zap, Target } from "lucide-react";
import heroImage from "@/assets/hero-minimal.png";

const HeroSection = () => {
  return (
    <section className="relative min-h-screen flex items-center justify-center pt-16 overflow-hidden">
      {/* Background Image */}
      <div 
        className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-40"
        style={{ backgroundImage: `url(${heroImage})` }}
      />
      
      {/* Dark Overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-background/90 to-background" />

      <div className="container mx-auto px-4 relative z-10">
        <div className="max-w-4xl mx-auto text-center">
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
            <span className="text-gradient-emerald">AI-Driven Precision</span>
          </h1>

          {/* Subhead */}
          <p className="text-lg md:text-xl text-muted-foreground mb-10 max-w-2xl mx-auto">
            Detect hidden vulnerabilities in Python and C++ before deployment. 
            Protect your applications with enterprise-grade security analysis.
          </p>

          {/* CTA Button */}
          <Button size="lg" className="glow-emerald text-lg px-10 py-6 group">
            Scan Code Now
            <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
          </Button>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-20">
            <div className="glass-card p-6 rounded-xl border border-primary/20 hover:border-primary/40 transition-colors group">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mx-auto mb-4 group-hover:bg-primary/20 transition-colors">
                <Shield className="h-6 w-6 text-primary" />
              </div>
              <p className="text-3xl font-bold text-foreground mb-1">50K+</p>
              <p className="text-sm text-muted-foreground">Scans Completed</p>
            </div>
            
            <div className="glass-card p-6 rounded-xl border border-primary/20 hover:border-primary/40 transition-colors group">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mx-auto mb-4 group-hover:bg-primary/20 transition-colors">
                <Target className="h-6 w-6 text-primary" />
              </div>
              <p className="text-3xl font-bold text-foreground mb-1">99.9%</p>
              <p className="text-sm text-muted-foreground">Detection Rate</p>
            </div>
            
            <div className="glass-card p-6 rounded-xl border border-primary/20 hover:border-primary/40 transition-colors group">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mx-auto mb-4 group-hover:bg-primary/20 transition-colors">
                <Zap className="h-6 w-6 text-primary" />
              </div>
              <p className="text-3xl font-bold text-foreground mb-1">2.5s</p>
              <p className="text-sm text-muted-foreground">Avg Scan Time</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
