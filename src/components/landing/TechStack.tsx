const technologies = [
  {
    name: "Python",
    icon: "🐍",
    description: "Core Analysis Engine",
  },
  {
    name: "Docker",
    icon: "🐳",
    description: "Containerized Deployment",
  },
  {
    name: "FastAPI",
    icon: "⚡",
    description: "High-Performance API",
  },
  {
    name: "AWS",
    icon: "☁️",
    description: "Cloud Infrastructure",
  },
];

const TechStack = () => {
  return (
    <section className="py-24">
      <div className="container mx-auto px-4">
        {/* Section Header */}
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            Built with Industry-Leading Technology
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Our robust architecture ensures reliability, security, and blazing-fast performance
          </p>
        </div>

        {/* Tech Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {technologies.map((tech, index) => (
            <div
              key={index}
              className="glass-card p-6 text-center group hover:border-primary/40 transition-all duration-300"
            >
              <div className="text-4xl mb-4 grayscale group-hover:grayscale-0 transition-all duration-300">
                {tech.icon}
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-1">
                {tech.name}
              </h3>
              <p className="text-sm text-muted-foreground">
                {tech.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default TechStack;
