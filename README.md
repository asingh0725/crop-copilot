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

- **Multi-modal inputs**: photo with text description, or lab data.
- **Research-grounded recommendations** with citations and confidence indicators.
- **Product guidance** with pricing, application rates, and purchase links.
- **Feedback loop** to improve recommendations based on outcomes.
- **PWA-ready** for installable, offline-capable field use.

---

## How It Works (Short Version)

1. **Input**: Users submit a photo with description, or lab results.
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

# Manual Feedback Testing Plan

## Overview

After implementing the feedback system (Session 10), conduct systematic expert testing by generating 100 diverse recommendations and providing agronomic feedback to jump-start the continuous improvement loop.

---

## Testing Strategy

### Timeline: 4 Weeks

| Week | Activity | Goal |
|------|----------|------|
| **Week 1** | Generate 100 diverse recommendations | Establish baseline across crops/regions/scenarios |
| **Week 2** | Provide expert feedback on all 100 | Collect quality ratings and detailed comments |
| **Week 3** | Run analysis & update prompt | Identify patterns and generate learnings |
| **Week 4** | Test improvements | Measure quality improvement vs baseline |

---

## Week 1: Generate 100 Diverse Recommendations

### Coverage Matrix

| Category | Crops | Regions | Scenarios | Count |
|----------|-------|---------|-----------|-------|
| **Nitrogen Deficiency** | Corn, Soybeans, Wheat | Midwest, South, West | Early/Mid/Late season | 12 |
| **Phosphorus Deficiency** | Corn, Soybeans, Tomatoes | Midwest, Southeast | Seedling/Vegetative | 8 |
| **Potassium Deficiency** | Corn, Soybeans, Cotton | Midwest, Southeast | Reproductive stage | 8 |
| **Micronutrients** | Various | Various | Zn, Fe, Mn, B deficiencies | 12 |
| **Fungal Diseases** | Corn, Soybeans, Wheat | Midwest, Southeast | Early/Late season | 15 |
| **Bacterial/Viral** | Tomatoes, Peppers, Cucurbits | Various | Growing season | 8 |
| **Insects** | Corn, Soybeans, Cotton | Midwest, Southeast, South | Various life stages | 12 |
| **Abiotic Stress** | Various | Various | Drought, heat, cold, hail | 10 |
| **Edge Cases** | Various | Various | Multiple issues, unclear | 15 |
| **TOTAL** | | | | **100** |

### Sample Test Cases

#### Nutrient Deficiencies (40 recommendations)

**Nitrogen:**
- Corn V4-V6 stage, Midwest (Iowa)
- Soybeans V3-V5 stage, Southeast (Georgia)
- Wheat tillering stage, Great Plains (Kansas)

**Phosphorus:**
- Corn seedling, Midwest (Illinois)
- Soybeans early vegetative, Southeast (North Carolina)
- Tomatoes transplant, California

**Potassium:**
- Corn reproductive, Midwest (Indiana)
- Soybeans R3-R5, Southeast (Mississippi)
- Cotton flowering, Texas

**Micronutrients:**
- Zinc deficiency in corn (Midwest)
- Iron chlorosis in soybeans (Midwest, high pH soils)
- Manganese deficiency in wheat (Southeast, sandy soils)
- Boron deficiency in alfalfa (Western states)

#### Diseases (30 recommendations)

**Fungal:**
- Gray leaf spot in corn (Midwest, late season)
- White mold in soybeans (Midwest, wet conditions)
- Stripe rust in wheat (Pacific Northwest)
- Fusarium head blight in wheat (Midwest)
- Anthracnose in strawberries (Southeast)

**Bacterial:**
- Bacterial blight in soybeans (Midwest)
- Fire blight in apples (Northeast)

**Viral:**
- Soybean mosaic virus (Midwest)
- Tomato spotted wilt virus (Southeast vegetables)

#### Pests (20 recommendations)

**Insects:**
- Soybean aphid (Midwest, late vegetative)
- Corn rootworm (Midwest, V5-V8 injury)
- Fall armyworm in corn (Southeast, whorl stage)
- Japanese beetle in soybeans (Midwest, R1-R3)
- Cotton bollworm (Southeast, reproductive)

**Mites:**
- Spider mites in soybeans (Midwest, drought stress)

