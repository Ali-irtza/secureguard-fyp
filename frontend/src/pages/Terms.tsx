import { ArrowLeft, Shield } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

const Terms = () => {
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

      <div className="container mx-auto px-4 py-16 max-w-4xl">
        {/* Header */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 mb-6">
            <Shield className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-4">Terms of Service</h1>
          <p className="text-muted-foreground">Last updated: {new Date().toLocaleDateString()}</p>
        </div>

        {/* Content */}
        <div className="space-y-12 text-muted-foreground">
          <section>
            <h2 className="text-2xl font-bold text-foreground mb-4">1. Acceptance of Terms</h2>
            <p className="leading-relaxed">
              By accessing or using SecureGuard Pro, you agree to be bound by these Terms of Service. 
              If you do not agree to these terms, please do not use our services.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-foreground mb-4">2. Description of Service</h2>
            <p className="leading-relaxed">
              SecureGuard Pro provides AI-powered code security analysis services. Our platform 
              scans code for vulnerabilities, provides security recommendations, and generates 
              detailed reports to help you improve your code security.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-foreground mb-4">3. User Responsibilities</h2>
            <p className="leading-relaxed mb-4">
              As a user of our service, you agree to:
            </p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>Provide accurate account information</li>
              <li>Maintain the security of your account credentials</li>
              <li>Only upload code you have the right to analyze</li>
              <li>Not use the service for any unlawful purpose</li>
              <li>Not attempt to bypass any security measures</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-foreground mb-4">4. Intellectual Property</h2>
            <p className="leading-relaxed">
              You retain all rights to code you upload to our platform. We do not claim ownership 
              of your code. Our analysis results and recommendations are provided for your use 
              in improving your code security.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-foreground mb-4">5. Limitation of Liability</h2>
            <p className="leading-relaxed">
              While we strive to provide accurate security analysis, SecureGuard Pro is provided 
              "as is" without warranty of any kind. We are not liable for any damages arising 
              from the use of our service or reliance on our analysis results.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-foreground mb-4">6. Service Modifications</h2>
            <p className="leading-relaxed">
              We reserve the right to modify, suspend, or discontinue any part of our service 
              at any time. We will provide notice of significant changes when possible.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-foreground mb-4">7. Termination</h2>
            <p className="leading-relaxed">
              We may terminate or suspend your account at any time for violations of these terms. 
              You may also terminate your account at any time by contacting our support team.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-foreground mb-4">8. Contact</h2>
            <p className="leading-relaxed">
              For questions about these Terms of Service, please contact us at{" "}
              <a href="mailto:legal@secureguard.pro" className="text-primary hover:underline">
                legal@secureguard.pro
              </a>
            </p>
          </section>
        </div>
      </div>
    </div>
  );
};

export default Terms;
