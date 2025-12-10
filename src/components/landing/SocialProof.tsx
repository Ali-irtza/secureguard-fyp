const SocialProof = () => {
  const companies = [
    { name: "Google", letters: "GOOGLE" },
    { name: "Microsoft", letters: "MICROSOFT" },
    { name: "GitHub", letters: "GITHUB" },
    { name: "AWS", letters: "AWS" },
    { name: "Meta", letters: "META" },
    { name: "Stripe", letters: "STRIPE" },
  ];

  return (
    <section className="py-12 border-y border-border bg-muted/30">
      <div className="container mx-auto px-4">
        <p className="text-center text-sm text-muted-foreground mb-8">
          Trusted by security researchers at leading companies worldwide
        </p>
        
        <div className="flex flex-wrap items-center justify-center gap-8 md:gap-16">
          {companies.map((company) => (
            <div
              key={company.name}
              className="text-xl md:text-2xl font-bold text-muted-foreground/40 hover:text-muted-foreground/60 transition-colors tracking-widest"
            >
              {company.letters}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default SocialProof;