#### Abiotic Stress (10 recommendations)

- Drought stress in corn (Midwest, tasseling)
- Heat stress in wheat (Great Plains, grain fill)
- Cold injury in soybeans (Midwest, early season)
- Hail damage in corn (Midwest, V8-V10)

---

## Week 2: Expert Feedback Protocol

### For Each Recommendation, Provide:

#### 1. Quick Feedback
- [ ] Thumbs up (helpful) or thumbs down (not helpful)

#### 2. Detailed Ratings

**Overall Rating (1-5 stars):**
- ⭐ = Poor - Would not recommend to farmers
- ⭐⭐ = Fair - Major issues but some useful info
- ⭐⭐⭐ = Good - Acceptable but needs improvement
- ⭐⭐⭐⭐ = Very Good - Would recommend with minor tweaks
- ⭐⭐⭐⭐⭐ = Excellent - Professional quality, ready to use

**Diagnosis Accuracy (1-5 stars):**
- ⭐ = Wrong diagnosis
- ⭐⭐ = Partially correct but missing key factors
- ⭐⭐⭐ = Correct but could be more specific
- ⭐⭐⭐⭐ = Accurate with good differential diagnosis
- ⭐⭐⭐⭐⭐ = Perfect diagnosis with all relevant details

#### 3. Detailed Comments Template
```markdown
RECOMMENDATION ID: rec_abc123
DIAGNOSIS: Nitrogen deficiency in corn, V6 stage

RATING: ⭐⭐⭐⭐ (4/5)
ACCURACY: ⭐⭐⭐⭐⭐ (5/5)

WHAT WAS GOOD:
✅ Correctly identified N deficiency from V-shaped chlorosis
✅ Appropriate timing (before V8)
✅ Recommended side-dress application (correct method)
✅ Rate of 50 lbs N/acre is appropriate for this stage

WHAT WAS WRONG/MISSING:
❌ Didn't mention soil testing to confirm diagnosis
❌ Should recommend split application (30 lbs now, 20 lbs at V10)
⚠️  Product suggestion (UAN 32-0-0) is good but should also mention 
    ESN for controlled release in sandy soils

WOULD I RECOMMEND THIS TO A FARMER? Yes, with minor tweaks

OUTCOME SIMULATION:
If applied: Would likely see greening in 5-7 days, yield impact +15-20 bu/acre
```

#### 4. Check Applicable Issues

Select all that apply:
- [ ] Diagnosis was incorrect
- [ ] Recommendations not practical
- [ ] Suggested products not available
- [ ] Timing was wrong
- [ ] Missing important information
- [ ] Other (describe in comments)

#### 5. Simulate Outcome (Optional)

**Applied:** Yes / No

**Success:** Yes / Partially / No

**Outcome Notes:**
```
Applied UAN 32-0-0 at 50 lbs N/acre on June 15. Corn greened up within 
7 days. Yield estimate improved by 15-20 bu/acre. Farmer satisfied but 
wished they had applied 2 weeks earlier.
```

---

## Week 3: Run Analysis & Generate Improvements

### Step 1: Run Weekly Analysis Script
```bash
npx tsx scripts/analyze-feedback.ts
```

### Step 2: Review Console Output

The script will generate:

**Low-Performing Patterns:**
```
=== LOW-PERFORMING PATTERNS ===

Iron chlorosis in soybeans
  Average Rating: 2.8/5 (15 feedbacks)
  Common Issues:
    - diagnosis_wrong: 8 times
    - missing_info: 6 times
  Example Comment: "Recommended foliar iron but soil pH was the real issue..."

Gray leaf spot timing in corn
  Average Rating: 3.1/5 (8 feedbacks)
  Common Issues:
    - timing_off: 5 times
  Example Comment: "Fungicide recommendation too late in season..."
```

**High-Performing Patterns:**
```
=== HIGH-PERFORMING PATTERNS ===

Nitrogen deficiency in corn
  Average Rating: 4.6/5 (50 feedbacks)

Soybean aphid management
  Average Rating: 4.4/5 (25 feedbacks)
```

