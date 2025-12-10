import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Shield, ChevronRight, ChevronLeft, Github, Zap, CheckCircle2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useOnboarding } from "@/hooks/use-onboarding";

const steps = [
  { id: 1, title: "Welcome" },
  { id: 2, title: "Connect" },
  { id: 3, title: "Configure" },
  { id: 4, title: "Complete" },
];

const Onboarding = () => {
  const navigate = useNavigate();
  const { completeOnboarding } = useOnboarding();
  const [currentStep, setCurrentStep] = useState(1);
  const [repoUrl, setRepoUrl] = useState("");
  const [scanType, setScanType] = useState("quick");
  const [typedText, setTypedText] = useState("");

  const welcomeMessage = "Initializing secure environment...";

  useEffect(() => {
    if (currentStep === 1) {
      let index = 0;
      const interval = setInterval(() => {
        setTypedText(welcomeMessage.slice(0, index + 1));
        index++;
        if (index >= welcomeMessage.length) clearInterval(interval);
      }, 50);
      return () => clearInterval(interval);
    }
  }, [currentStep]);

  const handleNext = () => {
    if (currentStep < 4) setCurrentStep(currentStep + 1);
  };

  const handleBack = () => {
    if (currentStep > 1) setCurrentStep(currentStep - 1);
  };

  const handleComplete = () => {
    completeOnboarding();
    navigate("/dashboard");
  };

  return (
    <div className="min-h-screen bg-background relative overflow-hidden flex items-center justify-center">
      {/* Background Effects */}
      <div className="absolute inset-0 gradient-cyber opacity-50" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-primary/10 via-transparent to-transparent" />
      
      {/* Animated grid lines */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute inset-0" style={{
          backgroundImage: `linear-gradient(hsl(var(--primary) / 0.3) 1px, transparent 1px),
                           linear-gradient(90deg, hsl(var(--primary) / 0.3) 1px, transparent 1px)`,
          backgroundSize: "50px 50px"
        }} />
      </div>

      {/* Main Content */}
      <div className="relative z-10 w-full max-w-2xl mx-4">
        {/* Progress Indicator */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {steps.map((step, index) => (
            <div key={step.id} className="flex items-center">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium transition-all duration-300 ${
                  currentStep >= step.id
                    ? "bg-primary text-primary-foreground glow-emerald"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {currentStep > step.id ? (
                  <CheckCircle2 className="h-5 w-5" />
                ) : (
                  step.id
                )}
              </div>
              {index < steps.length - 1 && (
                <div
                  className={`w-12 h-0.5 mx-2 transition-all duration-300 ${
                    currentStep > step.id ? "bg-primary" : "bg-muted"
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        {/* Step Content */}
        <div className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl p-8 shadow-2xl">
          {/* Step 1: Welcome */}
          {currentStep === 1 && (
            <div className="text-center space-y-6 animate-fade-in">
              <div className="relative inline-block">
                <Shield className="h-20 w-20 text-primary mx-auto" />
                <div className="absolute inset-0 h-20 w-20 bg-primary/30 blur-2xl rounded-full" />
              </div>
              
              <div className="space-y-2">
                <h1 className="text-3xl font-bold text-foreground">
                  Welcome to SecureGuard Pro
                </h1>
                <p className="text-muted-foreground text-lg">
                  Your intelligent security scanner that protects your codebase 24/7
                </p>
              </div>

              <div className="font-mono text-sm text-primary bg-primary/10 px-4 py-2 rounded-lg inline-block">
                <span className="text-muted-foreground">&gt; </span>
                {typedText}
                <span className="animate-pulse">_</span>
              </div>

              <Button onClick={handleNext} size="lg" className="gap-2 mt-4">
                Get Started <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}

          {/* Step 2: Connect Repository */}
          {currentStep === 2 && (
            <div className="space-y-6 animate-fade-in">
              <div className="text-center space-y-2">
                <Github className="h-12 w-12 text-primary mx-auto" />
                <h2 className="text-2xl font-bold text-foreground">
                  Connect Your Repository
                </h2>
                <p className="text-muted-foreground">
                  Link your codebase to start scanning for vulnerabilities
                </p>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="repo">Repository URL</Label>
                  <Input
                    id="repo"
                    placeholder="https://github.com/username/repo"
                    value={repoUrl}
                    onChange={(e) => setRepoUrl(e.target.value)}
                    className="bg-background/50"
                  />
                </div>

                <div className="grid grid-cols-3 gap-3">
                  {["GitHub", "GitLab", "Bitbucket"].map((provider) => (
                    <Button
                      key={provider}
                      variant="outline"
                      className="h-12 text-muted-foreground hover:text-foreground"
                    >
                      {provider}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="flex justify-between pt-4">
                <Button variant="ghost" onClick={handleBack} className="gap-2">
                  <ChevronLeft className="h-4 w-4" /> Back
                </Button>
                <div className="flex gap-2">
                  <Button variant="ghost" onClick={handleNext}>
                    Skip for now
                  </Button>
                  <Button onClick={handleNext} className="gap-2">
                    Continue <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Configure Scan */}
          {currentStep === 3 && (
            <div className="space-y-6 animate-fade-in">
              <div className="text-center space-y-2">
                <Zap className="h-12 w-12 text-primary mx-auto" />
                <h2 className="text-2xl font-bold text-foreground">
                  Choose Your First Scan
                </h2>
                <p className="text-muted-foreground">
                  Select the type of security scan to run on your codebase
                </p>
              </div>

              <RadioGroup value={scanType} onValueChange={setScanType} className="space-y-3">
                {[
                  { value: "quick", label: "Quick Scan", desc: "Fast vulnerability check (~5 min)", icon: "⚡" },
                  { value: "full", label: "Full Audit", desc: "Comprehensive security analysis (~30 min)", icon: "🔍" },
                  { value: "deps", label: "Dependency Check", desc: "Scan package dependencies (~2 min)", icon: "📦" },
                ].map((option) => (
                  <Label
                    key={option.value}
                    htmlFor={option.value}
                    className={`flex items-center gap-4 p-4 rounded-xl border cursor-pointer transition-all ${
                      scanType === option.value
                        ? "border-primary bg-primary/10"
                        : "border-border/50 hover:border-border"
                    }`}
                  >
                    <RadioGroupItem value={option.value} id={option.value} />
                    <span className="text-2xl">{option.icon}</span>
                    <div>
                      <p className="font-medium text-foreground">{option.label}</p>
                      <p className="text-sm text-muted-foreground">{option.desc}</p>
                    </div>
                  </Label>
                ))}
              </RadioGroup>

              <div className="flex justify-between pt-4">
                <Button variant="ghost" onClick={handleBack} className="gap-2">
                  <ChevronLeft className="h-4 w-4" /> Back
                </Button>
                <Button onClick={handleNext} className="gap-2">
                  Continue <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Step 4: Complete */}
          {currentStep === 4 && (
            <div className="text-center space-y-6 animate-fade-in">
              <div className="relative inline-block">
                <Sparkles className="h-20 w-20 text-primary mx-auto" />
                <div className="absolute inset-0 h-20 w-20 bg-primary/30 blur-2xl rounded-full" />
              </div>

              <div className="space-y-2">
                <h2 className="text-3xl font-bold text-foreground">
                  You're All Set!
                </h2>
                <p className="text-muted-foreground text-lg">
                  Your security environment is ready. Here are some tips to get started:
                </p>
              </div>

              <div className="text-left space-y-3 bg-background/50 rounded-xl p-6">
                {[
                  "Run regular scans to catch vulnerabilities early",
                  "Review critical alerts on your dashboard daily",
                  "Generate weekly reports for your team",
                  "Set up notifications for real-time updates",
                ].map((tip, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
                    <span className="text-foreground">{tip}</span>
                  </div>
                ))}
              </div>

              <div className="flex justify-between pt-4">
                <Button variant="ghost" onClick={handleBack} className="gap-2">
                  <ChevronLeft className="h-4 w-4" /> Back
                </Button>
                <Button onClick={handleComplete} size="lg" className="gap-2 glow-emerald">
                  Go to Dashboard <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Onboarding;
