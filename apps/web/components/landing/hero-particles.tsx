"use client";

import { useEffect, useRef } from "react";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  opacity: number;
  life: number;
  maxLife: number;
}

// Pre-computed fill styles to avoid string allocation per frame
const FILL_CACHE: string[] = [];
for (let i = 0; i <= 100; i++) {
  FILL_CACHE[i] = `rgba(118,192,67,${(i / 100) * 0.35})`;
}

export function HeroParticles() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    const particles: Particle[] = [];
    const PARTICLE_COUNT = 40;
    let w = 0;
    let h = 0;
    const parallax = {
      targetX: 0,
      targetY: 0,
      currentX: 0,
      currentY: 0,
    };

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      w = canvas.offsetWidth;
      h = canvas.offsetHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const handlePointerMove = (event: MouseEvent) => {
      if (!w || !h) {
        return;
      }
      const normalizedX = event.clientX / w - 0.5;
      const normalizedY = event.clientY / h - 0.5;
      parallax.targetX = normalizedX * 36;
      parallax.targetY = normalizedY * 22;
    };

    const handlePointerLeave = () => {
      parallax.targetX = 0;
      parallax.targetY = 0;
    };

    window.addEventListener("mousemove", handlePointerMove);
    window.addEventListener("mouseleave", handlePointerLeave);

    const spawn = (): Particle => ({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.3,
      vy: -Math.random() * 0.4 - 0.1,
      size: Math.random() * 2 + 0.5,
      opacity: 0,
      life: 0,
      maxLife: Math.random() * 400 + 200,
    });

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const p = spawn();
      p.life = Math.random() * p.maxLife;
      particles.push(p);
    }

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      parallax.currentX += (parallax.targetX - parallax.currentX) * 0.04;
      parallax.currentY += (parallax.targetY - parallax.currentY) * 0.04;

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life++;

        const progress = p.life / p.maxLife;
        p.opacity = progress < 0.1 ? progress / 0.1 : progress > 0.8 ? (1 - progress) / 0.2 : 1;

        if (p.life >= p.maxLife) {
          particles[i] = spawn();
          continue;
        }

        const depth = 0.35 + p.size / 2.6;
        const drawX = p.x + parallax.currentX * depth;
        const drawY = p.y + parallax.currentY * depth;

        ctx.beginPath();
        ctx.arc(drawX, drawY, p.size, 0, Math.PI * 2);
        ctx.fillStyle = FILL_CACHE[Math.round(p.opacity * 100)] || FILL_CACHE[0];
        ctx.fill();
      }

      animId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", handlePointerMove);
      window.removeEventListener("mouseleave", handlePointerLeave);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none z-[2]"
      aria-hidden="true"
    />
  );
}