**Generated Learnings:**
```
=== GENERATED LEARNINGS ===

1. For iron chlorosis in soybeans: Add differential diagnosis step to check 
   soil pH before recommending foliar iron
2. For gray leaf spot in corn: Emphasize timing urgency and specific growth 
   stage windows (apply before R2)
3. SUCCESSFUL PATTERN: Nitrogen deficiency in corn - Use similar approach to 
   past high-rated recommendations
```

### Step 3: Review New Prompt Template

Check database for new prompt version:
```sql
SELECT version, name, learnings, created_at 
FROM "PromptTemplate" 
ORDER BY created_at DESC 
LIMIT 1;
```

---

## Week 4: Test Improvements

### Generate Test Set (20 recommendations)

Create 20 new recommendations covering the same categories as Week 1, but focusing on:
- Diagnoses that performed poorly in Week 1
- Diagnoses that performed well (to ensure no regression)

### Compare Performance

| Metric | Week 1 Baseline | Week 4 (Post-Update) | Improvement |
|--------|----------------|----------------------|-------------|
| Average Overall Rating | 3.5/5 | **4.1/5** | +17% |
| Average Accuracy Rating | 3.8/5 | **4.3/5** | +13% |
| Helpful Rate | 65% | **78%** | +13% |
| Issues Reported | 45% | **28%** | -17% |

**Target:** 15-20% improvement in average ratings

---

## Tracking Your Progress

### Create a Testing Spreadsheet

| Rec ID | Crop | Diagnosis | Region | Overall | Accuracy | Issues | Comments | Outcome |
|--------|------|-----------|--------|---------|----------|--------|----------|---------|
| rec_001 | Corn | N Deficiency | IA | 4 | 5 | timing_off | "Should emphasize urgency..." | Applied, worked |
| rec_002 | Soybeans | Gray Leaf Spot | IL | 5 | 5 | - | "Excellent timing..." | Applied, worked |
| rec_003 | Wheat | Stripe Rust | WA | 3 | 4 | products_unavailable | "Recommended fungicide not..." | Not applied |

### Summary Statistics to Track

**After 25 recommendations:**
- Average Overall Rating: ?/5
- Average Accuracy: ?/5
- Helpful Rate: ?%
- Most Common Issue: ?

**After 50 recommendations:**
- Update statistics
- Run preliminary analysis
- Identify early patterns

**After 100 recommendations:**
- Final statistics
- Run full analysis
- Generate learnings
- Update prompt template

---

## Expected Outcomes

### Before Expert Feedback (Baseline)
```
Average Recommendation Quality (estimated):
├─ Diagnosis Accuracy: 75%
├─ Recommendation Appropriateness: 70%
├─ Practical Applicability: 65%
└─ Product Suggestions: 60%
```

### After 100 Expert Feedbacks + Prompt Update
```
Average Recommendation Quality (target):
├─ Diagnosis Accuracy: 85% (+10%)
├─ Recommendation Appropriateness: 82% (+12%)
├─ Practical Applicability: 78% (+13%)
└─ Product Suggestions: 75% (+15%)
```

### Long-Term Impact

**Month 1:**
- 100 expert feedbacks collected
- First prompt update deployed
- 15-20% quality improvement measured

**Month 2:**
- Continue collecting real user feedback
- Second prompt update based on combined expert + user data
- 25-30% total improvement from baseline

**Month 3+:**
- Continuous improvement loop active
- Quality plateau at 85-90% of ideal agronomic recommendations
- System learns edge cases and regional variations

---

## Tips for Effective Feedback

### Be Specific in Comments

❌ **Bad:** "This is wrong"
✅ **Good:** "Diagnosis is correct but application rate of 80 lbs N/acre is too high for V6 corn. Should be 50-60 lbs."

### Focus on Actionable Issues

❌ **Bad:** "I don't like this"
✅ **Good:** "Missing soil testing recommendation which is critical for confirming micronutrient deficiencies"

### Simulate Real Farmer Decisions

Ask yourself:
- Would I recommend this to a farmer client?
- What would they ask me after reading this?
- What critical information is missing?
- Is this practical given typical farm operations?

### Provide Outcome Context

Instead of just "Applied: Yes, Worked: Yes", write:
```
Applied UAN 32-0-0 at 50 lbs N/acre on June 15 to 40-acre field. 
Visual response (greening) observed within 5-7 days. At harvest, 
yield was 180 bu/acre vs 160 bu/acre in untreated check strip. 
Cost: $20/acre, return: $80/acre at $4/bu corn. Farmer very satisfied.
```

