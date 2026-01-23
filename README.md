# AI Agronomist Advisor

> **Diagnose crop issues. Get actionable recommendations. Find the right products.**
>
> AI Agronomist Advisor turns field observations into research-backed recommendations with product pricing and purchase links.

---

## Overview

**AI Agronomist Advisor** is an agricultural recommendation system for farmers and agronomists in North America (US and Canada). Users can submit a photo, a description, lab data, or a combination to receive targeted diagnoses and next-step actions grounded in university extension research and regional best practices.

### Who It’s For

- **Smallholder farmers** seeking quick, practical diagnoses
- **Commercial growers** needing precise recommendations from lab data
- **Agronomists and advisors** who require citations and source transparency
- **Agricultural retailers** supporting customer inquiries

### Crop Coverage

Row crops, vegetables, fruits, specialty crops, and forage species commonly grown across North America.

---

## Key Features

- **Multi-modal inputs**: photo, text description, lab data, or hybrid.
- **Research-grounded recommendations** with citations and confidence indicators.
- **Product guidance** with pricing, application rates, and purchase links.
- **Feedback loop** to improve recommendations based on outcomes.
- **PWA-ready** for installable, offline-capable field use.

---

## How It Works (Short Version)

1. **Input**: Users submit a photo, description, lab results, or all three.
2. **Analysis**: Vision + NLP extract symptoms and normalize data.
3. **Retrieval**: RAG fetches relevant sources and reference images.
4. **Recommendation**: Structured diagnosis + actions + products are produced.
5. **Feedback**: Outcomes and ratings refine future recommendations.

---

## Development Roadmap

### Overview

**Timeline:** 4 weeks (12 sessions at 3 sessions/week)

**Approach:** AI-assisted development with focused, high-output sessions. Each session targets a complete vertical slice of functionality.

### Week 1: Foundation

| Session | Focus | Deliverables |
|---------|-------|--------------|
| **1** | Project Setup | Next.js 14 scaffold, Tailwind + shadcn/ui, folder structure, TypeScript config, PWA manifest, basic layout components |
| **2** | Database + Auth | Prisma schema, Supabase connection, auth pages (login/signup/callback), protected route middleware, user profile table |
| **3** | Core UI Shell | App layout (sidebar, header, mobile nav), dashboard page, landing page, settings pages, dark mode |

**Milestone:** Deployable shell with working auth, navigable but empty.

### Week 2: Input + Ingestion

| Session | Focus | Deliverables |
|---------|-------|--------------|
| **4** | Diagnose Flow UI | Input method picker, image upload component (drag-drop + camera), description input, lab report form, crop/location selectors |
| **5** | Ingestion Pipeline (Part 1) | Scrapers for university extensions, PDF parser, HTML parser, chunking logic, R2 upload for images |
| **6** | Ingestion Pipeline (Part 2) | Embedding generation (text + image), pgvector upsert, product scraper, source metadata tracking |

**Milestone:** User can upload images and describe issues. Knowledge base populated with real data (~500-1000 chunks).

### Week 3: AI + Products

| Session | Focus | Deliverables |
|---------|-------|--------------|
| **7** | RAG + Recommendation Engine | Vector search API, context assembly, recommendation agent prompt, Claude integration, Zod validation + retry logic |
| **8** | Results UI + Sources | Recommendation detail page, diagnosis display, action items, confidence indicator, sources panel, citation linking |
| **9** | Products System | Product schema, product search API, product detail page, price display, comparison view, purchase links |

**Milestone:** Full flow operational — upload → diagnosis → recommendations → products.

### Week 4: Polish + Launch

| Session | Focus | Deliverables |
|---------|-------|--------------|
| **10** | Feedback Loop | Quick feedback component, detailed feedback form, outcome reporter, feedback storage, user feedback history page |
| **11** | PWA + Offline | Service worker implementation, caching strategies, install prompt, offline indicator, background sync |
| **12** | Launch Prep | Bug fixes, error handling audit, loading/empty states, rate limiting, final UI polish, beta deployment |

**Milestone:** Production-ready MVP deployed with beta users.

### Post-MVP Enhancements

- [ ] Additional scrapers to expand knowledge base coverage
- [ ] Prompt tuning based on user feedback analysis
- [ ] User history influencing new recommendations
- [ ] Advanced filtering and search in product comparison
- [ ] Notification system for seasonal reminders
- [ ] Admin dashboard for feedback monitoring
- [ ] A/B testing framework for prompt versions

---

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm (recommended) or npm
- Supabase account
- Cloudflare account (for R2)
- Anthropic API key
- OpenAI API key

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/ai-agronomist-advisor.git
cd ai-agronomist-advisor

# Install dependencies
pnpm install

# Copy environment variables
cp .env.example .env.local

# Set up the database
pnpm prisma generate
pnpm prisma db push

# Run development server
pnpm dev
```

### Development Commands

```bash
# Start development server
pnpm dev

# Run type checking
pnpm typecheck

# Run linting
pnpm lint

# Run tests
pnpm test

# Run e2e tests
pnpm test:e2e

# Build for production
pnpm build

# Start production server
pnpm start

# Run database migrations
pnpm prisma migrate dev

# Open Prisma Studio
pnpm prisma studio

# Run ingestion pipeline
pnpm ingest

# Update product prices
pnpm update-prices
```

---

## Environment Variables

```bash
# .env.example

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Database (Supabase PostgreSQL)
DATABASE_URL=postgresql://postgres:password@db.your-project.supabase.co:5432/postgres

# Cloudflare R2
R2_ACCOUNT_ID=your-account-id
R2_ACCESS_KEY_ID=your-access-key
R2_SECRET_ACCESS_KEY=your-secret-key
R2_BUCKET_NAME=agronomist-assets
R2_PUBLIC_URL=https://your-bucket.r2.dev

# AI APIs
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...

# Image Embeddings (Replicate)
REPLICATE_API_TOKEN=r8_...

# Optional: Analytics
NEXT_PUBLIC_VERCEL_ANALYTICS_ID=your-analytics-id
```

---

## Contributing

Contributions are welcome! Please read our contributing guidelines before submitting a PR.

### Development Workflow

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run tests (`pnpm test`)
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

### Code Style

- TypeScript strict mode enabled
- ESLint + Prettier for formatting
- Conventional commits for commit messages

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

**Built with 🌱 for farmers**
