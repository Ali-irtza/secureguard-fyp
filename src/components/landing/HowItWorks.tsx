import { Upload, Shield, FileText, ArrowRight } from "lucide-react";

const steps = [
  {
    icon: Upload,
    number: "01",
    title: "Upload or Link Repo",
    description: "Connect your GitHub repository or upload your code files directly to our secure platform.",
  },
  {
    icon: Shield,
    number: "02",
    title: "AI Scanning",
    description: "Our advanced AI analyzes your codebase, identifying vulnerabilities and security risks in real-time.",
  },
  {
    icon: FileText,
    number: "03",
    title: "Get Remediation Report",
    description: "Receive a comprehensive report with detailed findings, severity levels, and step-by-step fix instructions.",
  },
];

const HowItWorks = () => {
  return (
    <section id="how-it-works" className="py-24 bg-muted/30 scroll-mt-16">
      <div className="container mx-auto px-4">
        {/* Section Header */}
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            How It Works
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Get started in minutes with our simple three-step process
          </p>
        </div>

        {/* Steps */}
        <div className="grid md:grid-cols-3 gap-8 relative">
          {/* Connector Lines (Desktop) */}
          <div className="hidden md:block absolute top-24 left-1/3 right-1/3 h-px bg-gradient-to-r from-primary/50 via-primary to-primary/50" />

          {steps.map((step, index) => (
            <div 
              key={index} 
              className="relative group"
              style={{ animationDelay: `${index * 150}ms` }}
            >
              {/* Step Card */}
              <div className="glass-card p-8 text-center relative z-10 animate-fade-in opacity-0 [animation-fill-mode:forwards] transition-all duration-300 hover:scale-[1.02] hover:-translate-y-1 hover:shadow-lg hover:shadow-primary/10"
                style={{ animationDelay: `${index * 150}ms` }}
              >
                {/* Number Badge */}
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-3 py-1 bg-primary text-primary-foreground text-sm font-bold rounded-full transition-transform duration-300 group-hover:scale-110">
                  {step.number}
                </div>

                {/* Icon */}
                <div className="w-20 h-20 mx-auto rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-6 mt-4 transition-all duration-300 group-hover:bg-primary/20 group-hover:border-primary/40">
                  <step.icon className="h-10 w-10 text-primary transition-transform duration-300 group-hover:scale-110" />
                </div>

                {/* Content */}
                <h3 className="text-xl font-semibold text-foreground mb-3">
                  {step.title}
                </h3>
                <p className="text-muted-foreground">
                  {step.description}
                </p>
              </div>

              {/* Arrow (Mobile) */}
              {index < steps.length - 1 && (
                <div className="md:hidden flex justify-center my-4">
                  <ArrowRight className="h-6 w-6 text-primary rotate-90" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default HowItWorks;