---

## Automation Opportunities

### After Manual Testing is Complete

Consider automating feedback collection:

**Email Follow-ups:**
- 3 days after recommendation: "Was this helpful?"
- 14 days after recommendation: "How did it go? Report outcome"

**In-App Notifications:**
- Remind users to provide feedback
- Highlight recommendations needing outcome reports

**Batch Analysis:**
- Run `analyze-feedback.ts` weekly via cron job
- Email summary report to admin
- Auto-flag critical issues

---

## Quality Gates

Before considering testing complete, verify:

- [ ] At least 80 of 100 recommendations have detailed feedback
- [ ] At least 40 recommendations have simulated outcomes
- [ ] All major crops represented (corn, soybeans, wheat minimum)
- [ ] All regions represented (Midwest, Southeast, West minimum)
- [ ] All diagnosis types represented (deficiency, disease, pest minimum)
- [ ] Analysis script runs successfully
- [ ] Learnings generated make agronomic sense
- [ ] New prompt template created
- [ ] Test set shows measurable improvement (>10%)

---

## Appendix: Example Test Cases

### Example 1: High-Quality Recommendation (5 stars)

**Input:**
- Crop: Corn
- Description: "Yellowing on lower leaves starting at tips, V-shaped pattern, midribs still green, at V6 stage"
- Region: Iowa
- Image: [Photo showing classic N deficiency]

**Expected Excellent Recommendation:**
```
DIAGNOSIS: Nitrogen Deficiency (Confidence: 92%)
- V-shaped yellowing starting at leaf tips
- Lower leaves affected first (mobile nutrient)
- Midribs remain green longer

RECOMMENDATIONS:
1. Side-dress nitrogen application (Priority: Immediate)
   - Apply 50-60 lbs N/acre within 5-7 days
   - Options: UAN 32-0-0 or Urea 46-0-0
   - Apply before V8 for maximum recovery
   
2. Confirm with soil test
   - Submit 0-8" and 8-24" samples
   - Check residual N levels
   
3. Consider split application
   - 40 lbs N/acre now
   - 20 lbs at V10 if needed

PRODUCTS:
- UAN 32-0-0: Liquid, ideal for side-dress injection
- Urea 46-0-0: Granular, incorporate to prevent volatilization
```

**Feedback:**
- Overall: ⭐⭐⭐⭐⭐
- Accuracy: ⭐⭐⭐⭐⭐
- Comments: "Excellent. Correct diagnosis, appropriate rates, good timing, mentions soil testing. This is professional-grade advice."

### Example 2: Poor Recommendation (2 stars)

**Input:**
- Crop: Soybeans
- Description: "Yellowing on upper leaves, between veins, at V4 stage"
- Region: Iowa
- Image: [Photo showing interveinal chlorosis on new growth]

**Poor Recommendation:**
```
DIAGNOSIS: Nitrogen Deficiency (Confidence: 78%)
- Yellowing visible on leaves

RECOMMENDATIONS:
1. Apply nitrogen fertilizer
   - Apply 30-40 lbs N/acre
   
PRODUCTS:
- Urea 46-0-0
```

**Feedback:**
- Overall: ⭐⭐
- Accuracy: ⭐
- Issues: diagnosis_wrong, missing_info
- Comments: "Diagnosis is wrong. Yellowing on UPPER leaves indicates immobile nutrient (likely iron or manganese), not nitrogen. For soybeans, N application rarely needed due to biological fixation. Missing differential diagnosis, soil pH consideration, and appropriate micronutrient recommendations."

**Learnings Generated:**
```
For yellowing in soybeans: ALWAYS check if symptoms are on upper (new growth) 
or lower (old growth) leaves. Upper leaf chlorosis indicates immobile nutrients 
(Fe, Mn, Zn) not nitrogen. Check soil pH before recommending.
```

---

## Success Metrics

Track these KPIs throughout the testing period:

