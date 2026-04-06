import CyberBackground from "@/components/landing/CyberBackground";
import FloatingCodeFragments from "@/components/landing/FloatingCodeFragments";
import VignetteOverlay from "@/components/landing/VignetteOverlay";
import AnimatedNavbar from "@/components/landing/AnimatedNavbar";
import AnimatedHero from "@/components/landing/AnimatedHero";
import SocialProof from "@/components/landing/SocialProof";
import AnimatedFeaturesGrid from "@/components/landing/AnimatedFeaturesGrid";
import HowItWorks from "@/components/landing/HowItWorks";
import TechStack from "@/components/landing/TechStack";
import FAQ from "@/components/landing/FAQ";
import AnimatedFooter from "@/components/landing/AnimatedFooter";

const Landing = () => {
  return (
    <div className="min-h-screen bg-cyber-dark overflow-x-hidden">
      {/* Background layers */}
      <CyberBackground />
      <FloatingCodeFragments />
      <VignetteOverlay />
      
      {/* Content */}
      <AnimatedNavbar />
      <AnimatedHero />
      <SocialProof />
      <AnimatedFeaturesGrid />
      <HowItWorks />
      <TechStack />
      <FAQ />
      <AnimatedFooter />
    </div>
  );
};

export default Landing;
