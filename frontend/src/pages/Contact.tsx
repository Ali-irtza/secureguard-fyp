import { ArrowLeft, Shield, Mail, MapPin, Clock } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import ContactForm from "@/components/contact/ContactForm";

const Contact = () => {

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
        {/* Header */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 mb-6">
            <Shield className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-4">Get in Touch</h1>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Have questions about SecureGuard Pro? We're here to help. 
            Reach out and our team will respond within 24 hours.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-12 max-w-5xl mx-auto">
          {/* Contact Form */}
          <div className="p-8 rounded-2xl bg-white/5 border border-white/10">
            <h2 className="text-2xl font-bold mb-6">Send us a Message</h2>
            <ContactForm />
          </div>

          {/* Contact Info */}
          <div className="space-y-8">
            <div>
              <h2 className="text-2xl font-bold mb-6">Contact Information</h2>
              <div className="space-y-6">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Mail className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold mb-1">Email</h3>
                    <p className="text-muted-foreground">support@secureguard.pro</p>
                    <p className="text-muted-foreground">finalyearproject2025@gmail.com</p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <MapPin className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold mb-1">Location</h3>
                    <p className="text-muted-foreground">Johar Town, Lahore</p>
                    <p className="text-muted-foreground">Pakistan</p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Clock className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold mb-1">Support Hours</h3>
                    <p className="text-muted-foreground">Monday - Friday</p>
                    <p className="text-muted-foreground">9:00 AM - 6:00 PM PST</p>
                  </div>
                </div>
              </div>
            </div>

            {/* FAQ Link */}
            <div className="p-6 rounded-xl bg-primary/10 border border-primary/20">
              <h3 className="font-semibold mb-2">Looking for quick answers?</h3>
              <p className="text-muted-foreground text-sm mb-4">
                Check out our FAQ section for answers to common questions.
              </p>
              <Link to="/#faq">
                <Button variant="outline" className="border-primary/30 hover:bg-primary/10">
                  View FAQ
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Contact;
