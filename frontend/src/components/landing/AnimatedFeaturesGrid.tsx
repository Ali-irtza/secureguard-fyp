import { Brain, Clock, GitBranch } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useInView } from "@/hooks/use-in-view";

const features = [
  {
    icon: Brain,
    title: "AI Function Analysis",
    description: "Deep learning models analyze your code structure and detect complex vulnerabilities that traditional scanners miss.",
  },
  {
    icon: Clock,
    title: "Real-time Reporting",
    description: "Get instant feedback with detailed vulnerability reports as you code, with severity ratings and fix suggestions.",
  },
  {
    icon: GitBranch,
    title: "Team WorkSpaces",
    description: "Seamlessly invite developers and security auditors to shared projects. Manage repository access and track vulnerability resolutions across your entire organization",
  },
];

const AnimatedFeaturesGrid = () => {
  const { ref: sectionRef, isInView } = useInView({ threshold: 0.1 });

  return (
    <section id="features" className="py-24 scroll-mt-16 relative z-10" ref={sectionRef}>
      <div className="container mx-auto px-4">
        {/* Section Header */}
        <div 
          className={`text-center mb-16 transition-all duration-700 ${
            isInView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Powerful Security Features
          </h2>
          <p className="text-lg text-gray-400 max-w-2xl mx-auto">
            Enterprise-grade vulnerability detection powered by cutting-edge AI technology
          </p>
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <Card 
              key={index} 
              className={`group feature-card-hover backdrop-blur-sm bg-white/5 border-white/10 hover:border-emerald-500/30 transition-all duration-500 ${
                isInView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-12"
              }`}
              style={{ transitionDelay: `${200 + index * 150}ms` }}
            >
              <CardHeader>
                <div className="w-14 h-14 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-4 group-hover:bg-emerald-500/20 transition-all duration-300 group-hover:scale-110">
                  <feature.icon className="h-7 w-7 text-emerald-400 transition-transform duration-500 group-hover:rotate-12" />
                </div>
                <CardTitle className="text-xl text-white">{feature.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-base text-gray-400">
                  {feature.description}
                </CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
};

export default AnimatedFeaturesGrid;
