import { useEffect, useRef } from "react";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  opacity: number;
}

interface GeometricShape {
  x: number;
  y: number;
  radius: number;
  rotation: number;
  rotationSpeed: number;
  sides: number;
  opacity: number;
  blur: number;
  depth: number;
}

const CyberBackground = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: 0, y: 0 });
  const animationRef = useRef<number>();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    // Handle mouse movement for parallax
    const handleMouseMove = (e: MouseEvent) => {
      mouseRef.current = {
        x: (e.clientX / window.innerWidth - 0.5) * 2,
        y: (e.clientY / window.innerHeight - 0.5) * 2,
      };
    };
    window.addEventListener("mousemove", handleMouseMove);

    // Initialize particles
    const particles: Particle[] = [];
    const particleCount = 80;

    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        size: Math.random() * 2 + 1,
        opacity: Math.random() * 0.5 + 0.1,
      });
    }

    // Initialize geometric shapes
    const shapes: GeometricShape[] = [
      { x: 0.2, y: 0.3, radius: 300, rotation: 0, rotationSpeed: 0.0003, sides: 6, opacity: 0.04, blur: 20, depth: 0.8 },
      { x: 0.8, y: 0.6, radius: 250, rotation: Math.PI / 4, rotationSpeed: -0.0002, sides: 8, opacity: 0.03, blur: 30, depth: 0.6 },
      { x: 0.5, y: 0.8, radius: 400, rotation: 0, rotationSpeed: 0.00015, sides: 12, opacity: 0.025, blur: 40, depth: 0.4 },
      { x: 0.15, y: 0.7, radius: 180, rotation: Math.PI / 6, rotationSpeed: -0.00025, sides: 6, opacity: 0.035, blur: 25, depth: 0.7 },
      { x: 0.85, y: 0.25, radius: 220, rotation: 0, rotationSpeed: 0.00018, sides: 8, opacity: 0.03, blur: 35, depth: 0.5 },
    ];

    // Scan beam properties
    let scanBeamX = -200;
    const scanBeamSpeed = 0.5;

    const drawPolygon = (
      cx: number,
      cy: number,
      radius: number,
      sides: number,
      rotation: number,
      opacity: number
    ) => {
      ctx.beginPath();
      for (let i = 0; i <= sides; i++) {
        const angle = (i * 2 * Math.PI) / sides + rotation;
        const x = cx + radius * Math.cos(angle);
        const y = cy + radius * Math.sin(angle);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.strokeStyle = `rgba(16, 185, 129, ${opacity})`;
      ctx.lineWidth = 1;
      ctx.stroke();
    };

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw geometric shapes with parallax
      shapes.forEach((shape) => {
        shape.rotation += shape.rotationSpeed;

        const parallaxX = mouseRef.current.x * 30 * shape.depth;
        const parallaxY = mouseRef.current.y * 30 * shape.depth;

        const x = shape.x * canvas.width + parallaxX;
        const y = shape.y * canvas.height + parallaxY;

        ctx.save();
        ctx.filter = `blur(${shape.blur}px)`;
        drawPolygon(x, y, shape.radius, shape.sides, shape.rotation, shape.opacity);
        
        // Draw inner ring
        drawPolygon(x, y, shape.radius * 0.7, shape.sides, -shape.rotation * 0.5, shape.opacity * 0.6);
        ctx.restore();
      });

      // Draw and update particles
      particles.forEach((particle) => {
        particle.x += particle.vx;
        particle.y += particle.vy;

        // Wrap around edges
        if (particle.x < 0) particle.x = canvas.width;
        if (particle.x > canvas.width) particle.x = 0;
        if (particle.y < 0) particle.y = canvas.height;
        if (particle.y > canvas.height) particle.y = 0;

        // Apply subtle parallax
        const drawX = particle.x + mouseRef.current.x * 10;
        const drawY = particle.y + mouseRef.current.y * 10;

        ctx.beginPath();
        ctx.arc(drawX, drawY, particle.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(16, 185, 129, ${particle.opacity})`;
        ctx.fill();
      });

      // Draw connections between nearby particles
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          if (distance < 120) {
            const opacity = (1 - distance / 120) * 0.15;
            ctx.beginPath();
            ctx.moveTo(
              particles[i].x + mouseRef.current.x * 10,
              particles[i].y + mouseRef.current.y * 10
            );
            ctx.lineTo(
              particles[j].x + mouseRef.current.x * 10,
              particles[j].y + mouseRef.current.y * 10
            );
            ctx.strokeStyle = `rgba(16, 185, 129, ${opacity})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }

      // Draw scan beam
      scanBeamX += scanBeamSpeed;
      if (scanBeamX > canvas.width + 200) {
        scanBeamX = -200;
      }

      const gradient = ctx.createLinearGradient(
        scanBeamX - 100,
        0,
        scanBeamX + 100,
        0
      );
      gradient.addColorStop(0, "rgba(16, 185, 129, 0)");
      gradient.addColorStop(0.5, "rgba(16, 185, 129, 0.08)");
      gradient.addColorStop(1, "rgba(16, 185, 129, 0)");

      ctx.fillStyle = gradient;
      ctx.fillRect(scanBeamX - 100, 0, 200, canvas.height);

      animationRef.current = requestAnimationFrame(animate);
    };

    // Check for reduced motion preference
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    if (!prefersReducedMotion) {
      animate();
    } else {
      // Static render for reduced motion
      shapes.forEach((shape) => {
        const x = shape.x * canvas.width;
        const y = shape.y * canvas.height;
        ctx.save();
        ctx.filter = `blur(${shape.blur}px)`;
        drawPolygon(x, y, shape.radius, shape.sides, shape.rotation, shape.opacity);
        ctx.restore();
      });
    }

    return () => {
      window.removeEventListener("resize", resizeCanvas);
      window.removeEventListener("mousemove", handleMouseMove);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none"
      style={{ background: "linear-gradient(180deg, #0a0a0f 0%, #0d1117 100%)" }}
    />
  );
};

export default CyberBackground;
