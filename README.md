# 🌱 AI Agronomist Advisor
*A full-stack AI system for generating crop-specific recommendations from soil test data.*

---

## 🌟 Overview

**AI Agronomist Advisor** is an in-progress full-stack application designed to help agronomists and crop advisors turn soil test data into actionable, structured recommendations.

The system will use:

- **LLMs** (OpenAI / Claude)  
- **RAG (Retrieval-Augmented Generation)**  
- **Vector search using pgvector**  
- **Next.js** for the frontend  
- **NestJS** for the backend  

This project aims to demonstrate modern **AI product engineering** patterns, combining domain knowledge with robust, reliable AI workflows.

---

## 🏗️ Repository Structure

- /frontend       – Next.js client (planned)
- /backend        – NestJS API + recommendation + retrieval services (planned)
- /ingestion      – Document ingestion + embedding pipeline (planned)
- /docs           – Architecture diagrams, specs, and project documentation

This structure will expand as features are implemented.

---

## 🧩 Feature Stories (GitHub Issues)

Development is tracked using **GitHub Issues** following feature-story style specs with acceptance criteria.

Planned issues include:

- **Feature: Soil Test → Recommendation Flow (MVP)**  
  → Issue #1  

- **Feature: Document Ingestion → Chunking → Embeddings → pgvector**  
  → Issue #2

- **Feature: Retrieved Context Viewer (Transparency UI)**  
  → Issue #3

- **Feature: LLM Output Guardrails + Zod Validation + Retry Logic**  
  → Issue #4

- **Chore: Create Initial Architecture Diagram (v0.1)**  
  → Issue #5 

## 🧱 Architecture (In Progress)

A full architecture diagram is being developed and will live under: /docs/architecture/architecture-v0.png

The initial architecture will represent:

- Next.js client  
- NestJS API  
- Ingestion pipeline  
- Retrieval (pgvector)  
- LLM wrapper (structured JSON outputs + guardrails)  
- Logging + persistence  

Planned Issue: **Chore: Add Architecture Diagram (v0.1)** → #[TODO_ISSUE_ID]

---

## 🚧 Current Status

The project is in its **initial setup** phase.

Upcoming milestones:

- [ ] Backend scaffolding (NestJS + Prisma + PostgreSQL)  
- [ ] Soil test input UI (Next.js + shadcn/ui)  
- [ ] LLM wrapper with schema validation (Zod)  
- [ ] Basic RAG pipeline powered by pgvector  
- [ ] Context viewer for retrieved passages  
- [ ] Guardrails + retry logic for stable structured outputs  

Progress will be tracked publicly through Issues and linked Pull Requests.

---

## 🎯 Project Goals

- Build an AI system capable of generating **accurate, structured agricultural recommendations**  
- Implement practical **retrieval-augmented generation** grounded in domain data  
- Showcase modern **AI product engineering** skills end-to-end  
- Demonstrate clean architecture, reliability patterns, and transparent AI UX  

---

## 🧰 Tech Stack (Planned)

### **Frontend**
- Next.js  
- React  
- TypeScript  
- shadcn/ui  

### **Backend**
- NestJS  
- Node.js  
- Prisma  
- PostgreSQL + pgvector  

### **AI Systems**
- OpenAI (GPT-4.1 / GPT-4o)  
- Anthropic Claude  
- LangChain  
- Zod (schema validation)  

### **Infrastructure**
- Vercel (frontend)  
- Render / Fly.io (backend)  
- Neon.tech / Supabase (database)  
