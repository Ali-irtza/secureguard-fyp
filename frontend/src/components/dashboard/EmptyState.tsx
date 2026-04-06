import { Plus, Shield } from "lucide-react";
import { useNavigate } from "react-router-dom";

const EmptyState = () => {
  const navigate = useNavigate();

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="glass-card p-12 text-center max-w-md animate-fade-in">
        {/* Animated Shield Icon */}
        <div className="relative mx-auto w-24 h-24 mb-8">
          <Shield className="h-24 w-24 text-primary/30" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="h-16 w-16 bg-primary/10 rounded-full animate-pulse" />
          </div>
          <div className="absolute inset-0 h-24 w-24 bg-primary/20 blur-2xl rounded-full" />
        </div>

        <h2 className="text-2xl font-bold text-foreground mb-3">
          Start Your First Scan
        </h2>
        <p className="text-muted-foreground mb-8">
          Upload your code or connect a repository to begin analyzing for vulnerabilities
        </p>

        {/* Large + Button */}
        <button
          onClick={() => navigate("/new-scan")}
          className="group relative mx-auto flex items-center justify-center w-20 h-20 rounded-full bg-primary/20 border-2 border-primary/50 hover:bg-primary/30 hover:border-primary transition-all duration-300 glow-emerald"
        >
          <Plus className="h-10 w-10 text-primary group-hover:scale-110 transition-transform" />
          <div className="absolute inset-0 rounded-full bg-primary/20 blur-xl opacity-0 group-hover:opacity-100 transition-opacity" />
        </button>

        <p className="text-sm text-muted-foreground mt-6">
          Click to start a new security scan
        </p>
      </div>
    </div>
  );
};

export default EmptyState;
