# Research Prompt v2: Find Agricultural Sources for Gap Crops

Copy and paste the **entire prompt below the line** into Gemini Advanced Deep Research.

---

## Prompt

I need you to find high-quality, publicly accessible agricultural extension URLs for specific crops. These URLs will be scraped and used as knowledge base content for an AI agronomist advisory app.

### CRITICAL FORMAT REQUIREMENTS

**You MUST return valid JSON. Follow these rules exactly:**

1. Return ONLY the JSON object — no markdown code fences, no commentary before/after
2. Every `urls` array MUST start with `[` and end with `]`
3. Every URL object MUST have ALL 5 fields: `url`, `title`, `crops`, `topics`, `expectedChunks`
4. Do NOT truncate or abbreviate any part of the output
5. If you hit an output length limit, STOP at a clean JSON boundary (after a complete source entry's closing `}`) and tell me to ask for "part 2"
6. Test every URL in your browser before including it — it must return HTTP 200 (not 404, 410, or redirect to login)
7. Every URL must be a DIRECT link to content (not a search page, index page, or landing page)

### Crops That Need Sources

#### Tier 1 — HIGH PRIORITY (8-10 URLs each)

**1. Tomatoes** — Our #1 user demand crop (44 recommendations) but only ~580 chunks
- Disease: early blight, late blight, Septoria leaf spot, bacterial spot, Fusarium wilt, tomato yellow leaf curl
- Pest: tomato hornworm, whiteflies, aphids, spider mites, thrips
- Nutrients: calcium (blossom end rot), nitrogen management, micronutrients
- Management: pruning, staking, harvest timing, greenhouse vs field

**2. Peppers** — Only 115 chunks, needs disease + management depth
- Disease: bacterial leaf spot, Phytophthora blight, anthracnose, mosaic viruses
- Pest: pepper weevil, European corn borer in peppers, aphids, thrips
- Nutrients: fertilization rates, calcium, potassium
- Management: pruning, harvest, hot vs sweet pepper differences

**3. Rice** — $3B US crop, only 125 chunks, needs disease sources
- Disease: rice blast, sheath blight, bacterial panicle blight, false smut
- Pest: rice stink bug, rice water weevil, stem borers
- Nutrients: nitrogen timing for flooded rice, phosphorus, zinc deficiency
- Management: water management, growth stages (BBCH), harvest timing

#### Tier 2 — MEDIUM PRIORITY (5-7 URLs each)

**4. Squash/Cucurbits** — 6 chunks for 4 recommendations (critically underserved)
- Disease: powdery mildew, downy mildew, Phytophthora, bacterial wilt
- Pest: squash vine borer, squash bug, cucumber beetle, aphids
- Management: pollination, vine training, harvest timing
- Include: summer squash, winter squash, zucchini, pumpkins

**5. Sugar Beets** — 0 chunks for 4 recommendations (completely missing!)
- Disease: Cercospora leaf spot, Rhizoctonia root rot, Aphanomyces, curly top virus
- Pest: beet leafhopper, root maggot, aphids
- Nutrients: nitrogen, boron
- Management: planting, harvest, storage

**6. Blueberries** — 192 chunks, growing $1B market
- Disease: mummy berry, anthracnose, Botrytis, Phytophthora root rot
- Pest: spotted wing drosophila, blueberry maggot, Japanese beetle
- Management: pH management, pruning, pollination

**7. Peanuts** — 128 chunks, major US crop
- Disease: leaf spot, white mold/Sclerotinia, tomato spotted wilt virus
- Pest: lesser cornstalk borer, thrips (as TSWV vector)
- Management: digging timing, curing, aflatoxin prevention

#### Tier 3 — FILL GAPS (3-5 URLs each)

**8. Onions** — 80 chunks, needs disease + nutrient depth
- Disease: Botrytis neck rot, downy mildew, pink root, Fusarium basal rot
- Pest: onion thrips, onion maggot
- Nutrients: sulfur, nitrogen, phosphorus timing

**9. Brassicas** (cabbage, broccoli, cauliflower as group) — 14 dedicated "brassicas" chunks
- Disease: black rot, clubroot, Alternaria, downy mildew
- Pest: diamondback moth, cabbage looper, flea beetles, cabbage aphid
- Nutrients: boron, calcium, sulfur requirements

### Source Requirements

**ONLY use these source types:**
1. US University Extension services (*.edu domains)
2. Canadian provincial agriculture / university extension
3. USDA / USDA-ARS publications
4. UC IPM (ipm.ucanr.edu)

**URL validation checklist (verify EACH url before including):**
- [ ] Direct link to a specific page or PDF (not a search/index page)
- [ ] Returns HTTP 200 when visited (not 404, 410, or paywall)
- [ ] Contains substantive content (>500 words, not just a 1-paragraph stub)
- [ ] Published or updated 2018 or later (check page footer/header)
- [ ] Publicly accessible (no login, no institutional paywall)
- [ ] For PDFs: link goes directly to the .pdf file, not a landing page

**Common BAD URLs to avoid:**
- `edis.ifas.ufl.edu/publication/XXX` — many return 410 Gone
- Generic "Crop Production Guide" index pages that just link elsewhere
- Google Scholar or PubMed abstracts (paywalled research)
- State department of agriculture regulation pages (not agronomic content)

### Output Format

Return this EXACT JSON structure. Do not deviate.

```
{
  "phase": 3,
  "description": "Gap-fill: tomatoes, peppers, rice, squash, sugarbeets, blueberries, peanuts, onions, brassicas",
  "totalUrls": <actual count of all urls>,
  "estimatedChunks": null,
  "sources": {
    "<key>": {
      "institution": "<full institution name>",
      "baseUrl": "<base domain>",
      "priority": "high" or "medium",
      "urls": [
        {
          "url": "<full URL>",
          "title": "<descriptive title>",
          "crops": ["<crop1>"],
          "topics": ["<topic1>", "<topic2>"],
          "expectedChunks": <number 5-30>
        }
      ]
    }
  }
}
```

**Source key format:** `<institution_short>_<crop>_<domain>`
Examples: `cornell_tomato_disease`, `ucipm_squash_pest`, `ndsu_sugarbeet_management`

**Valid topic values:** `"disease"`, `"pest"`, `"nutrients"`, `"management"`, `"growth-stages"`, `"diagnosis"`, `"ipm"`, `"production"`

**Valid crop values (lowercase):** `"tomatoes"`, `"peppers"`, `"rice"`, `"squash"`, `"pumpkins"`, `"zucchini"`, `"sugar beets"`, `"blueberries"`, `"peanuts"`, `"onions"`, `"brassicas"`, `"cabbage"`, `"broccoli"`, `"cauliflower"`

### Minimum URL Counts

| Crop | Min URLs | Required Domains |
|------|----------|-----------------|
| Tomatoes | 10 | disease, pest, nutrients, management |
| Peppers | 8 | disease, pest, nutrients, management |
| Rice | 8 | disease, pest, nutrients, management |
| Squash/Cucurbits | 6 | disease, pest, management |
| Sugar Beets | 5 | disease, pest, nutrients, management |
| Blueberries | 5 | disease, pest, management |
| Peanuts | 5 | disease, pest, management |
| Onions | 4 | disease, pest, nutrients |
| Brassicas | 4 | disease, pest, nutrients |
| **Total** | **55+** | |

### IMPORTANT REMINDERS

- If your output will exceed the response length limit, split it: complete the current source entry, close the JSON with `}}`, and tell me to ask for "part 2"
- Every `"urls":` MUST be followed by `[` — never leave it empty
- I will be machine-parsing this JSON. Any syntax error means I have to ask you to redo it
- Prefer PDFs (extension fact sheets, bulletins) over HTML pages — they tend to have more focused, stable content
- Group URLs from the same institution + crop under ONE source key
- `expectedChunks` estimate: small PDF/page = 5-10, medium = 10-20, large comprehensive guide = 20-30
