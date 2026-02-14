"use client";

import { motion } from "framer-motion";

const NODE_COUNT = 12;
const nodes = Array.from({ length: NODE_COUNT }, (_, i) => {
  const angle = (i / NODE_COUNT) * Math.PI * 2;
  const radius = 120 + Math.random() * 60;
  return {
    cx: 200 + Math.cos(angle) * radius,
    cy: 200 + Math.sin(angle) * radius,
    r: 2 + Math.random() * 2,
    delay: i * 0.15,
  };
});

// Connections between nodes (pairs)
const connections = [
  [0, 3], [1, 5], [2, 7], [3, 8], [4, 9],
  [5, 10], [6, 11], [7, 1], [8, 2], [9, 0],
  [10, 4], [11, 6],
];

export function HeroVisual() {
  return (
    <div className="relative w-full h-full flex items-center justify-center">
      {/* Background gradient orbs */}
      <motion.div
        className="absolute w-[300px] h-[300px] lg:w-[400px] lg:h-[400px] rounded-full"
        style={{
          background:
            "radial-gradient(circle at 40% 40%, rgba(118,192,67,0.2) 0%, rgba(35,77,46,0.1) 50%, transparent 70%)",
        }}
        animate={{ scale: [1, 1.08, 1], rotate: [0, 5, -3, 0] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute w-[200px] h-[200px] lg:w-[260px] lg:h-[260px] rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(157,213,101,0.15) 0%, transparent 70%)",
        }}
        animate={{ scale: [1.1, 0.95, 1.1], opacity: [0.6, 1, 0.6] }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* SVG composition */}
      <svg
        viewBox="0 0 400 400"
        className="relative w-[280px] h-[280px] sm:w-[320px] sm:h-[320px] lg:w-[400px] lg:h-[400px]"
        fill="none"
      >
        <defs>
          <linearGradient id="stem-grad" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="#2C5F2D" />
            <stop offset="100%" stopColor="#76C043" />
          </linearGradient>
          <linearGradient id="leaf-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#76C043" />
            <stop offset="100%" stopColor="#9DD565" />
          </linearGradient>
          <linearGradient id="node-line" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="rgba(118,192,67,0.3)" />
            <stop offset="100%" stopColor="rgba(118,192,67,0.05)" />
          </linearGradient>
        </defs>

        {/* Data network connections */}
        {connections.map(([a, b], i) => (
          <motion.line
            key={`conn-${i}`}
            x1={nodes[a].cx}
            y1={nodes[a].cy}
            x2={nodes[b].cx}
            y2={nodes[b].cy}
            stroke="url(#node-line)"
            strokeWidth={0.5}
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 1.5, delay: 0.5 + i * 0.08, ease: "easeOut" }}
          />
        ))}

        {/* Data nodes */}
        {nodes.map((node, i) => (
          <motion.circle
            key={`node-${i}`}
            cx={node.cx}
            cy={node.cy}
            r={node.r}
            fill="#76C043"
            initial={{ scale: 0, opacity: 0 }}
            animate={{
              scale: [0, 1, 1],
              opacity: [0, 0.6, 0.3],
            }}
            transition={{
              duration: 2,
              delay: node.delay,
              repeat: Infinity,
              repeatType: "reverse",
              ease: "easeInOut",
            }}
          />
        ))}

        {/* Ground / data grid base */}
        <motion.rect
          x="160"
          y="300"
          width="80"
          height="2"
          rx="1"
          fill="rgba(118,192,67,0.2)"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 1, delay: 0.2 }}
          style={{ transformOrigin: "200px 301px" }}
        />
        {/* Grid dots */}
        {[-30, -15, 0, 15, 30].map((offset) => (
          <motion.circle
            key={`grid-${offset}`}
            cx={200 + offset}
            cy={305}
            r={1.5}
            fill="rgba(118,192,67,0.3)"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.5, 0.3] }}
            transition={{ duration: 1.5, delay: 0.5 + Math.abs(offset) * 0.02 }}
          />
        ))}

        {/* Main stem */}
        <motion.path
          d="M200 300 Q200 250 200 180"
          stroke="url(#stem-grad)"
          strokeWidth={3}
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.5, delay: 0.3, ease: "easeOut" }}
        />

        {/* Left leaf */}
        <motion.path
          d="M200 230 Q170 210 150 230 Q170 220 200 230"
          fill="url(#leaf-grad)"
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 0.9 }}
          transition={{ duration: 0.8, delay: 1 }}
          style={{ transformOrigin: "200px 230px" }}
        />
        {/* Left leaf sway */}
        <motion.path
          d="M200 230 Q170 210 150 230 Q170 220 200 230"
          fill="url(#leaf-grad)"
          animate={{ rotate: [0, -3, 0, 2, 0] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut", delay: 1.8 }}
          style={{ transformOrigin: "200px 230px" }}
        />

        {/* Right leaf */}
        <motion.path
          d="M200 210 Q230 190 250 210 Q230 200 200 210"
          fill="url(#leaf-grad)"
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 0.9 }}
          transition={{ duration: 0.8, delay: 1.2 }}
          style={{ transformOrigin: "200px 210px" }}
        />
        {/* Right leaf sway */}
        <motion.path
          d="M200 210 Q230 190 250 210 Q230 200 200 210"
          fill="url(#leaf-grad)"
          animate={{ rotate: [0, 2, 0, -3, 0] }}
          transition={{ duration: 7, repeat: Infinity, ease: "easeInOut", delay: 2 }}
          style={{ transformOrigin: "200px 210px" }}
        />

        {/* Top leaf */}
        <motion.path
          d="M200 185 Q185 160 200 145 Q215 160 200 185"
          fill="url(#leaf-grad)"
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 0.9 }}
          transition={{ duration: 0.8, delay: 1.4 }}
          style={{ transformOrigin: "200px 185px" }}
        />
        {/* Top leaf sway */}
        <motion.path
          d="M200 185 Q185 160 200 145 Q215 160 200 185"
          fill="url(#leaf-grad)"
          animate={{ rotate: [0, -2, 0, 2, 0] }}
          transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 2.2 }}
          style={{ transformOrigin: "200px 165px" }}
        />

        {/* Secondary branch left */}
        <motion.path
          d="M200 260 Q185 245 170 260"
          stroke="url(#stem-grad)"
          strokeWidth={2}
          strokeLinecap="round"
          fill="none"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.8, delay: 0.9 }}
        />
        {/* Small left leaf */}
        <motion.path
          d="M170 260 Q155 248 145 262 Q158 254 170 260"
          fill="url(#leaf-grad)"
          fillOpacity={0.7}
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.6, delay: 1.5 }}
          style={{ transformOrigin: "170px 260px" }}
        />

        {/* Secondary branch right */}
        <motion.path
          d="M200 250 Q215 240 230 250"
          stroke="url(#stem-grad)"
          strokeWidth={2}
          strokeLinecap="round"
          fill="none"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.8, delay: 1.1 }}
        />
        {/* Small right leaf */}
        <motion.path
          d="M230 250 Q245 238 255 252 Q242 244 230 250"
          fill="url(#leaf-grad)"
          fillOpacity={0.7}
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.6, delay: 1.7 }}
          style={{ transformOrigin: "230px 250px" }}
        />

        {/* Pulse ring around plant center */}
        <motion.circle
          cx={200}
          cy={220}
          r={50}
          stroke="rgba(118,192,67,0.15)"
          strokeWidth={1}
          fill="none"
          animate={{ r: [50, 80, 50], opacity: [0.2, 0, 0.2] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.circle
          cx={200}
          cy={220}
          r={70}
          stroke="rgba(118,192,67,0.1)"
          strokeWidth={0.5}
          fill="none"
          animate={{ r: [70, 110, 70], opacity: [0.15, 0, 0.15] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", delay: 1 }}
        />
      </svg>
    </div>
  );
}
