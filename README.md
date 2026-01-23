# AI Agronomist Advisor

> **Diagnose crop issues. Get actionable recommendations. Find the right products.**
>
> AI Agronomist Advisor helps farmers across North America turn field observations into specific, research-backed recommendations—with product pricing and purchase links.

---

## Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [How It Works](#how-it-works)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Repository Structure](#repository-structure)
- [Database Schema](#database-schema)
- [UI Architecture](#ui-architecture)
- [Progressive Web App (PWA)](#progressive-web-app-pwa)
- [Data Ingestion Pipeline](#data-ingestion-pipeline)
- [AI Agent System](#ai-agent-system)
- [Feedback Loop System](#feedback-loop-system)
- [API Reference](#api-reference)
- [Development Roadmap](#development-roadmap)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

**AI Agronomist Advisor** is an intelligent agricultural recommendation system designed for farmers and agronomists across North America (US and Canada). The platform accepts multiple input types—from a simple photo and description of field conditions to detailed laboratory soil test data—and generates specific, actionable recommendations.

The system uses **multi-modal AI** (vision + language models) combined with **retrieval-augmented generation (RAG)** to ground every recommendation in authoritative sources: university extension guides, regional best practices, and product databases. Recommendations include **specific branded products with current pricing and purchase links**, giving users a clear path from diagnosis to action.

A built-in **feedback loop** continuously improves recommendation quality based on user outcomes and ratings.

### Target Users

| User Type | Use Case | Input Method |
|-----------|----------|--------------|
| **Smallholder Farmers** | Quick field diagnosis, accessible recommendations | Photo + description |
| **Commercial Farmers** | Precise recommendations based on soil analysis | Lab report data |
| **Agronomists & Advisors** | Client recommendations with source citations | Hybrid (both inputs) |
| **Agricultural Retailers** | Product recommendations for customer issues | Any input method |

### Geographic Scope

- **United States**: All 50 states, with regional data for soil types, climate zones, and state extension resources
- **Canada**: All provinces, integrated with provincial agriculture ministry resources

### Crop Scope

Broad coverage across major North American crops:

- **Row Crops**: Corn, soybeans, wheat, barley, oats, canola, sunflowers
- **Vegetables**: Tomatoes, peppers, potatoes, onions, carrots, leafy greens
- **Fruits**: Apples, grapes, berries, citrus, stone fruits
- **Specialty Crops**: Cotton, tobacco, sugar beets, dry beans
- **Forage**: Alfalfa, hay, pasture grasses

---

## Key Features

### Multi-Modal Input System

Users can provide information through three pathways, accommodating different levels of available data:

| Input Type | Description | Best For |
|------------|-------------|----------|
| **Photo + Description** | Upload a field photo and describe symptoms in plain language | Quick diagnosis, farmers without lab access |
| **Lab Report Data** | Enter structured soil test results (pH, N-P-K, micronutrients, etc.) | Precise recommendations, commercial operations |
| **Hybrid** | Combine visual observation with lab data | Most accurate recommendations |

### AI-Powered Diagnosis

- **Vision Analysis**: Claude 4.5 Sonnet analyzes uploaded images to identify symptoms, deficiencies, diseases, and pest damage
- **Symptom Extraction**: Natural language processing extracts key indicators from user descriptions
- **Pattern Matching**: Multi-modal RAG matches observations against reference images and documented conditions

### Research-Grounded Recommendations

- Every recommendation cites authoritative sources (university extensions, peer-reviewed research)
- Confidence indicators show recommendation reliability
- Source transparency UI lets users explore the retrieved context

### Product Recommendations with Pricing

- **Branded Products**: Specific product recommendations (fertilizers, amendments, pesticides)
- **Current Pricing**: Regularly updated price data from major retailers
- **Purchase Links**: Direct links to buy from agricultural suppliers
- **Comparison Tools**: Side-by-side product comparison on price, application rate, and effectiveness

### Continuous Improvement

- **User Feedback**: Rate recommendations, report outcomes
- **Feedback Analysis**: System identifies patterns in low-rated recommendations
- **Prompt Tuning**: AI prompts improve based on aggregated feedback
- **Retrieval Optimization**: Knowledge base gaps are identified and filled

### Progressive Web App

- **Installable**: Add to home screen on iOS, Android, Windows, macOS
- **Offline Capable**: View past recommendations without internet
- **Camera Integration**: Direct camera access for field photos on mobile
- **Push Notifications**: Alerts for follow-up recommendations and seasonal reminders

---

## How It Works

### User Journey

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           USER JOURNEY                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌────────┐│
│  │  SIGNUP  │───▶│  PROFILE │───▶│  INPUT   │───▶│  RESULTS │───▶│FEEDBACK││
│  │          │    │  SETUP   │    │          │    │          │    │        ││
│  └──────────┘    └──────────┘    └──────────┘    └──────────┘    └────────┘│
│                                                                             │
│  Create        Set location,    Upload photo    View diagnosis,  Rate      │
│  account       crops, farm      + description   recommendations, accuracy, │
│                size             OR lab data     products         report    │
│                                 OR both                          outcomes  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Data Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              DATA FLOW                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   USER INPUT                                                                │
│   ┌─────────────────┐                                                       │
│   │ Photo + Text    │──┐                                                    │
│   │ OR Lab Data     │  │                                                    │
│   │ OR Both         │  │                                                    │
│   └─────────────────┘  │                                                    │
│                        ▼                                                    │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │                    INPUT PROCESSING                                  │  │
│   │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                  │  │
│   │  │   Vision    │  │    Text     │  │  Lab Data   │                  │  │
│   │  │  Analysis   │  │  Extraction │  │   Parser    │                  │  │
│   │  │  (Claude)   │  │             │  │             │                  │  │
│   │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘                  │  │
│   │         │                │                │                          │  │
│   │         └────────────────┼────────────────┘                          │  │
│   │                          ▼                                           │  │
│   │              ┌─────────────────────┐                                 │  │
│   │              │ Unified Input Model │                                 │  │
│   │              │ (normalized repr.)  │                                 │  │
│   │              └──────────┬──────────┘                                 │  │
│   └─────────────────────────┼───────────────────────────────────────────┘  │
│                             │                                               │
│                             ▼                                               │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │                    RETRIEVAL (Multi-Modal RAG)                       │  │
│   │                                                                      │  │
│   │  ┌─────────────────┐              ┌─────────────────┐               │  │
│   │  │  Text Embedding │              │ Image Embedding │               │  │
│   │  │  (OpenAI)       │              │ (OpenAI)        │               │  │
│   │  └────────┬────────┘              └────────┬────────┘               │  │
│   │           │                                │                         │  │
│   │           ▼                                ▼                         │  │
│   │  ┌─────────────────┐              ┌─────────────────┐               │  │
│   │  │ pgvector Search │              │ pgvector Search │               │  │
│   │  │ (text chunks)   │              │ (image refs)    │               │  │
│   │  └────────┬────────┘              └────────┬────────┘               │  │
│   │           │                                │                         │  │
│   │           └────────────┬───────────────────┘                        │  │
│   │                        ▼                                             │  │
│   │           ┌─────────────────────────┐                               │  │
│   │           │  Top-K Chunks + Images  │                               │  │
│   │           │  with source metadata   │                               │  │
│   │           └────────────┬────────────┘                               │  │
│   └────────────────────────┼────────────────────────────────────────────┘  │
│                            │                                                │
│                            ▼                                                │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │                    RECOMMENDATION ENGINE                             │  │
│   │                                                                      │  │
│   │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐      │  │
│   │  │ Recommendation  │  │ Retrieval Critic│  │  Output Audit   │      │  │
│   │  │     Agent       │─▶│     Agent       │─▶│     Agent       │      │  │
│   │  │                 │  │                 │  │                 │      │  │
│   │  │ Generates       │  │ Assesses        │  │ Validates       │      │  │
│   │  │ structured      │  │ context quality │  │ schema +        │      │  │
│   │  │ recommendations │  │ and relevance   │  │ citations       │      │  │
│   │  └─────────────────┘  └─────────────────┘  └────────┬────────┘      │  │
│   │                                                     │                │  │
│   │                                    ┌────────────────┘                │  │
│   │                                    ▼                                 │  │
│   │                       ┌─────────────────────┐                        │  │
│   │                       │   Zod Validation    │                        │  │
│   │                       │   + Retry Logic     │                        │  │
│   │                       │   (max 2 attempts)  │                        │  │
│   │                       └──────────┬──────────┘                        │  │
│   └──────────────────────────────────┼──────────────────────────────────┘  │
│                                      │                                      │
│                                      ▼                                      │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │                         OUTPUT                                       │  │
│   │                                                                      │  │
│   │  ┌──────────────────────────────────────────────────────────────┐   │  │
│   │  │ {                                                             │   │  │
│   │  │   "diagnosis": { ... },                                       │   │  │
│   │  │   "recommendations": [ ... ],                                 │   │  │
│   │  │   "products": [ { name, price, link, ... } ],                 │   │  │
│   │  │   "sources": [ { title, excerpt, url, ... } ],                │   │  │
│   │  │   "confidence": 0.85                                          │   │  │
│   │  │ }                                                             │   │  │
│   │  └──────────────────────────────────────────────────────────────┘   │  │
│   │                                                                      │  │
│   └─────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Architecture

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         AI AGRONOMIST ADVISOR                                │
│                         System Architecture                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │                    FRONTEND (Next.js 14 + PWA)                        │ │
│  │                                                                       │ │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐    │ │
│  │  │  Landing    │ │  Diagnose   │ │  Results &  │ │  Products   │    │ │
│  │  │  Page       │ │  Flow       │ │  History    │ │  Browser    │    │ │
│  │  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘    │ │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐    │ │
│  │  │  Context    │ │  Feedback   │ │  Settings   │ │  Service    │    │ │
│  │  │  Viewer     │ │  System     │ │  & Profile  │ │  Worker     │    │ │
│  │  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘    │ │
│  │                                                                       │ │
│  │  Deployed on: Vercel (Edge + Serverless)                             │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                      │                                      │
│                                      │ API Routes                           │
│                                      ▼                                      │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │                    API LAYER (Next.js API Routes)                     │ │
│  │                                                                       │ │
│  │  /api/diagnose          /api/recommendations      /api/products       │ │
│  │    ├── analyze-image      ├── [id]                  ├── search        │ │
│  │    └── parse-lab          └── generate              ├── [id]          │ │
│  │                                                     └── compare       │ │
│  │  /api/feedback          /api/upload               /api/user           │ │
│  │    └── submit             └── image                 ├── profile       │ │
│  │                                                     └── history       │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                    │                    │                    │              │
│                    ▼                    ▼                    ▼              │
│  ┌────────────────────────┐ ┌────────────────────┐ ┌────────────────────┐ │
│  │      AI LAYER          │ │   RETRIEVAL LAYER  │ │   PRODUCT LAYER   │ │
│  │                        │ │                    │ │                    │ │
│  │ ┌────────────────────┐ │ │ ┌────────────────┐ │ │ ┌────────────────┐ │ │
│  │ │ Vision Analysis    │ │ │ │ Text Embedding │ │ │ │ Product Match  │ │ │
│  │ │ (Claude 3.5)       │ │ │ │ (OpenAI)       │ │ │ │ Engine         │ │ │
│  │ └────────────────────┘ │ │ └────────────────┘ │ │ └────────────────┘ │ │
│  │ ┌────────────────────┐ │ │ ┌────────────────┐ │ │ ┌────────────────┐ │ │
│  │ │ Recommendation     │ │ │ │ Image Embedding│ │ │ │ Price Lookup   │ │ │
│  │ │ Agent              │ │ │ │ (OpenAI)       │ │ │ │ Service        │ │ │
│  │ └────────────────────┘ │ │ └────────────────┘ │ │ └────────────────┘ │ │
│  │ ┌────────────────────┐ │ │ ┌────────────────┐ │ │ ┌────────────────┐ │ │
│  │ │ Retrieval Critic   │ │ │ │ Similarity     │ │ │ │ Retailer Links │ │ │
│  │ │ Agent              │ │ │ │ Search         │ │ │ │ Generator      │ │ │
│  │ └────────────────────┘ │ │ └────────────────┘ │ │ └────────────────┘ │ │
│  │ ┌────────────────────┐ │ │ ┌────────────────┐ │ │                    │ │
│  │ │ Output Audit       │ │ │ │ Context        │ │ │                    │ │
│  │ │ Agent              │ │ │ │ Assembly       │ │ │                    │ │
│  │ └────────────────────┘ │ │ └────────────────┘ │ │                    │ │
│  │ ┌────────────────────┐ │ │                    │ │                    │ │
│  │ │ Zod Validation     │ │ │                    │ │                    │ │
│  │ │ + Retry            │ │ │                    │ │                    │ │
│  │ └────────────────────┘ │ │                    │ │                    │ │
│  └────────────────────────┘ └────────────────────┘ └────────────────────┘ │
│                    │                    │                    │              │
│                    ▼                    ▼                    ▼              │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │                         STORAGE LAYER                                 │ │
│  │                                                                       │ │
│  │  ┌─────────────────────────────────────────────────────────────────┐ │ │
│  │  │                    SUPABASE                                      │ │ │
│  │  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌───────────┐ │ │ │
│  │  │  │ PostgreSQL  │ │  pgvector   │ │  Supabase   │ │ Supabase  │ │ │ │
│  │  │  │ (App Data)  │ │ (Embeddings)│ │  Storage    │ │ Auth      │ │ │ │
│  │  │  │             │ │             │ │ (User imgs) │ │           │ │ │ │
│  │  │  │ - users     │ │ - text_emb  │ │             │ │ - OAuth   │ │ │ │
│  │  │  │ - inputs    │ │ - image_emb │ │             │ │ - Email   │ │ │ │
│  │  │  │ - recs      │ │ - metadata  │ │             │ │ - Magic   │ │ │ │
│  │  │  │ - feedback  │ │             │ │             │ │   Link    │ │ │ │
│  │  │  │ - products  │ │             │ │             │ │           │ │ │ │
│  │  │  └─────────────┘ └─────────────┘ └─────────────┘ └───────────┘ │ │ │
│  │  └─────────────────────────────────────────────────────────────────┘ │ │
│  │                                                                       │ │
│  │  ┌─────────────────────────────────────────────────────────────────┐ │ │
│  │  │                  CLOUDFLARE R2                                   │ │ │
│  │  │  ┌─────────────────────────────────────────────────────────┐   │ │ │
│  │  │  │ Knowledge Base Assets                                    │   │ │ │
│  │  │  │ - Reference images (deficiency symptoms, diseases)       │   │ │ │
│  │  │  │ - Product images                                         │   │ │ │
│  │  │  │ - Ingested document PDFs                                 │   │ │ │
│  │  │  └─────────────────────────────────────────────────────────┘   │ │ │
│  │  └─────────────────────────────────────────────────────────────────┘ │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │                    INGESTION PIPELINE (Offline/Scheduled)             │ │
│  │                                                                       │ │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐ │ │
│  │  │ Scrapers │─▶│ Parsers  │─▶│ Chunking │─▶│Embeddings│─▶│pgvector│ │ │
│  │  │Playwright│  │PDF/HTML  │  │ + Images │  │Text+IMG  │  │ Upsert │ │ │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘  └────────┘ │ │
│  │                                                                       │ │
│  │  Sources: University Extensions, Product Manufacturers, Ag Retailers │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │                    EXTERNAL SERVICES                                  │ │
│  │                                                                       │ │
│  │  ┌─────────────┐ ┌─────────────┐  ┌─────────────┐                     │ │
│  │  │ Anthropic   │ │ OpenAI      │  │ Vercel      │                     │ │
│  │  │ Claude API  │ │ Embeddings  │  │ Analytics   │                     │ │
│  │  │             │ │ API         │  │             │                     │ │
│  │  └─────────────┘ └─────────────┘  └─────────────┘                     │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Unified Framework** | Next.js 14 (App Router) | Single deployment, shared types, lower cost than separate frontend/backend |
| **Database** | Supabase (PostgreSQL + pgvector) | Free tier includes vectors, auth, storage; scales well |
| **Image Storage** | Cloudflare R2 | Zero egress fees, S3-compatible, generous free tier |
| **Primary LLM** | Claude 4.5 Sonnet | Best vision + reasoning combination, competitive pricing |
| **Embeddings** | OpenAI text-embedding-3-small | Best quality/cost ratio for text|
| **Auth** | Supabase Auth | Included free, handles OAuth, email, magic links |
| **Deployment** | Vercel | Optimal for Next.js, edge functions, automatic scaling |

---

## Tech Stack

### Complete Technology Stack

#### Frontend

| Technology | Version | Purpose |
|------------|---------|---------|
| Next.js | 14.x | React framework with App Router, Server Components |
| React | 18.x | UI library |
| TypeScript | 5.x | Type safety |
| Tailwind CSS | 3.x | Utility-first styling |
| shadcn/ui | latest | Accessible component primitives |
| Radix UI | latest | Underlying primitives for shadcn |
| React Hook Form | 7.x | Form state management |
| Zod | 3.x | Schema validation (shared with backend) |
| TanStack Query | 5.x | Server state, caching, mutations |
| Zustand | 4.x | Client state (minimal usage) |
| nuqs | 1.x | Type-safe URL state management |
| Framer Motion | 10.x | Animations |
| Lucide React | latest | Icons |
| next-themes | latest | Dark mode |
| Sonner | latest | Toast notifications |
| next-pwa | latest | PWA configuration |

#### Backend (Next.js API Routes)

| Technology | Version | Purpose |
|------------|---------|---------|
| Next.js API Routes | 14.x | API endpoints |
| Server Actions | 14.x | Form mutations |
| Prisma | 5.x | Database ORM |
| Zod | 3.x | Request/response validation |
| sharp | latest | Image processing |

#### AI & ML

| Technology | Purpose | Cost |
|------------|---------|------|
| Claude 4.5 Sonnet | Vision analysis, recommendation generation | ~$3/M input, ~$15/M output tokens |
| GPT-4o-mini | Lightweight tasks, validation | ~$0.15/M input, ~$0.60/M output tokens |
| OpenAI text-embedding-3-small | Text embeddings | $0.02/M tokens |

#### Database & Storage

| Technology | Purpose | Free Tier |
|------------|---------|-----------|
| Supabase PostgreSQL | Application data | 500MB |
| Supabase pgvector | Vector embeddings | Included |
| Supabase Storage | User uploads | 1GB |
| Supabase Auth | Authentication | 50k MAU |
| Cloudflare R2 | Knowledge base assets | 10GB storage, no egress |

#### Ingestion Pipeline

| Technology | Purpose |
|------------|---------|
| Playwright | JavaScript-rendered page scraping |
| Cheerio | HTML parsing |
| pdf-parse | PDF text extraction |
| sharp | Image extraction and processing |

#### Infrastructure

| Service | Purpose | Free Tier |
|---------|---------|-----------|
| Vercel | Frontend + API hosting | 100GB bandwidth |
| Cloudflare | CDN, R2 storage | Generous |
| GitHub Actions | CI/CD, scheduled jobs | 2000 min/month |

### Monthly Cost Estimate

| Scale | Users | Recommendations/month | Estimated Cost |
|-------|-------|----------------------|----------------|
| **MVP** | 1-100 | 500 | $0-30 |
| **Early Growth** | 100-1000 | 5,000 | $50-150 |
| **Growth** | 1000-10,000 | 50,000 | $300-800 |

Cost breakdown at MVP scale:

| Service | Monthly Cost |
|---------|-------------|
| Vercel | $0 (free tier) |
| Supabase | $0 (free tier) |
| Cloudflare R2 | $0 (free tier) |
| Claude API | ~$15-25 |
| OpenAI Embeddings | ~$5-10 |
| **Total** | **~$25-40** |

---

## Repository Structure

```
ai-agronomist-advisor/
├── app/                              # Next.js App Router
│   ├── (marketing)/                  # Marketing pages (public)
│   │   ├── page.tsx                  # Landing page
│   │   ├── about/
│   │   │   └── page.tsx              # About page
│   │   ├── pricing/
│   │   │   └── page.tsx              # Pricing page
│   │   └── layout.tsx                # Marketing layout
│   │
│   ├── (auth)/                       # Authentication pages
│   │   ├── login/
│   │   │   └── page.tsx              # Login page
│   │   ├── signup/
│   │   │   └── page.tsx              # Signup page
│   │   ├── callback/
│   │   │   └── route.ts              # OAuth callback
│   │   ├── forgot-password/
│   │   │   └── page.tsx              # Password reset
│   │   └── layout.tsx                # Auth layout (centered)
│   │
│   ├── (app)/                        # Main application (authenticated)
│   │   ├── layout.tsx                # App shell with sidebar
│   │   ├── dashboard/
│   │   │   └── page.tsx              # User dashboard
│   │   ├── diagnose/
│   │   │   ├── page.tsx              # Input method selection
│   │   │   ├── photo/
│   │   │   │   └── page.tsx          # Photo + description flow
│   │   │   ├── lab-report/
│   │   │   │   └── page.tsx          # Lab report form
│   │   │   └── hybrid/
│   │   │       └── page.tsx          # Combined input
│   │   ├── recommendations/
│   │   │   ├── page.tsx              # Recommendations list
│   │   │   └── [id]/
│   │   │       ├── page.tsx          # Single recommendation
│   │   │       ├── sources/
│   │   │       │   └── page.tsx      # Context viewer
│   │   │       └── feedback/
│   │   │           └── page.tsx      # Feedback form
│   │   ├── products/
│   │   │   ├── page.tsx              # Product browser
│   │   │   ├── [id]/
│   │   │   │   └── page.tsx          # Product detail
│   │   │   └── compare/
│   │   │       └── page.tsx          # Comparison view
│   │   ├── history/
│   │   │   └── page.tsx              # Input/output history
│   │   ├── settings/
│   │   │   ├── page.tsx              # Settings overview
│   │   │   ├── profile/
│   │   │   │   └── page.tsx          # User profile
│   │   │   └── preferences/
│   │   │       └── page.tsx          # App preferences
│   │   └── feedback/
│   │       └── page.tsx              # User's feedback history
│   │
│   ├── api/                          # API routes
│   │   ├── diagnose/
│   │   │   ├── analyze-image/
│   │   │   │   └── route.ts          # Vision analysis endpoint
│   │   │   └── parse-lab/
│   │   │       └── route.ts          # Lab data parsing
│   │   ├── recommendations/
│   │   │   ├── route.ts              # Generate recommendation
│   │   │   └── [id]/
│   │   │       └── route.ts          # Get/update recommendation
│   │   ├── products/
│   │   │   ├── route.ts              # Search products
│   │   │   ├── [id]/
│   │   │   │   └── route.ts          # Product detail
│   │   │   └── compare/
│   │   │       └── route.ts          # Comparison data
│   │   ├── feedback/
│   │   │   └── route.ts              # Submit feedback
│   │   ├── upload/
│   │   │   └── route.ts              # Image upload
│   │   └── webhooks/
│   │       └── supabase/
│   │           └── route.ts          # Database webhooks
│   │
│   ├── layout.tsx                    # Root layout
│   ├── loading.tsx                   # Global loading
│   ├── error.tsx                     # Global error
│   ├── not-found.tsx                 # 404 page
│   └── manifest.ts                   # PWA manifest
│
├── components/                       # React components
│   ├── layout/
│   │   ├── app-shell.tsx             # Main app wrapper
│   │   ├── sidebar.tsx               # Navigation sidebar
│   │   ├── header.tsx                # Top header bar
│   │   ├── mobile-nav.tsx            # Mobile bottom nav
│   │   └── breadcrumbs.tsx           # Breadcrumb navigation
│   │
│   ├── ui/                           # shadcn/ui components
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── dialog.tsx
│   │   ├── dropdown-menu.tsx
│   │   ├── form.tsx
│   │   ├── input.tsx
│   │   ├── select.tsx
│   │   ├── tabs.tsx
│   │   ├── badge.tsx
│   │   ├── skeleton.tsx
│   │   ├── slider.tsx
│   │   ├── textarea.tsx
│   │   └── ... (additional as needed)
│   │
│   ├── diagnose/
│   │   ├── input-method-picker.tsx   # Photo/Lab/Both selector
│   │   ├── image-upload-zone.tsx     # Drag-drop + camera
│   │   ├── image-preview.tsx         # Uploaded image display
│   │   ├── description-input.tsx     # Symptom description
│   │   ├── lab-report-form.tsx       # Structured lab form
│   │   ├── location-picker.tsx       # Region selector
│   │   ├── crop-selector.tsx         # Crop multi-select
│   │   ├── season-selector.tsx       # Growth stage
│   │   └── submission-summary.tsx    # Pre-submit review
│   │
│   ├── recommendations/
│   │   ├── recommendation-card.tsx   # List item card
│   │   ├── recommendation-detail.tsx # Full recommendation
│   │   ├── recommendation-section.tsx# Collapsible section
│   │   ├── action-item.tsx           # Single action step
│   │   ├── product-suggestion.tsx    # Inline product
│   │   ├── confidence-indicator.tsx  # Confidence display
│   │   ├── source-badge.tsx          # Source type badge
│   │   ├── citation-link.tsx         # Citation reference
│   │   └── sources-panel.tsx         # Context viewer panel
│   │
│   ├── products/
│   │   ├── product-card.tsx          # Grid/list card
│   │   ├── product-detail.tsx        # Full product view
│   │   ├── price-display.tsx         # Price + timestamp
│   │   ├── purchase-links.tsx        # Retailer links
│   │   ├── application-rates.tsx     # Rate table
│   │   ├── product-comparison.tsx    # Side-by-side view
│   │   └── product-filters.tsx       # Filter controls
│   │
│   ├── feedback/
│   │   ├── quick-feedback.tsx        # Thumbs up/down
│   │   ├── detailed-feedback-form.tsx# Full feedback
│   │   ├── outcome-reporter.tsx      # Outcome follow-up
│   │   └── feedback-history.tsx      # Past feedback
│   │
│   ├── dashboard/
│   │   ├── quick-actions.tsx         # Action buttons
│   │   ├── recent-recommendations.tsx# Recent list
│   │   ├── stats-overview.tsx        # Usage stats
│   │   └── welcome-banner.tsx        # Onboarding
│   │
│   └── shared/
│       ├── loading-spinner.tsx       # Loading state
│       ├── empty-state.tsx           # No data display
│       ├── error-display.tsx         # Error + retry
│       ├── confirm-dialog.tsx        # Confirmation modal
│       ├── install-prompt.tsx        # PWA install prompt
│       └── offline-indicator.tsx     # Offline status
│
├── lib/                              # Shared utilities
│   ├── api/
│   │   ├── client.ts                 # API client wrapper
│   │   └── errors.ts                 # Error handling
│   │
│   ├── ai/
│   │   ├── claude.ts                 # Claude API wrapper
│   │   ├── openai.ts                 # OpenAI API wrapper
│   │   ├── embeddings.ts             # Embedding generation
│   │   └── agents/
│   │       ├── recommendation.ts     # Recommendation agent
│   │       ├── retrieval-critic.ts   # Retrieval critic agent
│   │       └── output-audit.ts       # Output audit agent
│   │
│   ├── retrieval/
│   │   ├── search.ts                 # Vector search
│   │   ├── context-assembly.ts       # Context building
│   │   └── reranking.ts              # Result reranking
│   │
│   ├── products/
│   │   ├── matching.ts               # Product matching
│   │   └── pricing.ts                # Price lookup
│   │
│   ├── validation/
│   │   ├── schemas.ts                # Zod schemas
│   │   └── retry.ts                  # Retry logic
│   │
│   ├── db/
│   │   ├── client.ts                 # Prisma client
│   │   └── queries/
│   │       ├── users.ts              # User queries
│   │       ├── recommendations.ts    # Recommendation queries
│   │       ├── products.ts           # Product queries
│   │       └── feedback.ts           # Feedback queries
│   │
│   ├── storage/
│   │   ├── supabase.ts               # Supabase storage
│   │   └── r2.ts                     # Cloudflare R2
│   │
│   ├── auth/
│   │   ├── session.ts                # Session management
│   │   └── middleware.ts             # Auth middleware
│   │
│   └── utils/
│       ├── cn.ts                     # Class name utility
│       ├── format.ts                 # Formatting helpers
│       └── constants.ts              # App constants
│
├── hooks/                            # Custom React hooks
│   ├── use-recommendations.ts        # Recommendation data
│   ├── use-products.ts               # Product data
│   ├── use-feedback.ts               # Feedback mutations
│   ├── use-upload.ts                 # File upload
│   ├── use-auth.ts                   # Authentication
│   ├── use-pwa.ts                    # PWA install state
│   └── use-offline.ts                # Offline detection
│
├── types/                            # TypeScript types
│   ├── api.ts                        # API request/response
│   ├── database.ts                   # Database models
│   ├── ai.ts                         # AI-related types
│   └── ui.ts                         # UI component props
│
├── prisma/
│   ├── schema.prisma                 # Database schema
│   ├── migrations/                   # Migration files
│   └── seed.ts                       # Seed data
│
├── ingestion/                        # Data ingestion pipeline
│   ├── scrapers/
│   │   ├── extension-guides.ts       # University extensions
│   │   ├── product-pages.ts          # Product manufacturers
│   │   └── retailers.ts              # Ag retailers
│   │
│   ├── parsers/
│   │   ├── pdf.ts                    # PDF parser
│   │   ├── html.ts                   # HTML parser
│   │   └── image-extractor.ts        # Image extraction
│   │
│   ├── processing/
│   │   ├── chunker.ts                # Text chunking
│   │   ├── embedder.ts               # Embedding generation
│   │   └── upserter.ts               # pgvector upsert
│   │
│   ├── sources/
│   │   ├── universities.json         # Extension URLs
│   │   ├── products.json             # Product source URLs
│   │   └── retailers.json            # Retailer URLs
│   │
│   └── scripts/
│       ├── run-ingestion.ts          # Full pipeline
│       ├── update-prices.ts          # Price refresh
│       └── validate-sources.ts       # Source validation
│
├── public/
│   ├── icons/                        # PWA icons
│   │   ├── icon-72x72.png
│   │   ├── icon-96x96.png
│   │   ├── icon-128x128.png
│   │   ├── icon-144x144.png
│   │   ├── icon-152x152.png
│   │   ├── icon-192x192.png
│   │   ├── icon-384x384.png
│   │   └── icon-512x512.png
│   ├── screenshots/                  # PWA screenshots
│   ├── splash/                       # iOS splash screens
│   └── images/
│       ├── logo.svg
│       ├── og-image.png              # Social sharing
│       └── ...
│
├── docs/
│   ├── architecture-diagram.png      # Architecture visual
│   ├── api-reference.md              # API documentation
│   ├── data-sources.md               # Ingestion sources
│   ├── agent-specs.md                # AI agent specifications
│   └── deployment.md                 # Deployment guide
│
├── tests/
│   ├── unit/                         # Unit tests
│   ├── integration/                  # Integration tests
│   └── e2e/                          # End-to-end tests
│
├── .github/
│   ├── workflows/
│   │   ├── ci.yml                    # CI pipeline
│   │   ├── deploy.yml                # Deployment
│   │   └── ingestion.yml             # Scheduled ingestion
│   └── ISSUE_TEMPLATE/
│       ├── feature.md
│       └── bug.md
│
├── .env.example                      # Environment template
├── .env.local                        # Local environment (git ignored)
├── .gitignore
├── next.config.js                    # Next.js config
├── tailwind.config.ts                # Tailwind config
├── tsconfig.json                     # TypeScript config
├── package.json
├── pnpm-lock.yaml
└── README.md                         # This file
```

---

## Database Schema

### Entity Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         DATABASE SCHEMA                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────┐         ┌─────────────────┐                           │
│  │     users       │         │   user_profiles │                           │
│  ├─────────────────┤         ├─────────────────┤                           │
│  │ id (uuid) PK    │────────▶│ id (uuid) PK    │                           │
│  │ email           │         │ user_id FK      │                           │
│  │ created_at      │         │ display_name    │                           │
│  │ updated_at      │         │ location_state  │                           │
│  └─────────────────┘         │ location_country│                           │
│          │                   │ farm_size_acres │                           │
│          │                   │ crops (text[])  │                           │
│          │                   │ created_at      │                           │
│          │                   │ updated_at      │                           │
│          │                   └─────────────────┘                           │
│          │                                                                  │
│          │         ┌─────────────────┐         ┌─────────────────┐         │
│          │         │   inputs        │         │ recommendations │         │
│          │         ├─────────────────┤         ├─────────────────┤         │
│          └────────▶│ id (uuid) PK    │────────▶│ id (uuid) PK    │         │
│                    │ user_id FK      │         │ input_id FK     │         │
│                    │ type (enum)     │         │ diagnosis       │         │
│                    │ image_url       │         │ recommendations │         │
│                    │ description     │         │ confidence      │         │
│                    │ lab_data (json) │         │ model_used      │         │
│                    │ location        │         │ tokens_used     │         │
│                    │ crop            │         │ latency_ms      │         │
│                    │ season          │         │ created_at      │         │
│                    │ created_at      │         └────────┬────────┘         │
│                    └─────────────────┘                  │                   │
│                                                         │                   │
│                    ┌─────────────────┐                  │                   │
│                    │    feedback     │                  │                   │
│                    ├─────────────────┤                  │                   │
│                    │ id (uuid) PK    │◀─────────────────┘                   │
│                    │ recommendation_id FK                                   │
│                    │ user_id FK      │                                      │
│                    │ rating (1-5)    │                                      │
│                    │ helpful (bool)  │                                      │
│                    │ accuracy (1-5)  │                                      │
│                    │ outcome_reported│                                      │
│                    │ outcome_notes   │                                      │
│                    │ created_at      │                                      │
│                    └─────────────────┘                                      │
│                                                                             │
│  ┌─────────────────┐         ┌─────────────────┐                           │
│  │ recommendation  │         │    sources      │                           │
│  │ _sources        │         ├─────────────────┤                           │
│  ├─────────────────┤         │ id (uuid) PK    │                           │
│  │ id (uuid) PK    │────────▶│ title           │                           │
│  │ recommendation_id FK      │ type (enum)     │                           │
│  │ source_id FK    │         │ url             │                           │
│  │ relevance_score │         │ publisher       │                           │
│  │ excerpt         │         │ publish_date    │                           │
│  └─────────────────┘         │ created_at      │                           │
│                              └─────────────────┘                           │
│                                                                             │
│  ┌─────────────────┐         ┌─────────────────┐                           │
│  │    products     │         │ product_prices  │                           │
│  ├─────────────────┤         ├─────────────────┤                           │
│  │ id (uuid) PK    │────────▶│ id (uuid) PK    │                           │
│  │ name            │         │ product_id FK   │                           │
│  │ brand           │         │ retailer        │                           │
│  │ type (enum)     │         │ price           │                           │
│  │ analysis (json) │         │ unit            │                           │
│  │ application_rate│         │ url             │                           │
│  │ crops (text[])  │         │ in_stock        │                           │
│  │ image_url       │         │ last_updated    │                           │
│  │ created_at      │         └─────────────────┘                           │
│  │ updated_at      │                                                       │
│  └─────────────────┘                                                       │
│                                                                             │
│  ┌─────────────────┐         ┌─────────────────┐                           │
│  │  text_chunks    │         │  image_chunks   │                           │
│  ├─────────────────┤         ├─────────────────┤                           │
│  │ id (uuid) PK    │         │ id (uuid) PK    │                           │
│  │ source_id FK    │         │ source_id FK    │                           │
│  │ content         │         │ image_url       │                           │
│  │ embedding (vec) │         │ alt_text        │                           │
│  │ chunk_index     │         │ embedding (vec) │                           │
│  │ metadata (json) │         │ context_chunk_id│                           │
│  │ created_at      │         │ metadata (json) │                           │
│  └─────────────────┘         │ created_at      │                           │
│                              └─────────────────┘                           │
│                                                                             │
│  ┌─────────────────┐                                                       │
│  │ retrieval_logs  │                                                       │
│  ├─────────────────┤                                                       │
│  │ id (uuid) PK    │                                                       │
│  │ recommendation_id FK                                                    │
│  │ query_text      │                                                       │
│  │ query_embedding │                                                       │
│  │ chunks_retrieved│                                                       │
│  │ reranked_chunks │                                                       │
│  │ latency_ms      │                                                       │
│  │ created_at      │                                                       │
│  └─────────────────┘                                                       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Prisma Schema

```prisma
// prisma/schema.prisma

generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["postgresqlExtensions"]
}

datasource db {
  provider   = "postgresql"
  url        = env("DATABASE_URL")
  extensions = [vector]
}

enum InputType {
  PHOTO
  LAB_REPORT
  HYBRID
}

enum SourceType {
  UNIVERSITY_EXTENSION
  MANUFACTURER
  RETAILER
  RESEARCH_PAPER
  GOVERNMENT
}

enum ProductType {
  FERTILIZER
  AMENDMENT
  PESTICIDE
  HERBICIDE
  FUNGICIDE
  SEED_TREATMENT
  BIOLOGICAL
}

model User {
  id              String            @id @default(uuid())
  email           String            @unique
  createdAt       DateTime          @default(now())
  updatedAt       DateTime          @updatedAt
  profile         UserProfile?
  inputs          Input[]
  feedback        Feedback[]
}

model UserProfile {
  id              String    @id @default(uuid())
  userId          String    @unique
  user            User      @relation(fields: [userId], references: [id])
  displayName     String?
  locationState   String?
  locationCountry String    @default("US")
  farmSizeAcres   Float?
  crops           String[]
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
}

model Input {
  id              String          @id @default(uuid())
  userId          String
  user            User            @relation(fields: [userId], references: [id])
  type            InputType
  imageUrl        String?
  description     String?
  labData         Json?
  location        String?
  crop            String?
  season          String?
  createdAt       DateTime        @default(now())
  recommendation  Recommendation?
}

model Recommendation {
  id              String                  @id @default(uuid())
  inputId         String                  @unique
  input           Input                   @relation(fields: [inputId], references: [id])
  diagnosis       Json
  recommendations Json
  confidence      Float
  modelUsed       String
  tokensUsed      Int
  latencyMs       Int
  createdAt       DateTime                @default(now())
  sources         RecommendationSource[]
  feedback        Feedback[]
  retrievalLog    RetrievalLog?
}

model Feedback {
  id                String          @id @default(uuid())
  recommendationId  String
  recommendation    Recommendation  @relation(fields: [recommendationId], references: [id])
  userId            String
  user              User            @relation(fields: [userId], references: [id])
  rating            Int?            // 1-5
  helpful           Boolean?
  accuracy          Int?            // 1-5
  outcomeReported   Boolean         @default(false)
  outcomeNotes      String?
  createdAt         DateTime        @default(now())

  @@unique([recommendationId, userId])
}

model Source {
  id              String                  @id @default(uuid())
  title           String
  type            SourceType
  url             String                  @unique
  publisher       String?
  publishDate     DateTime?
  createdAt       DateTime                @default(now())
  textChunks      TextChunk[]
  imageChunks     ImageChunk[]
  recommendations RecommendationSource[]
}

model RecommendationSource {
  id                String          @id @default(uuid())
  recommendationId  String
  recommendation    Recommendation  @relation(fields: [recommendationId], references: [id])
  sourceId          String
  source            Source          @relation(fields: [sourceId], references: [id])
  relevanceScore    Float
  excerpt           String?

  @@unique([recommendationId, sourceId])
}

model Product {
  id              String          @id @default(uuid())
  name            String
  brand           String
  type            ProductType
  analysis        Json            // N-P-K or active ingredients
  applicationRate String?
  crops           String[]
  imageUrl        String?
  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt
  prices          ProductPrice[]
}

model ProductPrice {
  id              String    @id @default(uuid())
  productId       String
  product         Product   @relation(fields: [productId], references: [id])
  retailer        String
  price           Float
  unit            String    // per lb, per gallon, etc.
  url             String
  inStock         Boolean   @default(true)
  lastUpdated     DateTime  @default(now())

  @@unique([productId, retailer])
}

model TextChunk {
  id              String                    @id @default(uuid())
  sourceId        String
  source          Source                    @relation(fields: [sourceId], references: [id])
  content         String
  embedding       Unsupported("vector(1536)")
  chunkIndex      Int
  metadata        Json?
  createdAt       DateTime                  @default(now())
  linkedImages    ImageChunk[]
}

model ImageChunk {
  id              String                    @id @default(uuid())
  sourceId        String
  source          Source                    @relation(fields: [sourceId], references: [id])
  imageUrl        String
  altText         String?
  embedding       Unsupported("vector(512)")
  contextChunkId  String?
  contextChunk    TextChunk?                @relation(fields: [contextChunkId], references: [id])
  metadata        Json?
  createdAt       DateTime                  @default(now())
}

model RetrievalLog {
  id                String          @id @default(uuid())
  recommendationId  String          @unique
  recommendation    Recommendation  @relation(fields: [recommendationId], references: [id])
  queryText         String
  queryEmbedding    Unsupported("vector(1536)")
  chunksRetrieved   Json
  rerankedChunks    Json?
  latencyMs         Int
  createdAt         DateTime        @default(now())
}
```

---

## UI Architecture

### Core Libraries

| Library | Version | Purpose |
|---------|---------|---------|
| **Next.js 14** | 14.x | App Router, Server Components, API Routes |
| **shadcn/ui** | latest | Accessible component primitives (copied to codebase) |
| **Tailwind CSS** | 3.x | Utility-first styling |
| **Radix UI** | latest | Underlying primitives for shadcn |
| **React Hook Form** | 7.x | Form state management with Zod integration |
| **TanStack Query** | 5.x | Server state, caching, optimistic updates |
| **Zustand** | 4.x | Minimal client state (only if needed) |
| **nuqs** | 1.x | Type-safe URL state for filters, pagination |
| **Framer Motion** | 10.x | Smooth animations |
| **Lucide React** | latest | Consistent iconography |
| **next-themes** | latest | Dark mode support |
| **Sonner** | latest | Toast notifications |

### Design System

#### Color Palette

Agriculture-inspired colors with clear semantic meaning:

```css
:root {
  /* Primary - Soil/Earth */
  --color-primary-50: #faf6f3;
  --color-primary-100: #f0e6dd;
  --color-primary-500: #8b6f47;
  --color-primary-600: #725a3a;
  --color-primary-700: #5c472f;
  
  /* Secondary - Growth/Plant */
  --color-secondary-50: #f0fdf4;
  --color-secondary-100: #dcfce7;
  --color-secondary-500: #22c55e;
  --color-secondary-600: #16a34a;
  --color-secondary-700: #15803d;
  
  /* Accent - Sky/Water */
  --color-accent-50: #f0f9ff;
  --color-accent-100: #e0f2fe;
  --color-accent-500: #0ea5e9;
  --color-accent-600: #0284c7;
  
  /* Semantic - Plant Health States */
  --color-healthy: #22c55e;        /* Healthy plant green */
  --color-deficiency: #eab308;     /* Nutrient deficiency yellow */
  --color-disease: #ef4444;        /* Disease/pest red */
  --color-neutral: #6b7280;        /* Neutral gray */
  
  /* Confidence Indicators */
  --color-confidence-high: #22c55e;
  --color-confidence-medium: #f59e0b;
  --color-confidence-low: #ef4444;
}
```

#### Typography

```css
:root {
  --font-sans: 'Inter', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', monospace;
  
  --font-size-xs: 0.75rem;
  --font-size-sm: 0.875rem;
  --font-size-base: 1rem;
  --font-size-lg: 1.125rem;
  --font-size-xl: 1.25rem;
  --font-size-2xl: 1.5rem;
  --font-size-3xl: 1.875rem;
}
```

#### Spacing & Borders

```css
:root {
  --radius-sm: 0.375rem;
  --radius-md: 0.5rem;
  --radius-lg: 0.75rem;
  --radius-xl: 1rem;
  
  --spacing-page: 1.5rem;
  --spacing-section: 2rem;
  --spacing-card: 1rem;
}
```

### Page Layouts

#### Marketing Layout
- Full-width header with navigation
- Hero section with CTA
- Feature sections
- Footer with links

#### Auth Layout
- Centered card
- Minimal navigation
- Brand logo

#### App Layout
- Collapsible sidebar (desktop)
- Bottom tab bar (mobile)
- Header with search and user menu
- Main content area with breadcrumbs

### Key User Flows

#### Photo + Description Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  STEP 1: UPLOAD                                                             │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │                                                                       │ │
│  │                    ┌─────────────────────────┐                        │ │
│  │                    │                         │                        │ │
│  │                    │      📷                 │                        │ │
│  │                    │                         │                        │ │
│  │                    │   Drag photo here       │                        │ │
│  │                    │   or tap to upload      │                        │ │
│  │                    │                         │                        │ │
│  │                    │   [Take Photo] [Browse] │                        │ │
│  │                    │                         │                        │ │
│  │                    └─────────────────────────┘                        │ │
│  │                                                                       │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │ Describe what you're seeing...                                        │ │
│  │                                                                       │ │
│  │ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │ │
│  │ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │ │
│  │                                                                       │ │
│  │                                                          0/500 chars │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  Your profile: 📍 Iowa, USA | 🌽 Corn, Soybeans | 🗓️ V4 Stage              │
│  [Edit profile]                                                             │
│                                                                             │
│                                                    [Cancel]  [Analyze →]   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  STEP 2: PROCESSING                                                         │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                     │   │
│  │  ┌──────────────┐                                                  │   │
│  │  │              │     Analyzing your field...                      │   │
│  │  │  [uploaded   │                                                  │   │
│  │  │   image]     │     ✓ Image received                            │   │
│  │  │              │     ✓ Analyzing visual symptoms                 │   │
│  │  └──────────────┘     ○ Searching knowledge base                  │   │
│  │                       ○ Generating recommendations                │   │
│  │                                                                     │   │
│  │  ████████████████░░░░░░░░░░░░░░░░  45%                            │   │
│  │                                                                     │   │
│  │  Estimated time: ~15 seconds                                       │   │
│  │                                                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  STEP 3: RESULTS                                                            │
│                                                                             │
│  ← Back to diagnose                                                         │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  DIAGNOSIS                                          Confidence: 87% │   │
│  │                                                     ████████░░ High │   │
│  │  ┌──────────┐                                                      │   │
│  │  │ [image]  │  🔬 Likely Nitrogen Deficiency                       │   │
│  │  │          │                                                      │   │
│  │  └──────────┘  The yellowing pattern on lower leaves moving        │   │
│  │                upward is characteristic of nitrogen deficiency     │   │
│  │                in corn at V3-V4 stage. ¹ ²                         │   │
│  │                                                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  RECOMMENDED ACTIONS                                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  1. Side-dress nitrogen application                                 │   │
│  │                                                                     │   │
│  │     Apply 40-60 lbs N/acre as side-dress within the next 7 days.  │   │
│  │     Best applied before V6 stage for optimal uptake. ¹             │   │
│  │                                                                     │   │
│  │     💡 Suggested Products:                                          │   │
│  │     ┌─────────────────────────────────────────────────────────┐    │   │
│  │     │  🏷️ UAN 32-0-0                                          │    │   │
│  │     │     $0.42/lb N  •  Liquid  •  Side-dress ready          │    │   │
│  │     │     [View details]                                       │    │   │
│  │     ├─────────────────────────────────────────────────────────┤    │   │
│  │     │  🏷️ Urea 46-0-0                                         │    │   │
│  │     │     $0.38/lb N  •  Granular  •  Broadcast/incorporate   │    │   │
│  │     │     [View details]                                       │    │   │
│  │     └─────────────────────────────────────────────────────────┘    │   │
│  │                                            [Compare all products →] │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  2. Confirm with soil test                                          │   │
│  │                                                                     │   │
│  │     Visual symptoms suggest N deficiency, but a soil test will     │   │
│  │     confirm levels and help calibrate exact application rate. ³    │   │
│  │                                                                     │   │
│  │     🔗 Find soil testing labs in Iowa                               │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────┐         │
│  │  Was this helpful?   [👍 Yes]   [👎 No]   [📝 Detailed feedback] │         │
│  └───────────────────────────────────────────────────────────────┘         │
│                                                                             │
│  [View sources (3)]                              [Save] [Share] [Print]    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Sources Panel (Transparency UI)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  SOURCES                                                              [×]  │
│                                                                             │
│  3 sources informed this recommendation                                     │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  [1] 🎓 UNIVERSITY EXTENSION                                        │   │
│  │                                                                     │   │
│  │  "Nitrogen Management in Corn Production"                           │   │
│  │  Iowa State University Extension and Outreach                       │   │
│  │  Published: March 2023                                              │   │
│  │                                                                     │   │
│  │  Relevant excerpt:                                                  │   │
│  │  ┌───────────────────────────────────────────────────────────────┐ │   │
│  │  │ "Nitrogen deficiency symptoms first appear on lower leaves   │ │   │
│  │  │ as a V-shaped yellowing starting at the leaf tip. As         │ │   │
│  │  │ deficiency progresses, symptoms move up the plant..."        │ │   │
│  │  └───────────────────────────────────────────────────────────────┘ │   │
│  │                                                                     │   │
│  │  [Open full document →]                                             │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  [2] 🖼️ REFERENCE IMAGE MATCH                                       │   │
│  │                                                                     │   │
│  │  ┌────────────┐  ┌────────────┐                                    │   │
│  │  │ Your image │  │ Reference  │                                    │   │
│  │  │            │  │            │                                    │   │
│  │  └────────────┘  └────────────┘                                    │   │
│  │                                                                     │   │
│  │  "Nitrogen deficiency - V4 corn"                                   │   │
│  │  Similarity score: 87%                                              │   │
│  │                                                                     │   │
│  │  Source: Purdue Corn & Soybean Field Guide                          │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  [3] 📊 REGIONAL DATA                                               │   │
│  │                                                                     │   │
│  │  "Corn Nitrogen Rate Calculator"                                    │   │
│  │  Iowa State University / MRTN                                       │   │
│  │                                                                     │   │
│  │  Based on:                                                          │   │
│  │  • Region: Iowa (North Central)                                     │   │
│  │  • Previous crop: Soybeans                                          │   │
│  │  • N price: $0.45/lb                                                │   │
│  │  • Corn price: $4.50/bu                                             │   │
│  │                                                                     │   │
│  │  Calculated EONR: 140-160 lbs N/acre total season                   │   │
│  │                                                                     │   │
│  │  [Open calculator →]                                                │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Product Comparison

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  COMPARE NITROGEN PRODUCTS                                                  │
│                                                                             │
│  Showing products for: Side-dress nitrogen • Corn • Iowa                   │
│                                                                             │
│  ┌───────────────────┬───────────────────┬───────────────────┐             │
│  │   UAN 32-0-0      │   Urea 46-0-0     │   ESN Smart N     │             │
│  ├───────────────────┼───────────────────┼───────────────────┤             │
│  │                   │                   │                   │             │
│  │   💰 $0.42/lb N   │   💰 $0.38/lb N   │   💰 $0.58/lb N   │             │
│  │                   │                   │                   │             │
│  ├───────────────────┼───────────────────┼───────────────────┤             │
│  │ Type              │ Type              │ Type              │             │
│  │ Liquid            │ Granular          │ Granular          │             │
│  ├───────────────────┼───────────────────┼───────────────────┤             │
│  │ Application       │ Application       │ Application       │             │
│  │ Spray, Inject     │ Broadcast         │ Broadcast         │             │
│  ├───────────────────┼───────────────────┼───────────────────┤             │
│  │ Release           │ Release           │ Release           │             │
│  │ Immediate         │ Fast (2-4 days)   │ Controlled        │             │
│  │                   │                   │ (60-90 days)      │             │
│  ├───────────────────┼───────────────────┼───────────────────┤             │
│  │ Volatility Risk   │ Volatility Risk   │ Volatility Risk   │             │
│  │ ⚠️ Medium         │ ⚠️ High           │ ✓ Low             │             │
│  │ (if not injected) │ (if not incorp.)  │                   │             │
│  ├───────────────────┼───────────────────┼───────────────────┤             │
│  │ Best For          │ Best For          │ Best For          │             │
│  │ Side-dress,       │ Pre-plant,        │ Single            │             │
│  │ Fertigation       │ Top-dress         │ application       │             │
│  ├───────────────────┼───────────────────┼───────────────────┤             │
│  │ Where to Buy      │ Where to Buy      │ Where to Buy      │             │
│  │ • Nutrien  $XX    │ • Nutrien  $XX    │ • Nutrien  $XX    │             │
│  │ • Helena   $XX    │ • Helena   $XX    │                   │             │
│  │ • CHS      $XX    │ • CHS      $XX    │                   │             │
│  │                   │                   │                   │             │
│  │ [View product →]  │ [View product →]  │ [View product →]  │             │
│  └───────────────────┴───────────────────┴───────────────────┘             │
│                                                                             │
│  📍 Prices shown for Iowa region • Last updated: Jan 3, 2025              │
│                                                                             │
│  [Add to comparison] [Clear all] [Save comparison]                         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Responsive Design Strategy

| Breakpoint | Layout Changes |
|------------|----------------|
| **Mobile (<640px)** | Bottom tab navigation, stacked cards, camera-first upload, swipe for comparison |
| **Tablet (640-1024px)** | Collapsible sidebar, 2-column grid, side panels |
| **Desktop (>1024px)** | Persistent sidebar, 3-column layouts, inline panels |

### State Management Strategy

| State Type | Solution | Examples |
|------------|----------|----------|
| **Server State** | TanStack Query | Recommendations, products, user data |
| **Form State** | React Hook Form | Diagnosis forms, feedback forms, settings |
| **URL State** | nuqs | Filters, pagination, comparison selections |
| **UI State** | useState | Modal open/close, accordion expand |
| **Global Client** | Zustand (if needed) | Cart for products (future) |

---

## Progressive Web App (PWA)

### PWA Features

| Feature | Implementation | User Benefit |
|---------|---------------|--------------|
| **Installable** | Web app manifest | Add to home screen on any device |
| **Offline Capable** | Service worker + cache | View past recommendations without internet |
| **Camera Access** | MediaDevices API | Take photos directly in app |
| **Push Notifications** | Web Push API | Seasonal reminders, follow-up prompts |
| **Background Sync** | Service worker | Submit feedback when back online |

### Manifest Configuration

```typescript
// app/manifest.ts
import { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'AI Agronomist Advisor',
    short_name: 'AgAdvisor',
    description: 'Diagnose crop issues and get AI-powered recommendations',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#faf6f3',
    theme_color: '#725a3a',
    orientation: 'portrait-primary',
    categories: ['agriculture', 'productivity', 'utilities'],
    icons: [
      {
        src: '/icons/icon-72x72.png',
        sizes: '72x72',
        type: 'image/png',
        purpose: 'maskable'
      },
      {
        src: '/icons/icon-96x96.png',
        sizes: '96x96',
        type: 'image/png',
        purpose: 'maskable'
      },
      {
        src: '/icons/icon-128x128.png',
        sizes: '128x128',
        type: 'image/png',
        purpose: 'maskable'
      },
      {
        src: '/icons/icon-144x144.png',
        sizes: '144x144',
        type: 'image/png',
        purpose: 'any'
      },
      {
        src: '/icons/icon-152x152.png',
        sizes: '152x152',
        type: 'image/png',
        purpose: 'any'
      },
      {
        src: '/icons/icon-192x192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any'
      },
      {
        src: '/icons/icon-384x384.png',
        sizes: '384x384',
        type: 'image/png',
        purpose: 'any'
      },
      {
        src: '/icons/icon-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any'
      }
    ],
    screenshots: [
      {
        src: '/screenshots/desktop-dashboard.png',
        sizes: '1920x1080',
        type: 'image/png',
        form_factor: 'wide',
        label: 'Dashboard view'
      },
      {
        src: '/screenshots/mobile-diagnose.png',
        sizes: '390x844',
        type: 'image/png',
        form_factor: 'narrow',
        label: 'Diagnose view'
      }
    ],
    shortcuts: [
      {
        name: 'New Diagnosis',
        short_name: 'Diagnose',
        description: 'Start a new crop diagnosis',
        url: '/diagnose',
        icons: [{ src: '/icons/diagnose-96x96.png', sizes: '96x96' }]
      },
      {
        name: 'My Recommendations',
        short_name: 'History',
        description: 'View past recommendations',
        url: '/recommendations',
        icons: [{ src: '/icons/history-96x96.png', sizes: '96x96' }]
      }
    ],
    related_applications: [],
    prefer_related_applications: false
  }
}
```

### Service Worker Strategy

```typescript
// Caching strategies by route type

const CACHE_STRATEGIES = {
  // Static assets - Cache First
  static: [
    '/icons/*',
    '/images/*',
    '/_next/static/*'
  ],
  
  // API data - Network First with cache fallback
  api: [
    '/api/recommendations/*',
    '/api/products/*',
    '/api/user/*'
  ],
  
  // Pages - Stale While Revalidate
  pages: [
    '/dashboard',
    '/recommendations',
    '/products'
  ],
  
  // Never cache
  exclude: [
    '/api/diagnose/*',    // Always needs fresh AI response
    '/api/upload/*',       // File uploads
    '/api/feedback/*'      // Feedback submissions
  ]
}
```

### Offline Capabilities

| Feature | Offline Behavior |
|---------|-----------------|
| **Dashboard** | Shows cached data with "offline" indicator |
| **Past Recommendations** | Fully viewable from cache |
| **Product Browser** | Shows cached products, search disabled |
| **New Diagnosis** | Queued for sync when online |
| **Feedback** | Queued for sync when online |
| **Settings** | Fully functional |

### Install Prompt

Custom install prompt component for better UX:

```typescript
// components/shared/install-prompt.tsx

export function InstallPrompt() {
  // Shows on:
  // - 3rd visit to app
  // - After completing first diagnosis
  // - On mobile devices not yet installed
  
  return (
    <Dialog>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Install AgAdvisor</DialogTitle>
          <DialogDescription>
            Get faster access and offline support by installing 
            the app on your device.
          </DialogDescription>
        </DialogHeader>
        
        <div className="features">
          <Feature icon="📱" text="Quick access from home screen" />
          <Feature icon="📴" text="View recommendations offline" />
          <Feature icon="📷" text="Faster photo capture" />
          <Feature icon="🔔" text="Seasonal reminders" />
        </div>
        
        <DialogFooter>
          <Button variant="ghost" onClick={dismiss}>
            Maybe later
          </Button>
          <Button onClick={install}>
            Install App
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

### Platform-Specific Notes

| Platform | Installation | Notes |
|----------|-------------|-------|
| **iOS Safari** | Share → Add to Home Screen | No push notifications, limited background sync |
| **Android Chrome** | Install prompt / Menu → Install | Full PWA support |
| **Windows Edge/Chrome** | Install prompt / Menu → Install | Full support |
| **macOS Safari** | Add to Dock (Sonoma+) | Limited compared to Chrome |
| **macOS Chrome** | Install prompt | Full support |

---

## Data Ingestion Pipeline

### Overview

The ingestion pipeline collects, processes, and indexes agricultural knowledge from authoritative sources to power the RAG system.

### Source Categories

#### 1. University Extension Guides (High Authority)

| Source | Type | Coverage |
|--------|------|----------|
| Iowa State University Extension | PDF, HTML | Corn, soybeans, general agronomy |
| Purdue Extension | PDF, HTML | Row crops, diagnostics |
| University of Minnesota Extension | PDF, HTML | Small grains, cold climate |
| UC Davis Extension | PDF, HTML | Vegetables, specialty crops |
| Texas A&M AgriLife | PDF, HTML | Cotton, sorghum, warm climate |
| University of Guelph (Ontario) | PDF, HTML | Canadian crops, cold climate |
| OMAFRA (Ontario) | PDF, HTML | Canadian regulations, practices |

#### 2. Product Manufacturers

| Type | Sources | Data Extracted |
|------|---------|----------------|
| Fertilizers | Nutrien, Mosaic, CF Industries | Analysis, rates, SDS |
| Crop Protection | Bayer, Syngenta, Corteva, BASF | Labels, rates, PHI |
| Biologicals | Pivot Bio, Indigo, Sound Ag | Application, compatibility |
| Amendments | Gypsum companies, lime producers | Rates, soil requirements |

#### 3. Agricultural Retailers

| Retailer | Data | Region |
|----------|------|--------|
| Nutrien Ag Solutions | Pricing, availability | US, Canada |
| Helena Agri-Enterprises | Pricing, availability | US |
| CHS | Pricing, availability | US Midwest |
| Federated Co-op | Pricing, availability | Canada |

#### 4. Reference Image Sources

| Source | Content | Format |
|--------|---------|--------|
| Extension diagnostic guides | Deficiency symptoms, diseases, pests | Images with captions |
| Product labels | Application examples | Images |
| Research publications | Trial photos, comparison images | Images with context |

### Pipeline Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         INGESTION PIPELINE                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │                         COLLECTION LAYER                              │ │
│  │                                                                       │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │ │
│  │  │  Extension  │  │  Product    │  │  Retailer   │  │  Image      │ │ │
│  │  │  Scraper    │  │  Scraper    │  │  Scraper    │  │  Scraper    │ │ │
│  │  │             │  │             │  │             │  │             │ │ │
│  │  │ • Playwright│  │ • Playwright│  │ • Cheerio   │  │ • Puppeteer │ │ │
│  │  │ • PDF fetch │  │ • PDF fetch │  │ • API calls │  │ • Sharp     │ │ │
│  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘ │ │
│  │         │                │                │                │        │ │
│  └─────────┼────────────────┼────────────────┼────────────────┼────────┘ │
│            │                │                │                │          │
│            ▼                ▼                ▼                ▼          │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │                         PARSING LAYER                                 │ │
│  │                                                                       │ │
│  │  ┌─────────────────────────────────────────────────────────────────┐ │ │
│  │  │                    Content Normalizer                            │ │ │
│  │  │                                                                  │ │ │
│  │  │  Input formats:     │  Output:                                   │ │ │
│  │  │  • PDF              │  • Structured text                         │ │ │
│  │  │  • HTML             │  • Extracted images                        │ │ │
│  │  │  • Images           │  • Tables as JSON                          │ │ │
│  │  │                     │  • Source metadata                         │ │ │
│  │  └─────────────────────────────────────────────────────────────────┘ │ │
│  │                                                                       │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │ │
│  │  │ pdf-parse    │  │ Cheerio      │  │ Sharp        │               │ │
│  │  │ + Camelot    │  │ + Readability│  │ + EXIF       │               │ │
│  │  └──────────────┘  └──────────────┘  └──────────────┘               │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                      │                                      │
│                                      ▼                                      │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │                         CHUNKING LAYER                                │ │
│  │                                                                       │ │
│  │  Text Chunking Strategy:                                              │ │
│  │  ┌─────────────────────────────────────────────────────────────────┐ │ │
│  │  │ • Semantic chunking (not fixed-size)                            │ │ │
│  │  │ • Target: 512-1024 tokens per chunk                             │ │ │
│  │  │ • Preserve: headers, lists, tables as units                     │ │ │
│  │  │ • Overlap: 50-100 tokens between chunks                         │ │ │
│  │  │ • Metadata: source, section, page number                        │ │ │
│  │  └─────────────────────────────────────────────────────────────────┘ │ │
│  │                                                                       │ │
│  │  Image Handling:                                                      │ │
│  │  ┌─────────────────────────────────────────────────────────────────┐ │ │
│  │  │ • Keep images whole (not chunked)                               │ │ │
│  │  │ • Link to surrounding text chunk                                │ │ │
│  │  │ • Extract alt text and captions                                 │ │ │
│  │  │ • Store in R2 with metadata                                     │ │ │
│  │  └─────────────────────────────────────────────────────────────────┘ │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                      │                                      │
│                                      ▼                                      │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │                         EMBEDDING LAYER                               │ │
│  │                                                                       │ │
│  │  ┌──────────────────────────┐  ┌──────────────────────────┐         │ │
│  │  │     Text Embeddings      │  │    Image Embeddings      │         │ │
│  │  │                          │  │                          │         │ │
│  │  │  Model: OpenAI           │  │  Model: OpenAI           │         │ │
│  │  │  text-embedding-3-small  │  │  text-embedding-3-small  │         │ │
│  │  │                          │  │                          │         │ │
│  │  │  Dimensions: 1536        │  │  Dimensions: 512         │         │ │
│  │  │  Cost: $0.02/1M tokens   │  │  Cost: ~$0.0002/image    │         │ │
│  │  └──────────────────────────┘  └──────────────────────────┘         │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                      │                                      │
│                                      ▼                                      │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │                         STORAGE LAYER                                 │ │
│  │                                                                       │ │
│  │  ┌──────────────────────────┐  ┌──────────────────────────┐         │ │
│  │  │     Supabase pgvector    │  │     Cloudflare R2        │         │ │
│  │  │                          │  │                          │         │ │
│  │  │  • text_chunks table     │  │  • Reference images      │         │ │
│  │  │  • image_chunks table    │  │  • Product images        │         │ │
│  │  │  • sources table         │  │  • Ingested PDFs         │         │ │
│  │  │  • products table        │  │                          │         │ │
│  │  └──────────────────────────┘  └──────────────────────────┘         │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Scheduling

| Job | Frequency | Purpose |
|-----|-----------|---------|
| Full ingestion | Weekly | Refresh all extension content |
| Price update | Daily | Update product prices |
| New source check | Weekly | Scan for new publications |
| Image refresh | Monthly | Update product/reference images |
| Validation | Weekly | Check for broken sources |

### Scraping Ethics

**Rules followed:**

1. Respect `robots.txt` directives
2. Do not scrape sources that explicitly prohibit scraping in ToS
3. Rate limit requests (1 request/second minimum)
4. Identify scraper with descriptive User-Agent
5. Cache responses to avoid repeated requests
6. Prefer official APIs when available

**Excluded sources:**

- Sites with explicit scraping prohibitions
- Paywalled content
- User-generated content without clear licensing

---

## AI Agent System

### Agent Architecture

The AI layer uses explicit agent roles rather than a single monolithic prompt. Each agent has defined inputs, outputs, and constraints.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           AGENT SYSTEM                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    RECOMMENDATION AGENT                              │   │
│  │                                                                      │   │
│  │  Role: Generate structured recommendations from inputs + context     │   │
│  │  Model: Claude 3.5 Sonnet                                           │   │
│  │                                                                      │   │
│  │  Inputs:                                                             │   │
│  │  • Normalized user input (symptoms, lab data, location, crop)       │   │
│  │  • Retrieved context (text chunks + image references)               │   │
│  │  • User profile (location, typical crops, farm size)                │   │
│  │                                                                      │   │
│  │  Outputs:                                                            │   │
│  │  • Diagnosis (condition identified, confidence, reasoning)          │   │
│  │  • Recommendations (actions, products, timing)                      │   │
│  │  • Citations (which context chunks support each claim)              │   │
│  │                                                                      │   │
│  │  Constraints:                                                        │   │
│  │  • Must cite sources for factual claims                             │   │
│  │  • Cannot recommend products not in knowledge base                  │   │
│  │  • Must express uncertainty when confidence is low                  │   │
│  │  • Output must match Zod schema                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                      │                                      │
│                                      ▼                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    RETRIEVAL CRITIC AGENT                            │   │
│  │                                                                      │   │
│  │  Role: Assess retrieved context quality before recommendation        │   │
│  │  Model: GPT-4o-mini (fast, cheap)                                   │   │
│  │                                                                      │   │
│  │  Inputs:                                                             │   │
│  │  • User query (normalized)                                          │   │
│  │  • Retrieved chunks (top-K from vector search)                      │   │
│  │                                                                      │   │
│  │  Outputs:                                                            │   │
│  │  • Relevance scores for each chunk (0-1)                            │   │
│  │  • Reranked chunk order                                             │   │
│  │  • Coverage assessment (are key aspects addressed?)                 │   │
│  │  • Gaps identified (what's missing?)                                │   │
│  │                                                                      │   │
│  │  Constraints:                                                        │   │
│  │  • Cannot modify chunks, only score and reorder                     │   │
│  │  • Must flag if context is insufficient                             │   │
│  │  • Output must match Zod schema                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                      │                                      │
│                                      ▼                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    OUTPUT AUDIT AGENT                                │   │
│  │                                                                      │   │
│  │  Role: Validate recommendation quality and compliance                │   │
│  │  Model: GPT-4o-mini (fast, cheap)                                   │   │
│  │                                                                      │   │
│  │  Inputs:                                                             │   │
│  │  • Generated recommendation                                         │   │
│  │  • Retrieved context (for citation verification)                    │   │
│  │  • Validation rules                                                 │   │
│  │                                                                      │   │
│  │  Outputs:                                                            │   │
│  │  • Valid (boolean)                                                  │   │
│  │  • Issues found (list)                                              │   │
│  │  • Suggested fixes (if invalid)                                     │   │
│  │                                                                      │   │
│  │  Checks:                                                             │   │
│  │  • All citations reference real chunks                              │   │
│  │  • Product recommendations exist in database                        │   │
│  │  • Application rates are within safe ranges                         │   │
│  │  • No contradictory recommendations                                 │   │
│  │  • Confidence matches evidence quality                              │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Validation & Retry Logic

```typescript
// lib/validation/retry.ts

const MAX_ATTEMPTS = 2;

async function generateWithRetry(input: NormalizedInput, context: RetrievedContext) {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    // Generate recommendation
    const recommendation = await recommendationAgent.generate(input, context);
    
    // Validate schema
    const schemaResult = RecommendationSchema.safeParse(recommendation);
    if (!schemaResult.success) {
      if (attempt === MAX_ATTEMPTS) {
        throw new ValidationError('Schema validation failed', schemaResult.error);
      }
      continue;
    }
    
    // Audit output
    const auditResult = await outputAuditAgent.audit(recommendation, context);
    if (!auditResult.valid) {
      if (attempt === MAX_ATTEMPTS) {
        throw new ValidationError('Audit failed', auditResult.issues);
      }
      // Provide feedback for retry
      input.retryFeedback = auditResult.suggestedFixes;
      continue;
    }
    
    return schemaResult.data;
  }
}
```

### Output Schema

```typescript
// lib/validation/schemas.ts

import { z } from 'zod';

export const DiagnosisSchema = z.object({
  condition: z.string(),
  conditionType: z.enum(['deficiency', 'disease', 'pest', 'environmental', 'unknown']),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
  differentialDiagnoses: z.array(z.object({
    condition: z.string(),
    likelihood: z.number().min(0).max(1),
  })).optional(),
});

export const ActionItemSchema = z.object({
  action: z.string(),
  priority: z.enum(['immediate', 'soon', 'when_convenient']),
  timing: z.string().optional(),
  details: z.string(),
  citations: z.array(z.string()), // chunk IDs
});

export const ProductSuggestionSchema = z.object({
  productId: z.string(),
  reason: z.string(),
  applicationRate: z.string().optional(),
  alternatives: z.array(z.string()).optional(), // product IDs
});

export const RecommendationSchema = z.object({
  diagnosis: DiagnosisSchema,
  recommendations: z.array(ActionItemSchema).min(1).max(5),
  products: z.array(ProductSuggestionSchema).max(6),
  sources: z.array(z.object({
    chunkId: z.string(),
    relevance: z.number().min(0).max(1),
    excerpt: z.string().max(500),
  })),
  confidence: z.number().min(0).max(1),
  caveats: z.array(z.string()).optional(),
});
```

---

## Feedback Loop System

### Overview

The feedback system enables continuous improvement through user ratings, outcome reporting, and automated analysis.

### Feedback Types

| Type | Trigger | Data Collected |
|------|---------|----------------|
| **Quick Feedback** | Immediately after recommendation | Helpful (yes/no) |
| **Detailed Feedback** | User-initiated | Rating (1-5), accuracy (1-5), comments |
| **Outcome Report** | Follow-up prompt (7-14 days later) | Did it work?, What happened?, Photos |

### Feedback Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         FEEDBACK LOOP SYSTEM                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │                      COLLECTION                                       │ │
│  │                                                                       │ │
│  │  User Action                    Data Stored                           │ │
│  │  ────────────                   ────────────                          │ │
│  │  👍/👎 quick feedback    →     helpful: boolean                       │ │
│  │  ⭐ rating               →     rating: 1-5                            │ │
│  │  📝 detailed form        →     accuracy, comments                     │ │
│  │  📸 outcome report       →     outcome_notes, follow_up_image         │ │
│  │                                                                       │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                      │                                      │
│                                      ▼                                      │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │                      ANALYSIS (Weekly Job)                            │ │
│  │                                                                       │ │
│  │  ┌─────────────────────────────────────────────────────────────────┐ │ │
│  │  │ 1. Identify Low-Performing Recommendations                      │ │ │
│  │  │                                                                 │ │ │
│  │  │    SELECT recommendation_id, AVG(rating) as avg_rating          │ │ │
│  │  │    FROM feedback                                                │ │ │
│  │  │    GROUP BY recommendation_id                                   │ │ │
│  │  │    HAVING AVG(rating) < 3.0                                     │ │ │
│  │  └─────────────────────────────────────────────────────────────────┘ │ │
│  │                                                                       │ │
│  │  ┌─────────────────────────────────────────────────────────────────┐ │ │
│  │  │ 2. Cluster Failure Patterns                                     │ │ │
│  │  │                                                                 │ │ │
│  │  │    Group low-rated recommendations by:                          │ │ │
│  │  │    • Crop type                                                  │ │ │
│  │  │    • Condition type (deficiency, disease, etc.)                │ │ │
│  │  │    • Region                                                     │ │ │
│  │  │    • Input type (photo vs lab)                                  │ │ │
│  │  └─────────────────────────────────────────────────────────────────┘ │ │
│  │                                                                       │ │
│  │  ┌─────────────────────────────────────────────────────────────────┐ │ │
│  │  │ 3. Surface Retrieval Gaps                                       │ │ │
│  │  │                                                                 │ │ │
│  │  │    Identify queries where:                                      │ │ │
│  │  │    • Retrieved context had low relevance scores                │ │ │
│  │  │    • Retrieval critic flagged coverage gaps                    │ │ │
│  │  │    • User reported "information was missing"                   │ │ │
│  │  └─────────────────────────────────────────────────────────────────┘ │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                      │                                      │
│                                      ▼                                      │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │                      IMPROVEMENT ACTIONS                              │ │
│  │                                                                       │ │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐      │ │
│  │  │ Prompt Tuning   │  │ Retrieval       │  │ Data Ingestion  │      │ │
│  │  │                 │  │ Optimization    │  │                 │      │ │
│  │  │ • A/B test new  │  │ • Adjust chunk  │  │ • Add missing   │      │ │
│  │  │   prompts       │  │   weights       │  │   sources       │      │ │
│  │  │ • Version       │  │ • Improve       │  │ • Fill coverage │      │ │
│  │  │   control       │  │   reranking     │  │   gaps          │      │ │
│  │  │ • Track metrics │  │ • Add metadata  │  │ • Update stale  │      │ │
│  │  │   per version   │  │   filters       │  │   content       │      │ │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘      │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                      │                                      │
│                                      ▼                                      │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │                      MONITORING DASHBOARD                             │ │
│  │                                                                       │ │
│  │  Metrics Tracked:                                                     │ │
│  │  • Average rating over time                                          │ │
│  │  • Helpful rate (% positive quick feedback)                          │ │
│  │  • Outcome success rate (from follow-ups)                            │ │
│  │  • Rating by category (crop, condition, region)                      │ │
│  │  • Prompt version performance comparison                             │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### User History Integration

Past interactions inform new recommendations:

```typescript
// When generating recommendations, include relevant history

const userHistory = await getUserHistory(userId, {
  limit: 5,
  crops: input.crop,  // Same crop
  recent: true,       // Last 90 days
});

// Included in prompt context:
// - Previous diagnoses for same crop
// - What worked / didn't work (from outcomes)
// - User's typical issues (pattern detection)
```

---

## API Reference

### Endpoints Overview

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/diagnose/analyze-image` | Analyze uploaded image |
| POST | `/api/diagnose/parse-lab` | Parse lab report data |
| POST | `/api/recommendations` | Generate recommendation |
| GET | `/api/recommendations/[id]` | Get single recommendation |
| GET | `/api/recommendations` | List user's recommendations |
| GET | `/api/products` | Search products |
| GET | `/api/products/[id]` | Get product details |
| POST | `/api/products/compare` | Compare products |
| POST | `/api/feedback` | Submit feedback |
| POST | `/api/upload` | Upload image |
| GET | `/api/user/profile` | Get user profile |
| PATCH | `/api/user/profile` | Update user profile |

### Request/Response Examples

#### Generate Recommendation

```typescript
// POST /api/recommendations

// Request
{
  "inputType": "photo",
  "imageUrl": "https://...",
  "description": "Yellowing on lower corn leaves, about V4 stage",
  "crop": "corn",
  "location": {
    "state": "IA",
    "country": "US"
  },
  "season": "V4"
}

// Response
{
  "id": "rec_abc123",
  "diagnosis": {
    "condition": "Nitrogen Deficiency",
    "conditionType": "deficiency",
    "confidence": 0.87,
    "reasoning": "The V-shaped yellowing pattern on lower leaves..."
  },
  "recommendations": [
    {
      "action": "Apply side-dress nitrogen",
      "priority": "immediate",
      "timing": "Within 7 days, before V6",
      "details": "Apply 40-60 lbs N/acre...",
      "citations": ["chunk_123", "chunk_456"]
    }
  ],
  "products": [
    {
      "productId": "prod_uan32",
      "reason": "Liquid form ideal for side-dress application",
      "applicationRate": "10-15 gal/acre",
      "alternatives": ["prod_urea46"]
    }
  ],
  "sources": [
    {
      "chunkId": "chunk_123",
      "title": "Nitrogen Management in Corn",
      "publisher": "Iowa State Extension",
      "relevance": 0.92,
      "excerpt": "Lower leaf yellowing..."
    }
  ],
  "confidence": 0.87,
  "createdAt": "2025-01-05T..."
}
```

#### Search Products

```typescript
// GET /api/products?type=fertilizer&nutrient=nitrogen&region=IA

// Response
{
  "products": [
    {
      "id": "prod_uan32",
      "name": "UAN 32-0-0",
      "brand": "Various",
      "type": "fertilizer",
      "analysis": { "N": 32, "P": 0, "K": 0 },
      "prices": [
        {
          "retailer": "Nutrien",
          "price": 0.42,
          "unit": "per lb N",
          "url": "https://...",
          "inStock": true,
          "lastUpdated": "2025-01-03T..."
        }
      ]
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 45
  }
}
```

---

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

### Visual Timeline
```
WEEK 1                 WEEK 2                 WEEK 3                 WEEK 4
──────────────────────────────────────────────────────────────────────────────
│ S1: Setup      │ S4: Input UI     │ S7: RAG Engine   │ S10: Feedback   │
│ S2: DB + Auth  │ S5: Ingestion 1  │ S8: Results UI   │ S11: PWA        │
│ S3: UI Shell   │ S6: Ingestion 2  │ S9: Products     │ S12: Launch     │
──────────────────────────────────────────────────────────────────────────────
        ↓                  ↓                  ↓                  ↓
   [Deployable       [Knowledge        [Full flow         [Production
    shell]            base live]        working]           MVP]
```

### Post-MVP Enhancements

After the initial 4-week MVP, potential enhancements include:

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

## Acknowledgments

- University extension services across North America for their invaluable agricultural research
- The open-source community for the amazing tools that make this possible
- Early beta testers who provided feedback

---

**Built with 🌱 for farmers**
