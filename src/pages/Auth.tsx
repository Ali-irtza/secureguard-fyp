import { useState } from "react";
import { Shield } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import BrandingPanel from "@/components/auth/BrandingPanel";
import LoginForm from "@/components/auth/LoginForm";
import RegisterForm from "@/components/auth/RegisterForm";

const Auth = () => {
  const [activeTab, setActiveTab] = useState("login");

  return (
    <div className="min-h-screen flex">
      {/* Left Side - Branding Panel */}
      <div className="hidden lg:block lg:w-1/2">
        <BrandingPanel />
      </div>

      {/* Right Side - Form Panel */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-card">
        <div className="w-full max-w-md space-y-8">
          {/* Mobile Logo */}
          <div className="lg:hidden flex items-center justify-center gap-2 mb-8">
            <div className="relative">
              <Shield className="h-8 w-8 text-primary" />
              <div className="absolute inset-0 blur-lg bg-primary/50 -z-10" />
            </div>
            <span className="text-xl font-bold tracking-tight">
              <span className="text-foreground">Secure</span>
              <span className="text-primary">Guard</span>
              <span className="text-muted-foreground font-light ml-1">Pro</span>
            </span>
          </div>

          {/* Header */}
          <div className="text-center lg:text-left">
            <h1 className="text-3xl font-bold text-foreground">
              {activeTab === "login" ? "Welcome back" : "Create an account"}
            </h1>
            <p className="mt-2 text-muted-foreground">
              {activeTab === "login"
                ? "Sign in to access your security dashboard"
                : "Start securing your applications today"}
            </p>
          </div>

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2 bg-background/50">
              <TabsTrigger 
                value="login"
                className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                Sign In
              </TabsTrigger>
              <TabsTrigger 
                value="register"
                className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                Sign Up
              </TabsTrigger>
            </TabsList>

            <TabsContent value="login" className="mt-6">
              <LoginForm />
            </TabsContent>

            <TabsContent value="register" className="mt-6">
              <RegisterForm />
            </TabsContent>
          </Tabs>

          {/* Footer */}
          <p className="text-center text-xs text-muted-foreground">
            By continuing, you agree to our{" "}
            <a href="#" className="text-primary hover:underline">Terms of Service</a>
            {" "}and{" "}
            <a href="#" className="text-primary hover:underline">Privacy Policy</a>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Auth;
