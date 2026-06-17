import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Shield, Mail, ArrowLeft, CheckCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";

const forgotPasswordSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
});

type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>;

const ForgotPassword = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const { toast } = useToast();

  const form = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: {
      email: "",
    },
  });

  const onSubmit = async (data: ForgotPasswordFormValues) => {
    setIsLoading(true);
    const email = data.email.trim().toLowerCase();
    const { data: exists, error: existsError } = await supabase.rpc("profile_email_exists", {
      input_email: email,
    });

    if (existsError) {
      toast({ title: "Error", description: existsError.message, variant: "destructive" });
      setIsLoading(false);
      return;
    }

    if (!exists) {
      form.setError("email", {
        type: "manual",
        message: "No SecureGuard Pro account exists with this email.",
      });
      setIsLoading(false);
      return;
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback`,
    });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setIsSubmitted(true);
    }
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-8 bg-background relative overflow-hidden">
      <div className="absolute inset-0 opacity-30">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-[120px]" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-emerald/20 rounded-full blur-[120px]" />
      </div>

      <div className="w-full max-w-md relative z-10">
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="relative">
            <Shield className="h-10 w-10 text-primary" />
            <div className="absolute inset-0 blur-lg bg-primary/50 -z-10" />
          </div>
          <span className="text-2xl font-bold tracking-tight">
            <span className="text-foreground">Secure</span>
            <span className="text-primary">Guard</span>
            <span className="text-muted-foreground font-light ml-1">Pro</span>
          </span>
        </div>

        <div className="glass-card p-8">
          {!isSubmitted ? (
            <>
              <div className="text-center mb-6">
                <h1 className="text-2xl font-bold text-foreground">Reset your password</h1>
                <p className="mt-2 text-muted-foreground">
                  Enter your email and we'll send you a link to reset your password
                </p>
              </div>

              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-foreground">Email</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                              placeholder="you@example.com"
                              className="pl-10 bg-background/50 border-border/50 focus:border-primary"
                              {...field}
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button
                    type="submit"
                    className="w-full glow-emerald"
                    disabled={isLoading}
                  >
                    {isLoading ? "Sending..." : "Send Reset Link"}
                  </Button>
                </form>
              </Form>
            </>
          ) : (
            <div className="text-center py-4">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald/10 mb-4">
                <CheckCircle className="h-8 w-8 text-emerald" />
              </div>
              <h2 className="text-xl font-bold text-foreground mb-2">Check your email</h2>
              <p className="text-muted-foreground mb-6">
                We've sent a password reset link to{" "}
                <span className="text-foreground font-medium">{form.getValues("email")}</span>
              </p>
              <p className="text-sm text-muted-foreground">
                Didn't receive the email?{" "}
                <button
                  onClick={() => setIsSubmitted(false)}
                  className="text-primary hover:underline"
                >
                  Click to resend
                </button>
              </p>
            </div>
          )}

          <div className="mt-6 text-center">
            <Link
              to="/auth"
              className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to login
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ForgotPassword;
