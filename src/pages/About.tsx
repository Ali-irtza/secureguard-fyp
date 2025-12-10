import { Shield, Users, Target, Lock, ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

const About = () => {
  return (
    <div className="min-h-screen bg-gradient-to-b from-cyber-dark via-cyber-dark to-black text-foreground">
      {/* Navigation */}
      <nav className="container mx-auto px-4 py-6">
        <Link to="/">
          <Button variant="ghost" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Home
          </Button>
        </Link>
      </nav>

      <div className="container mx-auto px-4 py-16">
        {/* Hero Section */}
        <div className="text-center mb-20">
          <div className="inline-flex items-center gap-2 mb-6">
            <Shield className="h-10 w-10 text-primary" />
            <span className="text-2xl font-bold">SecureGuard Pro</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-6">
            Protecting Code, <span className="text-primary">Empowering Developers</span>
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            We're on a mission to make security accessible for every developer, 
            from startups to enterprise teams.
          </p>
        </div>

        {/* Mission Section */}
        <div className="grid md:grid-cols-2 gap-12 mb-20">
          <div className="space-y-6">
            <h2 className="text-3xl font-bold">Our Mission</h2>
            <p className="text-muted-foreground leading-relaxed">
              In an era where cyber threats evolve daily, we believe every line of code 
              deserves enterprise-grade security analysis. SecureGuard Pro leverages 
              cutting-edge AI to detect vulnerabilities before they become breaches.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              Founded by security researchers and developers, we understand the challenges 
              of building secure software under tight deadlines. Our platform integrates 
              seamlessly into your workflow, providing actionable insights without slowing you down.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {[
              { icon: Shield, label: "50K+", desc: "Scans Completed" },
              { icon: Users, label: "10K+", desc: "Active Users" },
              { icon: Target, label: "99.9%", desc: "Detection Rate" },
              { icon: Lock, label: "0", desc: "Data Breaches" },
            ].map((stat, i) => (
              <div key={i} className="p-6 rounded-xl bg-white/5 border border-white/10 text-center">
                <stat.icon className="h-8 w-8 text-primary mx-auto mb-3" />
                <p className="text-2xl font-bold">{stat.label}</p>
                <p className="text-sm text-muted-foreground">{stat.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Values Section */}
        <div className="mb-20">
          <h2 className="text-3xl font-bold text-center mb-12">Our Values</h2>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                title: "Security First",
                desc: "Every decision we make prioritizes the security of your code and data.",
              },
              {
                title: "Developer Experience",
                desc: "We build tools that developers actually want to use, not dread.",
              },
              {
                title: "Continuous Innovation",
                desc: "Our AI models evolve constantly to stay ahead of emerging threats.",
              },
            ].map((value, i) => (
              <div key={i} className="p-6 rounded-xl bg-white/5 border border-white/10">
                <h3 className="text-xl font-semibold mb-3 text-primary">{value.title}</h3>
                <p className="text-muted-foreground">{value.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default About;
