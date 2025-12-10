import { Shield, Github, Twitter, Linkedin } from "lucide-react";
import { Link } from "react-router-dom";
import { useInView } from "@/hooks/use-in-view";

const AnimatedFooter = () => {
  const { ref, isInView } = useInView({ threshold: 0.2 });

  return (
    <footer 
      ref={ref}
      className={`py-16 relative z-10 transition-all duration-1000 ${
        isInView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
      }`}
    >
      {/* Enhanced Background */}
      <div className="absolute inset-0 bg-gradient-to-t from-emerald-950/30 via-cyber-dark/80 to-transparent backdrop-blur-sm" />
      
      {/* Decorative Top Border */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent" />
      
      <div className="container mx-auto px-4 relative">
        <div className="flex flex-col md:flex-row items-center justify-between gap-8">
          {/* Logo */}
          <div className="flex items-center gap-2 group">
            <Shield className="h-6 w-6 text-emerald-400 transition-all duration-300 group-hover:drop-shadow-[0_0_8px_rgba(52,211,153,0.6)]" />
            <span className="text-lg font-bold text-white">SecureGuard Pro</span>
          </div>

          {/* Links */}
          <div className="flex flex-wrap items-center justify-center gap-6 text-sm">
            <Link 
              to="/about" 
              className="text-gray-300 hover:text-emerald-400 transition-colors relative after:absolute after:bottom-0 after:left-0 after:w-0 after:h-px after:bg-emerald-400 after:transition-all after:duration-300 hover:after:w-full"
            >
              About
            </Link>
            <Link 
              to="/privacy" 
              className="text-gray-300 hover:text-emerald-400 transition-colors relative after:absolute after:bottom-0 after:left-0 after:w-0 after:h-px after:bg-emerald-400 after:transition-all after:duration-300 hover:after:w-full"
            >
              Privacy
            </Link>
            <Link 
              to="/terms" 
              className="text-gray-300 hover:text-emerald-400 transition-colors relative after:absolute after:bottom-0 after:left-0 after:w-0 after:h-px after:bg-emerald-400 after:transition-all after:duration-300 hover:after:w-full"
            >
              Terms
            </Link>
            <Link 
              to="/contact" 
              className="text-gray-300 hover:text-emerald-400 transition-colors relative after:absolute after:bottom-0 after:left-0 after:w-0 after:h-px after:bg-emerald-400 after:transition-all after:duration-300 hover:after:w-full"
            >
              Contact
            </Link>
          </div>

          {/* Social Icons */}
          <div className="flex items-center gap-4">
            <a 
              href="#" 
              className="text-gray-400 hover:text-emerald-400 transition-all duration-300 hover:drop-shadow-[0_0_8px_rgba(52,211,153,0.6)]"
            >
              <Github className="h-5 w-5" />
            </a>
            <a 
              href="#" 
              className="text-gray-400 hover:text-emerald-400 transition-all duration-300 hover:drop-shadow-[0_0_8px_rgba(52,211,153,0.6)]"
            >
              <Twitter className="h-5 w-5" />
            </a>
            <a 
              href="#" 
              className="text-gray-400 hover:text-emerald-400 transition-all duration-300 hover:drop-shadow-[0_0_8px_rgba(52,211,153,0.6)]"
            >
              <Linkedin className="h-5 w-5" />
            </a>
          </div>
        </div>

        {/* Copyright */}
        <div className="mt-8 pt-8 border-t border-white/10 text-center text-sm text-gray-500">
          © {new Date().getFullYear()} SecureGuard Pro. All rights reserved.
        </div>
      </div>
    </footer>
  );
};

export default AnimatedFooter;
