import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, ShieldCheck, ShieldAlert, Code } from "lucide-react";

const Index = () => {
  return (
    <div className="min-h-screen gradient-cyber p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <header className="text-center space-y-4">
          <div className="flex items-center justify-center gap-3">
            <Shield className="h-12 w-12 text-primary" />
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
              SecureGuard <span className="text-gradient-emerald">Pro</span>
            </h1>
          </div>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Design System Preview - Cybersecurity Dark Theme
          </p>
        </header>

        {/* Color Palette */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">Color Palette</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <div className="h-20 rounded-lg bg-background border border-border"></div>
              <p className="text-sm text-muted-foreground">Background (Slate-950)</p>
            </div>
            <div className="space-y-2">
              <div className="h-20 rounded-lg bg-card border border-border"></div>
              <p className="text-sm text-muted-foreground">Card (Zinc-900)</p>
            </div>
            <div className="space-y-2">
              <div className="h-20 rounded-lg bg-primary glow-emerald"></div>
              <p className="text-sm text-muted-foreground">Primary (Emerald)</p>
            </div>
            <div className="space-y-2">
              <div className="h-20 rounded-lg bg-destructive glow-crimson"></div>
              <p className="text-sm text-muted-foreground">Destructive (Crimson)</p>
            </div>
          </div>
        </section>

        {/* Typography */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">Typography</h2>
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Inter (Sans-serif)</p>
                <p className="text-3xl font-bold">The quick brown fox jumps over the lazy dog</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">JetBrains Mono (Monospace)</p>
                <code className="text-xl font-mono bg-muted/50 px-3 py-2 rounded-md block">
                  const vulnerability = detectFlaws(code);
                </code>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Glassmorphism Cards */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">Glassmorphism Cards</h2>
          <div className="grid md:grid-cols-3 gap-6">
            <Card className="hover-glow">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <ShieldCheck className="h-8 w-8 text-primary" />
                  <CardTitle>Safe</CardTitle>
                </div>
                <CardDescription>No vulnerabilities detected</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="badge-low inline-flex px-3 py-1 rounded-full text-sm font-medium">
                  Secure
                </div>
              </CardContent>
            </Card>

            <Card className="hover-glow">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <ShieldAlert className="h-8 w-8 text-warning" />
                  <CardTitle>Warning</CardTitle>
                </div>
                <CardDescription>Medium severity issues found</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="badge-medium inline-flex px-3 py-1 rounded-full text-sm font-medium">
                  3 Issues
                </div>
              </CardContent>
            </Card>

            <Card className="hover-glow">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <ShieldAlert className="h-8 w-8 text-destructive" />
                  <CardTitle>Critical</CardTitle>
                </div>
                <CardDescription>Critical vulnerabilities detected</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="badge-critical inline-flex px-3 py-1 rounded-full text-sm font-medium">
                  Critical
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Code Block Example */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">Code Highlighting</h2>
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <Code className="h-6 w-6 text-muted-foreground" />
                <CardTitle className="text-lg">vulnerability_example.py</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="font-mono text-sm space-y-0 bg-muted/30 rounded-lg overflow-hidden">
                <div className="px-4 py-2 border-l-2 border-transparent">
                  <span className="text-muted-foreground mr-4">1</span>
                  <span className="text-primary">def</span> get_user(user_id):
                </div>
                <div className="px-4 py-2 code-vulnerable">
                  <span className="text-muted-foreground mr-4">2</span>
                  <span className="text-foreground">    query = </span>
                  <span className="text-warning">"SELECT * FROM users WHERE id = "</span>
                  <span className="text-foreground"> + user_id</span>
                </div>
                <div className="px-4 py-2 code-vulnerable">
                  <span className="text-muted-foreground mr-4">3</span>
                  <span className="text-foreground">    cursor.execute(query)</span>
                  <span className="text-destructive ml-4"># SQL Injection!</span>
                </div>
                <div className="px-4 py-2 border-l-2 border-transparent">
                  <span className="text-muted-foreground mr-4">4</span>
                  <span className="text-primary">    return</span> cursor.fetchone()
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Glow Effects */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">Glow Effects</h2>
          <div className="flex flex-wrap gap-4">
            <button className="px-6 py-3 rounded-lg bg-primary text-primary-foreground font-medium glow-emerald hover:scale-105 transition-transform">
              Emerald Glow
            </button>
            <button className="px-6 py-3 rounded-lg bg-destructive text-destructive-foreground font-medium glow-crimson hover:scale-105 transition-transform">
              Crimson Glow
            </button>
            <button className="px-6 py-3 rounded-lg bg-secondary text-secondary-foreground font-medium hover-glow border border-border">
              Hover for Glow
            </button>
            <button className="px-6 py-3 rounded-lg gradient-emerald text-white font-medium hover:scale-105 transition-transform">
              Gradient Emerald
            </button>
          </div>
        </section>

        {/* Footer */}
        <footer className="text-center text-muted-foreground text-sm pt-8 border-t border-border">
          <p>SecureGuard Pro Design System • Cybersecurity Dark Theme</p>
        </footer>
      </div>
    </div>
  );
};

export default Index;