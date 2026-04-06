import { Upload, Shield, FileText, ArrowRight } from "lucide-react";
import { useInView } from "@/hooks/use-in-view";

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

const StepCard = ({ step, index }: { step: typeof steps[0]; index: number }) => {
  const { ref, isInView } = useInView({ threshold: 0.2 });

  return (
    <div 
      ref={ref}
      className="relative group h-full"
    >
      {/* Step Card */}
      <div 
        className={`bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl p-8 text-center relative z-10 h-full flex flex-col transition-all duration-500 hover:scale-[1.02] hover:-translate-y-1 hover:shadow-lg hover:shadow-emerald-500/10 hover:border-emerald-500/30 ${
          isInView 
            ? "opacity-100 translate-y-0" 
            : "opacity-0 translate-y-8"
        }`}
        style={{ transitionDelay: `${index * 150}ms` }}
      >
        {/* Number Badge */}
        <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-3 py-1 bg-emerald-500 text-white text-sm font-bold rounded-full transition-transform duration-300 group-hover:scale-110">
          {step.number}
        </div>

        {/* Icon */}
        <div className="w-20 h-20 mx-auto rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-6 mt-4 transition-all duration-300 group-hover:bg-emerald-500/20 group-hover:border-emerald-500/40">
          <step.icon className="h-10 w-10 text-emerald-400 transition-transform duration-300 group-hover:scale-110" />
        </div>

        {/* Content */}
        <h3 className="text-xl font-semibold text-white mb-3">
          {step.title}
        </h3>
        <p className="text-gray-400 flex-grow">
          {step.description}
        </p>
      </div>

      {/* Arrow (Mobile) */}
      {index < steps.length - 1 && (
        <div className="md:hidden flex justify-center my-4">
          <ArrowRight className="h-6 w-6 text-emerald-400 rotate-90" />
        </div>
      )}
    </div>
  );
};

const HowItWorks = () => {
  return (
    <section id="how-it-works" className="py-24 scroll-mt-16 relative z-10">
      <div className="container mx-auto px-4">
        {/* Section Header */}
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            How It Works
          </h2>
          <p className="text-lg text-gray-400 max-w-2xl mx-auto">
            Get started in minutes with our simple three-step process
          </p>
        </div>

        {/* Steps */}
        <div className="grid md:grid-cols-3 gap-8 relative">
          {/* Connector Lines (Desktop) */}
          <div className="hidden md:block absolute top-24 left-1/3 right-1/3 h-px bg-gradient-to-r from-emerald-500/50 via-emerald-400 to-emerald-500/50" />

          {steps.map((step, index) => (
            <StepCard key={index} step={step} index={index} />
          ))}
        </div>
      </div>
    </section>
  );
};

export default HowItWorks;
