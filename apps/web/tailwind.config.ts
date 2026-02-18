import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
  	container: {
  		center: true,
  		padding: '2rem',
  		screens: {
  			'2xl': '1400px'
  		}
  	},
  	extend: {
  		fontFamily: {
  			serif: ['var(--font-serif)', 'Georgia', 'serif'],
  		},
  		colors: {
  			// Earth palette - Updated for Antigravity
  			'earth-950': '#050a07', // Obsidian
  			'earth-900': '#0a1f14',
  			'earth-800': '#153320',
  			'earth-700': '#234d2e',
  			// Lime accents
  			'lime-400': '#a3e635', // Translucent Lime (lighter/brighter)
  			'lime-300': '#bef264',
  			// Warm accent
  			'amber-warm': '#F5A623',
  			// Cream backgrounds
  			'cream-50': '#FAFAF5',
  			'cream-100': '#F3F2ED',
  			// Legacy aliases
  			'hero-dark': '#050a07',
  			'hero-accent': '#a3e635',
  			// shadcn tokens
  			border: 'hsl(var(--border))',
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			background: 'hsl(var(--background))',
  			foreground: 'hsl(var(--foreground))',
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			}
  		},
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		},
  		keyframes: {
  			'accordion-down': {
  				from: { height: '0' },
  				to: { height: 'var(--radix-accordion-content-height)' }
  			},
  			'accordion-up': {
  				from: { height: 'var(--radix-accordion-content-height)' },
  				to: { height: '0' }
  			},
  			'gradient-shift': {
  				'0%, 100%': { backgroundPosition: '0% 50%' },
  				'50%': { backgroundPosition: '100% 50%' },
  			},
  			'slide-infinite': {
  				'0%': { transform: 'translateX(0)' },
  				'100%': { transform: 'translateX(-50%)' },
  			},
  			'float': {
  				'0%, 100%': { transform: 'translateY(0) rotate(0deg)' },
  				'33%': { transform: 'translateY(-8px) rotate(1deg)' },
  				'66%': { transform: 'translateY(4px) rotate(-1deg)' },
  			},
  			'pulse-glow': {
  				'0%, 100%': { boxShadow: '0 0 20px rgba(118, 192, 67, 0.2)' },
  				'50%': { boxShadow: '0 0 40px rgba(118, 192, 67, 0.4)' },
  			},
  			'dash-flow': {
  				'0%': { strokeDashoffset: '100' },
  				'100%': { strokeDashoffset: '0' },
  			},
  			'ring-fill': {
  				'0%': { strokeDashoffset: 'var(--ring-circumference)' },
  				'100%': { strokeDashoffset: 'var(--ring-offset)' },
  			},
  		},
  		animation: {
  			'accordion-down': 'accordion-down 0.2s ease-out',
  			'accordion-up': 'accordion-up 0.2s ease-out',
  			'gradient-shift': 'gradient-shift 15s ease infinite',
  			'slide-infinite': 'slide-infinite 30s linear infinite',
  			'float': 'float 6s ease-in-out infinite',
  			'pulse-glow': 'pulse-glow 3s ease-in-out infinite',
  			'dash-flow': 'dash-flow 2s ease forwards',
  			'ring-fill': 'ring-fill 1.5s ease-out forwards',
  		}
  	}
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
