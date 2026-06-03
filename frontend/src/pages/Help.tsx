import { useState } from "react";
import { Search } from "lucide-react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import ContactForm from "@/components/contact/ContactForm";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

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
  }
];

const Help = () => {
  const [searchQuery, setSearchQuery] = useState("");

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

        {/* Contact Form */}
        <Card id="contact" className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader>
            <CardTitle>Contact Support</CardTitle>
            <CardDescription>
              Can't find what you're looking for? Send us a message and we'll get back to you within 24 hours.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ContactForm />
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Help;