| KPI | Target | How to Measure |
|-----|--------|----------------|
| **Feedback Completion Rate** | 80%+ | Feedbacks submitted / Recommendations generated |
| **Average Overall Rating** | 4.0+/5 | Mean of all overall ratings |
| **Average Accuracy Rating** | 4.2+/5 | Mean of all accuracy ratings |
| **Issue Rate** | <30% | Recommendations with issues flagged |
| **Outcome Success Rate** | 70%+ | Successful outcomes / Total outcomes reported |
| **Week 4 Improvement** | +15% | (Week 4 avg - Week 1 avg) / Week 1 avg |

---

## Timeline Checklist

### Week 1: Generation
- [ ] Day 1-2: Generate 30 nutrient deficiency recommendations
- [ ] Day 3-4: Generate 30 disease recommendations
- [ ] Day 5-6: Generate 20 pest recommendations
- [ ] Day 7: Generate 20 abiotic stress + edge case recommendations

### Week 2: Feedback
- [ ] Day 1-3: Provide feedback on first 50 recommendations
- [ ] Day 4-6: Provide feedback on next 40 recommendations
- [ ] Day 7: Provide feedback on final 10 + simulate outcomes

### Week 3: Analysis
- [ ] Day 1: Run analysis script, review patterns
- [ ] Day 2-3: Review generated learnings, validate agronomically
- [ ] Day 4-5: Update prompt template with learnings
- [ ] Day 6-7: Prepare test set for Week 4

### Week 4: Validation
- [ ] Day 1-3: Generate 20 test recommendations with updated prompt
- [ ] Day 4-5: Provide feedback on test set
- [ ] Day 6: Calculate improvement metrics
- [ ] Day 7: Document results, plan next iteration

---

## Questions to Answer During Testing

1. **Which diagnosis types perform best?**
   - Are nutrient deficiencies more accurate than disease diagnoses?
   - Do certain crops get better recommendations than others?

2. **What are the most common failure modes?**
   - Wrong diagnosis?
   - Correct diagnosis but impractical recommendations?
   - Missing critical information?
   - Poor product suggestions?

3. **Does confidence score correlate with quality?**
   - Do high-confidence recommendations (>0.9) actually rate higher?
   - Are low-confidence recommendations (<0.7) less helpful?

4. **What knowledge gaps exist?**
   - Which topics consistently produce poor recommendations?
   - What content needs to be added to the knowledge base?

5. **How well do product recommendations work?**
   - Are suggested products actually available?
   - Are application rates appropriate?
   - Do alternatives make sense?

---

## Post-Testing Actions

After completing the 4-week testing cycle:

### 1. Document Key Findings
Create a summary report:
```markdown
# Expert Feedback Testing Results - [Date]

## Summary
- Total Recommendations: 100
- Total Feedbacks: 95
- Average Overall Rating: 4.1/5 (+17% from estimated baseline)
- Average Accuracy: 4.3/5

## Top Performers
1. Nitrogen deficiency in corn: 4.7/5 avg
2. Soybean aphid management: 4.5/5 avg
3. Gray leaf spot in corn: 4.4/5 avg

## Needs Improvement
1. Iron chlorosis in soybeans: 2.8/5 avg
   - Issue: Missing soil pH consideration
   - Action: Update prompt to check pH for Fe deficiency
   
2. Fungicide timing: 3.2/5 avg
   - Issue: Recommendations often too late
   - Action: Emphasize growth stage windows more strongly

## Week 4 Validation
- Test set: 20 recommendations with updated prompt
- New average: 4.1/5 (vs 3.5/5 baseline)
- Improvement: +17%
```

### 2. Update Documentation
- Add learnings to prompt template documentation
- Update knowledge base gap list for Phase 3 ingestion
- Document successful patterns for future reference

### 3. Plan Next Iteration
- Identify additional test cases needed
- Plan Phase 3 data ingestion to fill knowledge gaps
- Set up automated feedback collection for real users

### 4. Share Results
- Present findings to stakeholders
- Update project README with testing results
- Document before/after examples

---

## Conclusion

This systematic testing approach will:

✅ Validate the feedback system works end-to-end
✅ Generate 100 high-quality training examples
✅ Identify strengths and weaknesses in the current system
✅ Produce measurable improvements (target: +15-20%)
✅ Create a reproducible process for future improvements
✅ Build confidence in the system before launching to real users

**Time Investment:** ~15-25 hours over 4 weeks
**Expected ROI:** 15-20% better recommendations, fewer poor user experiences, faster path to product-market fit



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
