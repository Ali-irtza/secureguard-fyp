import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const faqs = [
  {
    question: "What programming languages are supported?",
    answer: "SecureGuard Pro currently supports Python and C++ with deep analysis capabilities. Our AI models are trained specifically on security patterns for each supported language.",
  },
  {
    question: "How secure is my code during scanning?",
    answer: "Your code is stored in encrypted, isolated containers so you can rescan anytime without re-uploading. We use end-to-end encryption for all data transfers, and our infrastructure is SOC 2 Type II certified. Only you and your authorized team members can access your stored code.",
  },
  {
    question: "How does the AI-driven analysis detect vulnerabilities",
    answer: "The FastAPI backend utilizes specialized AI models to scan your code for flaws, generating a comprehensive Vulnerability Report that categorizes risks by severity and provides suggested fixes.",
  },
];

const FAQ = () => {
  return (
    <section id="faq" className="py-24 scroll-mt-16 relative z-10">
      <div className="container mx-auto px-4">
        {/* Section Header */}
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Frequently Asked Questions
          </h2>
          <p className="text-lg text-gray-400 max-w-2xl mx-auto">
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
                className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl px-6"
              >
                <AccordionTrigger className="text-left hover:no-underline py-6 text-white [&>svg]:text-emerald-400">
                  <span className="text-lg font-medium">
                    {faq.question}
                  </span>
                </AccordionTrigger>
                <AccordionContent className="text-gray-400 pb-6">
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
