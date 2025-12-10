import { Shield } from "lucide-react";

const BrandingPanel = () => {
  return (
    <div className="hidden lg:flex flex-col justify-between h-full bg-gradient-to-br from-background via-card to-background p-12 relative overflow-hidden">
      {/* Animated circuit pattern background */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute inset-0" style={{
          backgroundImage: `
            linear-gradient(to right, hsl(var(--primary) / 0.3) 1px, transparent 1px),
            linear-gradient(to bottom, hsl(var(--primary) / 0.3) 1px, transparent 1px)
          `,
          backgroundSize: '40px 40px'
        }} />
        {/* Glowing nodes */}
        <div className="absolute top-1/4 left-1/4 w-2 h-2 rounded-full bg-primary animate-pulse-glow" />
        <div className="absolute top-1/3 right-1/3 w-2 h-2 rounded-full bg-emerald animate-pulse-glow" style={{ animationDelay: '0.5s' }} />
        <div className="absolute bottom-1/4 left-1/3 w-2 h-2 rounded-full bg-primary animate-pulse-glow" style={{ animationDelay: '1s' }} />
        <div className="absolute bottom-1/3 right-1/4 w-2 h-2 rounded-full bg-emerald animate-pulse-glow" style={{ animationDelay: '1.5s' }} />
      </div>

      {/* Glow effects */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-primary/20 rounded-full blur-[120px] -translate-y-1/2 translate-x-1/2" />
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-emerald/20 rounded-full blur-[120px] translate-y-1/2 -translate-x-1/2" />

      {/* Logo */}
      <div className="relative z-10">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Shield className="h-10 w-10 text-primary" />
            <div className="absolute inset-0 blur-lg bg-primary/50 -z-10" />
          </div>
          <span className="text-2xl font-bold tracking-tight">
            <span className="text-foreground">Secure</span>
            <span className="text-primary">Guard</span>
            <span className="text-muted-foreground font-light ml-1">Pro</span>
          </span>
        </div>
      </div>

      {/* Quote */}
      <div className="relative z-10 flex-1 flex items-center justify-center">
        <div className="max-w-md">
          <blockquote className="text-2xl font-serif italic text-foreground/90 leading-relaxed">
            "Security is not a product, but a process."
          </blockquote>
          <cite className="mt-4 block text-muted-foreground not-italic">
            — Bruce Schneier
          </cite>
        </div>
      </div>

      {/* Bottom decoration */}
      <div className="relative z-10">
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <div className="w-2 h-2 rounded-full bg-emerald animate-pulse" />
          <span>Enterprise-grade protection</span>
        </div>
      </div>
    </div>
  );
};

export default BrandingPanel;
