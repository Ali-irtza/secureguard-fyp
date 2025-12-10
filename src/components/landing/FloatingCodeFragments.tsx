import { useEffect, useState } from "react";

interface CodeFragment {
  id: number;
  text: string;
  x: number;
  y: number;
  speed: number;
  opacity: number;
  blur: number;
  delay: number;
}

const codeSnippets = [
  "scan()",
  "vulnerability::detected",
  "checksum: verified",
  "hash: validated",
  "SSL: encrypted",
  "threat: neutralized",
  "AI analysis: active",
  "permissions: granted",
  "firewall: active",
  "shield.protect()",
  "security.scan()",
  "auth: verified",
  "encrypt(data)",
  "validate.input()",
  "monitor.status()",
];

const FloatingCodeFragments = () => {
  const [fragments, setFragments] = useState<CodeFragment[]>([]);

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    if (prefersReducedMotion) return;

    // Create initial fragments
    const initialFragments: CodeFragment[] = codeSnippets.map((text, i) => ({
      id: i,
      text,
      x: Math.random() * 100,
      y: Math.random() * 100,
      speed: 15 + Math.random() * 20,
      opacity: 0.1 + Math.random() * 0.15,
      blur: Math.random() > 0.5 ? 1 + Math.random() * 2 : 0,
      delay: Math.random() * 10,
    }));

    setFragments(initialFragments);
  }, []);

  if (fragments.length === 0) return null;

  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-[1]">
      {fragments.map((fragment) => (
        <div
          key={fragment.id}
          className="absolute font-mono text-xs text-primary whitespace-nowrap animate-float-diagonal"
          style={{
            left: `${fragment.x}%`,
            top: `${fragment.y}%`,
            opacity: fragment.opacity,
            filter: fragment.blur > 0 ? `blur(${fragment.blur}px)` : undefined,
            animationDuration: `${fragment.speed}s`,
            animationDelay: `${fragment.delay}s`,
          }}
        >
          {fragment.text}
        </div>
      ))}
    </div>
  );
};

export default FloatingCodeFragments;
