"use client";

import {
  motion,
  type Variants,
  useMotionValue,
  useSpring,
  useTransform,
} from "framer-motion";
import { type ReactNode, type MouseEvent, useMemo } from "react";

interface MotionDivProps {
  children: ReactNode;
  className?: string;
  delay?: number;
  direction?: "up" | "down" | "left" | "right";
  hoverScale?: number;
  tilt?: boolean;
  tiltIntensity?: number;
}

const directionOffset = {
  up: { y: 40 },
  down: { y: -40 },
  left: { x: 40 },
  right: { x: -40 },
};

export function MotionDiv({
  children,
  className,
  delay = 0,
  direction = "up",
  hoverScale = 1.0,
  tilt = false,
  tiltIntensity = 7,
}: MotionDivProps) {
  const offset = directionOffset[direction];

  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);
  const rotateXTarget = useTransform(
    pointerY,
    [-0.5, 0.5],
    [tiltIntensity, -tiltIntensity],
  );
  const rotateYTarget = useTransform(
    pointerX,
    [-0.5, 0.5],
    [-tiltIntensity, tiltIntensity],
  );
  const rotateX = useSpring(rotateXTarget, {
    stiffness: 100,
    damping: 20,
  });
  const rotateY = useSpring(rotateYTarget, {
    stiffness: 100,
    damping: 20,
  });

  function handleMouseMove(event: MouseEvent<HTMLDivElement>) {
    if (!tilt) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const relativeX = (event.clientX - rect.left) / rect.width - 0.5;
    const relativeY = (event.clientY - rect.top) / rect.height - 0.5;
    pointerX.set(relativeX);
    pointerY.set(relativeY);
  }

  function handleMouseLeave() {
    pointerX.set(0);
    pointerY.set(0);
  }

  return (
    <motion.div
      initial={{ opacity: 0, ...offset }}
      whileInView={{ opacity: 1, x: 0, y: 0 }}
      viewport={{ once: true, margin: "-10%" }}
      transition={{
        delay,
        type: "spring",
        stiffness: 100,
        damping: 20,
      }}
      style={{
        perspective: 1100,
        transformStyle: "preserve-3d",
        rotateX: tilt ? rotateX : 0,
        rotateY: tilt ? rotateY : 0,
      }}
      onMouseMove={tilt ? handleMouseMove : undefined}
      onMouseLeave={tilt ? handleMouseLeave : undefined}
      whileHover={{ scale: hoverScale }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

interface FloatProps {
  children: ReactNode;
  className?: string;
  delay?: number;
  amplitude?: number;
}

function pseudoRandom(seed: number): number {
  const x = Math.sin(seed * 91.17) * 10000;
  return x - Math.floor(x);
}

export function Float({ children, className, delay = 0, amplitude = 10 }: FloatProps) {
  const seedBase = useMemo(() => {
    const classSeed = (className ?? "")
      .split("")
      .reduce((sum, char, index) => sum + char.charCodeAt(0) * (index + 1), 0);
    return Math.floor(delay * 1000) + Math.floor(amplitude * 100) + classSeed;
  }, [className, delay, amplitude]);

  const duration = 4 + pseudoRandom(seedBase) * 2;
  const sway = amplitude * (0.2 + pseudoRandom(seedBase + 1) * 0.35);
  const wobble = (pseudoRandom(seedBase + 2) - 0.5) * 3;

  return (
    <motion.div
      animate={{
        y: [-amplitude * 0.6, amplitude, -amplitude * 0.4],
        x: [-sway, sway * 0.7, -sway],
        rotate: [-wobble, wobble, -wobble],
      }}
      transition={{
        duration,
        repeat: Infinity,
        ease: "easeInOut",
        delay: delay + pseudoRandom(seedBase + 3),
        times: [0, 0.55, 1],
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// ... (MotionStagger remains similar but with spring transitions)
interface MotionStaggerProps {
  children: ReactNode;
  className?: string;
  staggerDelay?: number;
}

export const staggerItem: Variants = {
  hidden: (index = 0) => {
    const seed = index + 1;
    return {
      opacity: 0,
      y: 18 + pseudoRandom(seed) * 20,
      scale: 0.95 + pseudoRandom(seed + 3) * 0.05,
      rotate: -2 + pseudoRandom(seed + 7) * 4,
    };
  },
  show: {
    opacity: 1,
    y: 0,
    rotate: 0,
    scale: 1,
    transition: { type: "spring", stiffness: 100, damping: 20 },
  },
};

export function MotionStagger({
  children,
  className,
  staggerDelay = 0.15,
}: MotionStaggerProps) {
   // ... (implementation matches existing container variants)
  const container: Variants = {
    hidden: {},
    show: {
      transition: {
        staggerChildren: staggerDelay,
        delayChildren: 0.05,
      },
    },
  };

  return (
    <motion.div
      variants={container}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "0px" }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
