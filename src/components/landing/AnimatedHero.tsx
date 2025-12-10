import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight, Shield, Zap, Target } from "lucide-react";
import { useInView } from "@/hooks/use-in-view";

interface AnimatedCounterProps {
  end: number;
  suffix?: string;
  duration?: number;
}

const AnimatedCounter = ({ end, suffix = "", duration = 2000 }: AnimatedCounterProps) => {
  const [count, setCount] = useState(0);
  const [hasAnimated, setHasAnimated] = useState(false);
  const { ref, isInView } = useInView({ threshold: 0.3 });

  useEffect(() => {
    if (!isInView || hasAnimated) return;

    setHasAnimated(true);
    const startTime = Date.now();

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Easing function - accelerate then decelerate
      const eased = 1 - Math.pow(1 - progress, 3);
      
      setCount(Math.floor(eased * end));

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        setCount(end);
      }
    };

    requestAnimationFrame(animate);
  }, [isInView, end, duration, hasAnimated]);

  return (
    <span ref={ref} className={hasAnimated && count === end ? "animate-number-pop" : ""}>
      {count.toLocaleString()}{suffix}
    </span>
  );
};

const AnimatedHero = () => {
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    // Trigger animations after mount
    const timer = setTimeout(() => setIsLoaded(true), 100);
    return () => clearTimeout(timer);
  }, []);

  const words = ["Secure", "Your", "Code", "with"];
  const highlightWords = ["AI-Driven", "Precision"];

  return (
    <section className="relative min-h-screen flex items-center justify-center pt-16 overflow-hidden">
      {/* Vignette overlay */}
      <div className="absolute inset-0 pointer-events-none z-[2]" 
        style={{
          background: "radial-gradient(ellipse at center, transparent 0%, rgba(10, 10, 15, 0.4) 70%, rgba(10, 10, 15, 0.8) 100%)"
        }}
      />

      <div className="container mx-auto px-4 relative z-10">
        <div className="max-w-4xl mx-auto text-center">
          {/* Floating Badge */}
          <div 
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/30 mb-8 backdrop-blur-sm transition-all duration-700 ${
              isLoaded ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-8"
            }`}
            style={{ 
              animation: isLoaded ? "float 4s ease-in-out infinite" : undefined,
              animationDelay: "0.5s"
            }}
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary animate-pulse-glow-dot"></span>
            </span>
            <span className="text-sm font-medium text-primary">AI-Powered Security Analysis</span>
          </div>

          {/* Animated Headline */}
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-foreground mb-6 leading-tight">
            {words.map((word, i) => (
              <span
                key={i}
                className={`inline-block mr-3 transition-all duration-500 ${
                  isLoaded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
                }`}
                style={{ transitionDelay: `${200 + i * 100}ms` }}
              >
                {word}
              </span>
            ))}
            <br className="hidden md:block" />
            {highlightWords.map((word, i) => (
              <span
                key={i}
                className={`inline-block mr-3 text-gradient-animated transition-all duration-500 ${
                  isLoaded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
                }`}
                style={{ transitionDelay: `${600 + i * 100}ms` }}
              >
                {word}
              </span>
            ))}
          </h1>

          {/* Subheading with blur-to-sharp */}
          <p 
            className={`text-lg md:text-xl text-muted-foreground mb-10 max-w-2xl mx-auto transition-all duration-700 ${
              isLoaded ? "opacity-100 translate-y-0 blur-0" : "opacity-0 translate-y-4 blur-sm"
            }`}
            style={{ transitionDelay: "800ms" }}
          >
            Detect hidden vulnerabilities in Python and C++ before deployment. 
            Protect your applications with enterprise-grade security analysis.
          </p>

          {/* CTA Button */}
          <div
            className={`transition-all duration-500 ${
              isLoaded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            }`}
            style={{ transitionDelay: "1000ms" }}
          >
            <Button 
              size="lg" 
              className="glow-emerald text-lg px-10 py-6 group relative overflow-hidden bg-gradient-animated-btn"
            >
              <span className="relative z-10 flex items-center">
                Scan Code Now
                <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1.5 transition-transform duration-300" />
              </span>
              <div className="absolute inset-0 bg-gradient-to-r from-primary via-emerald-glow to-primary bg-[length:200%_100%] animate-gradient-shift opacity-0 group-hover:opacity-100 transition-opacity" />
            </Button>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-20">
            {[
              { icon: Shield, value: 50, suffix: "K+", label: "Scans Completed", delay: 1200 },
              { icon: Target, value: 99.9, suffix: "%", label: "Detection Rate", delay: 1350 },
              { icon: Zap, value: 2.5, suffix: "s", label: "Avg Scan Time", delay: 1500 },
            ].map((stat, index) => (
              <div
                key={index}
                className={`glass-card p-6 rounded-xl border border-primary/20 hover:border-primary/40 transition-all duration-300 group cursor-default stat-card-hover ${
                  isLoaded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
                }`}
                style={{ transitionDelay: `${stat.delay}ms` }}
              >
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mx-auto mb-4 group-hover:bg-primary/20 transition-colors">
                  <stat.icon className="h-6 w-6 text-primary animate-slow-spin group-hover:animate-spin-once" />
                </div>
                <p className="text-3xl font-bold text-foreground mb-1">
                  {stat.suffix === "K+" ? (
                    <AnimatedCounter end={stat.value} suffix={stat.suffix} />
                  ) : stat.suffix === "%" ? (
                    <AnimatedCounter end={99} suffix=".9%" />
                  ) : (
                    <AnimatedCounter end={2} suffix=".5s" />
                  )}
                </p>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default AnimatedHero;
