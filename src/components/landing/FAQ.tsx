import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const faqs = [
  {
    question: "What programming languages are supported?",
    answer: "SecureGuard Pro currently supports Python and C++ with deep analysis capabilities. We're actively working on adding support for JavaScript, TypeScript, Go, and Rust. Our AI models are trained specifically on security patterns for each supported language.",
  },
  {
    question: "How secure is my code during scanning?",
    answer: "Your code is processed in isolated, encrypted containers and is never stored after analysis. We use end-to-end encryption for all data transfers, and our infrastructure is SOC 2 Type II certified. Code is automatically purged from our systems within minutes of scan completion.",
  },
  {
    question: "Can I integrate with my CI/CD pipeline?",
    answer: "Absolutely! SecureGuard Pro offers native integrations with GitHub Actions, GitLab CI, Jenkins, and CircleCI. You can configure automatic scans on every push, pull request, or scheduled intervals. Our API also allows custom integrations with any CI/CD system.",
  },
];

const FAQ = () => {
  return (
    <section id="faq" className="py-24 bg-muted/30 scroll-mt-16">
      <div className="container mx-auto px-4">
        {/* Section Header */}
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            Frequently Asked Questions
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Everything you need to know about SecureGuard Pro
          </p>
        </div>

        {/* FAQ Accordion */}
        <div className="max-w-3xl mx-auto">
          <Accordion type="single" collapsible className="space-y-4">
            {faqs.map((faq, index) => (
              <AccordionItem
                key={index}
                value={`item-${index}`}
                className="glass-card px-6 border-none"
              >
                <AccordionTrigger className="text-left hover:no-underline py-6">
                  <span className="text-lg font-medium text-foreground">
                    {faq.question}
                  </span>
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground pb-6">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </section>
  );
};

export default FAQ;
