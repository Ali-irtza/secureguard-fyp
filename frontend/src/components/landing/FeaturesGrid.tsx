import { Brain, Clock, GitBranch } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

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
    title: "GitHub Integration",
    description: "Connect your repositories and scan on every push automatically. Seamless CI/CD pipeline integration.",
  },
];

const FeaturesGrid = () => {
  return (
    <section id="features" className="py-24 scroll-mt-16">
      <div className="container mx-auto px-4">
        {/* Section Header */}
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            Powerful Security Features
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Enterprise-grade vulnerability detection powered by cutting-edge AI technology
          </p>
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <Card key={index} className="group hover-glow">
              <CardHeader>
                <div className="w-14 h-14 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                  <feature.icon className="h-7 w-7 text-primary" />
                </div>
                <CardTitle className="text-xl">{feature.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-base">
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

export default FeaturesGrid;
