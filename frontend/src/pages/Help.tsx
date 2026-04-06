import { useState } from "react";
import { Search, Book, MessageSquare, MessagesSquare, Keyboard, ChevronRight, ExternalLink } from "lucide-react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { toast } from "sonner";

const quickActions = [
  {
    icon: Book,
    title: "Documentation",
    description: "Browse our comprehensive guides and API reference",
    href: "#docs",
  },
  {
    icon: MessageSquare,
    title: "Contact Support",
    description: "Get help from our security experts",
    href: "#contact",
  },
  {
    icon: MessagesSquare,
    title: "Community",
    description: "Join our Discord community for discussions",
    href: "#community",
  },
];

const faqs = [
  {
    question: "How do I run my first security scan?",
    answer: "Navigate to 'New Scan' from the sidebar, enter your repository URL or upload your code, select the scan type (Quick, Full, or Dependency), and click 'Start Scan'. The scan will analyze your codebase for vulnerabilities and generate a detailed report.",
  },
  {
    question: "What do the severity levels mean?",
    answer: "Critical (red) - Immediate action required, exploitable vulnerabilities. High (orange) - Serious issues that should be fixed soon. Medium (yellow) - Moderate risk, schedule for fixing. Low (green) - Minor issues, fix when convenient.",
  },
  {
    question: "How do I interpret scan results?",
    answer: "Each vulnerability is listed with its severity, location in code, description, and recommended fix. Click on any vulnerability to see detailed information including affected code lines and remediation steps.",
  },
  {
    question: "How do I generate and use API keys?",
    answer: "Go to Settings > API Keys to view your personal access token. Use this token to authenticate API requests from external tools and CI/CD pipelines. Keep your key secure and regenerate it if compromised.",
  },
  {
    question: "What scan types are available?",
    answer: "Quick Scan (~5 min) - Fast check for common vulnerabilities. Full Audit (~30 min) - Comprehensive security analysis. Dependency Check (~2 min) - Scans your package dependencies for known vulnerabilities.",
  },
];

const shortcuts = [
  { keys: ["Ctrl", "K"], action: "Open command palette" },
  { keys: ["Ctrl", "N"], action: "Start new scan" },
  { keys: ["Ctrl", "S"], action: "Save current settings" },
  { keys: ["Ctrl", "/"], action: "Toggle sidebar" },
  { keys: ["Esc"], action: "Close modal/dialog" },
];

const Help = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [contactForm, setContactForm] = useState({
    name: "",
    email: "",
    subject: "",
    message: "",
  });

  const handleSubmitContact = (e: React.FormEvent) => {
    e.preventDefault();
    toast.success("Support request submitted! We'll get back to you within 24 hours.");
    setContactForm({ name: "", email: "", subject: "", message: "" });
  };

  const filteredFaqs = faqs.filter(
    (faq) =>
      faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      faq.answer.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-foreground">Help & Support</h1>
          <p className="text-muted-foreground mt-1">
            Get assistance with SecureGuard Pro
          </p>
        </div>

        {/* Search Bar */}
        <div className="relative max-w-2xl">
          <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center gap-2 text-muted-foreground">
            <span className="font-mono text-primary">&gt;</span>
            <Search className="h-4 w-4" />
          </div>
          <Input
            placeholder="Search for help..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-14 h-12 bg-card/50 border-border/50 text-lg"
          />
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {quickActions.map((action) => (
            <Card
              key={action.title}
              className="bg-card/50 backdrop-blur-sm border-border/50 hover:border-primary/50 transition-all cursor-pointer group"
            >
              <CardContent className="p-6 flex items-start gap-4">
                <div className="p-3 rounded-lg bg-primary/10 text-primary group-hover:glow-emerald transition-all">
                  <action.icon className="h-6 w-6" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors flex items-center gap-2">
                    {action.title}
                    <ChevronRight className="h-4 w-4 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    {action.description}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* FAQ Section */}
        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader>
            <CardTitle>Frequently Asked Questions</CardTitle>
            <CardDescription>Find quick answers to common questions</CardDescription>
          </CardHeader>
          <CardContent>
            <Accordion type="single" collapsible className="w-full">
              {filteredFaqs.map((faq, index) => (
                <AccordionItem key={index} value={`item-${index}`}>
                  <AccordionTrigger className="text-left hover:text-primary">
                    {faq.question}
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">
                    {faq.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
            {filteredFaqs.length === 0 && (
              <p className="text-center text-muted-foreground py-8">
                No results found. Try a different search term.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Keyboard Shortcuts */}
        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Keyboard className="h-5 w-5" />
              Keyboard Shortcuts
            </CardTitle>
            <CardDescription>Speed up your workflow with these shortcuts</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {shortcuts.map((shortcut, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 rounded-lg bg-background/50 border border-border/30"
                >
                  <span className="text-muted-foreground">{shortcut.action}</span>
                  <div className="flex gap-1">
                    {shortcut.keys.map((key, i) => (
                      <kbd
                        key={i}
                        className="px-2 py-1 text-xs font-mono bg-muted rounded border border-border"
                      >
                        {key}
                      </kbd>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Contact Form */}
        <Card id="contact" className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader>
            <CardTitle>Contact Support</CardTitle>
            <CardDescription>
              Can't find what you're looking for? Send us a message and we'll get back to you within 24 hours.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmitContact} className="space-y-4 max-w-2xl">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    value={contactForm.name}
                    onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
                    required
                    className="bg-background/50"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={contactForm.email}
                    onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                    required
                    className="bg-background/50"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="subject">Subject</Label>
                <Input
                  id="subject"
                  value={contactForm.subject}
                  onChange={(e) => setContactForm({ ...contactForm, subject: e.target.value })}
                  required
                  className="bg-background/50"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="message">Message</Label>
                <Textarea
                  id="message"
                  rows={5}
                  value={contactForm.message}
                  onChange={(e) => setContactForm({ ...contactForm, message: e.target.value })}
                  required
                  className="bg-background/50 resize-none"
                />
              </div>
              <Button type="submit" className="gap-2">
                Send Message <ExternalLink className="h-4 w-4" />
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Help;
