import { useState } from "react";
import { Shield, Menu, X } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
    setIsOpen(false);
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <Shield className="h-8 w-8 text-primary" />
            <span className="text-xl font-bold text-foreground">SecureGuard Pro</span>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-8">
            <button onClick={() => scrollTo("features")} className="text-muted-foreground hover:text-foreground transition-colors">
              Features
            </button>
            <button onClick={() => scrollTo("how-it-works")} className="text-muted-foreground hover:text-foreground transition-colors">
              How it Works
            </button>
            <button onClick={() => scrollTo("faq")} className="text-muted-foreground hover:text-foreground transition-colors">
              FAQ
            </button>
            <Button asChild className="glow-emerald">
              <Link to="/auth">Get Started</Link>
            </Button>
          </div>

          {/* Mobile Menu Button */}
          <button className="md:hidden text-foreground" onClick={() => setIsOpen(!isOpen)}>
            {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>

        {/* Mobile Navigation */}
        {isOpen && (
          <div className="md:hidden py-4 border-t border-border">
            <div className="flex flex-col gap-4">
              <button onClick={() => scrollTo("features")} className="text-muted-foreground hover:text-foreground transition-colors text-left">
                Features
              </button>
              <button onClick={() => scrollTo("how-it-works")} className="text-muted-foreground hover:text-foreground transition-colors text-left">
                How it Works
              </button>
              <button onClick={() => scrollTo("faq")} className="text-muted-foreground hover:text-foreground transition-colors text-left">
                FAQ
              </button>
              <Button asChild className="glow-emerald w-full">
                <Link to="/auth">Get Started</Link>
              </Button>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
};

export default Navbar;
