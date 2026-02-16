# iOS Native App Implementation Plan — Crop Copilot

## Context

**Why this change is needed:**
The current Crop Copilot web application has limitations that prevent farmers from effectively using it in the field:
- Limited camera control (HTML5 file picker only - no viewfinder, manual controls, or RAW capture)
- No offline support for field use without connectivity
- Missing push notifications for async diagnosis completion
- No native platform integrations (widgets, Siri, Face ID)

**The goal:**
Build a native iOS app using Swift/SwiftUI that provides:
1. **Superior camera experience** - Full AVFoundation access with real-time framing guides, manual controls, and high-quality image capture
2. **Robust offline mode** - Core Data + background sync for capturing diagnostics without connectivity
3. **Native integrations** - Push notifications, widgets, Siri shortcuts, Face ID
4. **Platform-optimized UX** - Native iOS navigation patterns, gestures, and performance

**Strategy:**
- **iOS:** Native Swift/SwiftUI app (this plan)
- **Android/Desktop:** Enhanced PWA with service workers (parallel effort)
- **Shared:** Unified backend API layer serving both platforms

---

## Implementation Checklist

### ✅ PHASE 0: API Layer Refactor
**Prerequisite:** Must complete before iOS development begins. Improves web app architecture while enabling mobile clients.

**Current State:**
- API routes in `/apps/web/app/api/` (18 route files, 2,323 lines)
- Business logic embedded directly in route handlers
- Cookie-based Supabase auth (SSR-optimized, not mobile-friendly)
- No API versioning or OpenAPI documentation

**Target State:**
- Shared service layer in `/packages/core/` or `/apps/web/lib/services/`
- JWT bearer token auth alongside existing cookie auth
- Versioned endpoints (`/api/v1/*`)
- OpenAPI/Swagger spec for iOS contract

#### Tasks:

- [ ] **Extract business logic into service layer** (`/lib/services/` or `/packages/core/services/`)
  - [ ] `diagnosis.service.ts` - Extract from `/api/inputs/route.ts` and `/api/recommendations/route.ts`
    - Input validation (Zod schemas)
    - RAG retrieval (calls `/lib/retrieval/search.ts`, `/lib/retrieval/context-assembly.ts`)
    - Claude API call (via `/lib/ai/agents/recommendation.ts`)
    - Response storage (Prisma operations)
  - [ ] `recommendation.service.ts` - Extract from `/api/recommendations/route.ts`, `/api/recommendations/[id]/route.ts`
    - CRUD operations
    - Pagination logic
    - Search/filter
  - [ ] `product.service.ts` - Extract from `/api/products/route.ts`, `/api/products/[id]/route.ts`, `/api/products/compare/route.ts`, `/api/products/pricing/batch/route.ts`
    - Product search
    - Product comparison
    - Pricing lookup
  - [ ] `profile.service.ts` - Extract from `/api/profile/route.ts`
    - User profile CRUD
    - Upsert logic
  - [ ] `upload.service.ts` - Extract from `/api/upload/route.ts`
    - Image upload to Supabase Storage (bucket: `field-images`)
    - Path generation (`{userId}/{timestamp}-{sanitizedName}`)
    - Public URL generation
  - [ ] `feedback.service.ts` - Extract from `/api/feedback/route.ts`
    - Feedback upsert
    - Outcome tracking
    - Learning signal processing (calls `/lib/learning/feedback-signal.ts`)
  - [ ] `retrieval.service.ts` - Extract from `/api/retrieval/search/route.ts`
    - Vector search over knowledge base
    - Chunk retrieval

- [ ] **Add JWT bearer token auth** (alongside existing cookie auth)
  - [ ] Update `/lib/supabase/server.ts` to support JWT bearer tokens (check `Authorization: Bearer <token>` header)
  - [ ] Create auth middleware factory that works for both cookie and bearer token flows
  - [ ] Test JWT flow with Supabase client (iOS will use `supabase-swift` SDK)
  - [ ] Document token refresh strategy (iOS will handle via SDK)

- [ ] **Version the API**
  - [ ] Create `/api/v1/` route prefix structure
  - [ ] Migrate endpoints:
    - `/api/v1/inputs` (POST, GET)
    - `/api/v1/inputs/:id` (GET)
    - `/api/v1/recommendations` (GET)
    - `/api/v1/recommendations/:id` (GET, DELETE)
    - `/api/v1/products` (GET)
    - `/api/v1/products/:id` (GET)
    - `/api/v1/products/compare` (POST)
    - `/api/v1/products/pricing/batch` (POST)
    - `/api/v1/profile` (GET, PUT)
    - `/api/v1/feedback` (POST)
    - `/api/v1/upload` (POST)
    - `/api/v1/retrieval/search` (POST)
  - [ ] Keep existing routes for backward compatibility (web app)
  - [ ] Add version header support (`X-API-Version: v1`)

- [ ] **Generate OpenAPI spec**
  - [ ] Add `tsoa` or `@asteasolutions/zod-to-openapi` for automatic spec generation
  - [ ] Document all v1 endpoints with request/response schemas
  - [ ] Export to `/public/api/openapi.json`
  - [ ] Host Swagger UI at `/api/docs` for mobile team reference

- [ ] **Update Prisma client usage**
  - [ ] Ensure all service layer functions use shared Prisma client (`/lib/prisma.ts`)
  - [ ] Test connection pooling under load (iOS + web concurrent requests)

- [ ] **Add error handling standardization**
  - [ ] Create error response format for API (`{ error: { code, message, details } }`)
  - [ ] Wrap service layer calls in try/catch with proper HTTP status codes
  - [ ] Add request logging middleware (optional: use Axiom/LogFlare)

**Critical Files Modified:**
- `/apps/web/app/api/inputs/route.ts`
- `/apps/web/app/api/recommendations/route.ts`
- `/apps/web/app/api/recommendations/[id]/route.ts`
- `/apps/web/app/api/products/**/*.ts` (4 files)
- `/apps/web/app/api/profile/route.ts`
- `/apps/web/app/api/feedback/route.ts`
- `/apps/web/app/api/upload/route.ts`
- `/apps/web/app/api/retrieval/search/route.ts`
- `/apps/web/lib/supabase/server.ts`

**New Files Created:**
- `/apps/web/lib/services/diagnosis.service.ts`
- `/apps/web/lib/services/recommendation.service.ts`
- `/apps/web/lib/services/product.service.ts`
- `/apps/web/lib/services/profile.service.ts`
- `/apps/web/lib/services/upload.service.ts`
- `/apps/web/lib/services/feedback.service.ts`
- `/apps/web/lib/services/retrieval.service.ts`
- `/apps/web/lib/middleware/auth.ts` (auth middleware factory)
- `/apps/web/app/api/v1/**/*.ts` (versioned routes)
- `/public/api/openapi.json`

**Validation:**
- [ ] Test all API routes still work for web app (cookie auth)
- [ ] Test new `/api/v1/*` routes with JWT bearer token (Postman/Bruno)
- [ ] Verify OpenAPI spec loads in Swagger UI
- [ ] Run existing integration tests (if any)
- [ ] Load test: 100 concurrent requests to `/api/v1/recommendations`

---

### ✅ PHASE 1: iOS Project Setup + Auth

#### Xcode Project Scaffolding

- [ ] **Create new Xcode project**
  - [ ] Name: `CropCopilot` (or `AIAgronomist`)
  - [ ] Minimum deployment target: iOS 16.0
  - [ ] Interface: SwiftUI
  - [ ] Lifecycle: SwiftUI App

- [ ] **Set up project structure** (MVVM architecture)
  ```
  CropCopilot/
  ├── App/
  │   ├── CropCopilotApp.swift         # App entry point
  │   └── AppDelegate.swift            # Push notifications setup
  ├── Core/
  │   ├── Network/
  │   │   ├── APIClient.swift          # URLSession wrapper
  │   │   ├── APIEndpoint.swift        # Endpoint definitions
  │   │   ├── AuthInterceptor.swift    # JWT token injection
  │   │   └── NetworkError.swift       # Error types
  │   ├── Storage/
  │   │   ├── CoreDataStack.swift      # Core Data setup
  │   │   ├── KeychainManager.swift    # Secure token storage
  │   │   └── Models.xcdatamodeld      # Core Data schema
  │   └── Camera/
  │       ├── CameraManager.swift      # AVFoundation wrapper
  │       └── CameraView.swift         # SwiftUI camera view
  ├── Features/
  │   ├── Auth/
  │   │   ├── ViewModels/
  │   │   │   └── AuthViewModel.swift
  │   │   ├── Views/
  │   │   │   ├── LoginView.swift
  │   │   │   ├── SignupView.swift
  │   │   │   └── BiometricAuthView.swift
  │   │   └── Models/
  │   ├── Dashboard/
  │   ├── Diagnose/
  │   ├── Recommendations/
  │   ├── Products/
  │   └── Settings/
  ├── Shared/
  │   ├── Components/                  # Reusable SwiftUI views
  │   ├── Theme/                       # Colors, fonts, design tokens
  │   └── Extensions/
  └── Widgets/
      └── SoilHealthWidget/
  ```

- [ ] **Add Swift Package Manager dependencies**
  - [ ] `supabase-swift` (https://github.com/supabase/supabase-swift)
  - [ ] `Kingfisher` (https://github.com/onevcat/Kingfisher) - Image loading/caching
  - [ ] `SwiftUIIntrospect` (https://github.com/siteline/swiftui-introspect) - UI customization

#### Authentication Implementation

- [ ] **Configure Supabase**
  - [ ] Add Supabase URL and anon key to `Info.plist` or env config
  - [ ] Initialize Supabase client in `CropCopilotApp.swift`
  - [ ] Set up deep link URL scheme for OAuth callbacks (`cropcopilot://`)

- [ ] **Build auth views**
  - [ ] `LoginView.swift` - Email/password form with validation
  - [ ] `SignupView.swift` - Email/password signup
  - [ ] Apple Sign In button (required if offering any third-party login)
  - [ ] Password reset flow

- [ ] **Auth view model**
  - [ ] `AuthViewModel.swift` - Manage auth state
  - [ ] Sign in with email/password (Supabase SDK)
  - [ ] Sign up with email/password
  - [ ] Sign in with Apple (Supabase OAuth)
  - [ ] Token refresh logic
  - [ ] Error handling (network errors, invalid credentials, etc.)

- [ ] **Secure token storage**
  - [ ] `KeychainManager.swift` - Save/load JWT tokens to Keychain
  - [ ] Save access token and refresh token
  - [ ] Auto-load tokens on app launch
  - [ ] Clear tokens on logout

- [ ] **API client with auth interceptor**
  - [ ] `APIClient.swift` - URLSession wrapper with async/await
  - [ ] `AuthInterceptor.swift` - Inject `Authorization: Bearer <token>` header
  - [ ] Handle 401 responses (refresh token, retry request)
  - [ ] Handle network errors (no connectivity, timeout)

- [ ] **Face ID / Touch ID**
  - [ ] Check biometric availability (LocalAuthentication framework)
  - [ ] Add biometric toggle in settings
  - [ ] Store biometric preference in UserDefaults
  - [ ] Lock app with biometric on return from background (if enabled)

- [ ] **Deep link handling**
  - [ ] Handle OAuth redirect from Supabase (`cropcopilot://auth/callback`)
  - [ ] Parse URL parameters (access token, refresh token)
  - [ ] Save tokens and navigate to dashboard

**Critical Files Created:**
- `CropCopilot/App/CropCopilotApp.swift`
- `CropCopilot/Core/Network/APIClient.swift`
- `CropCopilot/Core/Network/AuthInterceptor.swift`
- `CropCopilot/Core/Storage/KeychainManager.swift`
- `CropCopilot/Features/Auth/ViewModels/AuthViewModel.swift`
- `CropCopilot/Features/Auth/Views/LoginView.swift`
- `CropCopilot/Features/Auth/Views/SignupView.swift`

**Validation:**
- [ ] Test email/password login (save tokens to Keychain)
- [ ] Test Apple Sign In flow (OAuth redirect)
- [ ] Test token refresh on API 401 response
- [ ] Test Face ID/Touch ID lock on app return from background
- [ ] Test deep link handling (open `cropcopilot://auth/callback?token=...` in Safari)

---

### ✅ PHASE 2: API Client + Core Data Foundation

#### API Client Implementation

- [ ] **Create Swift models matching Prisma schema**
  - [ ] `User.swift` - User model (id, email)
  - [ ] `UserProfile.swift` - Profile model (location, farmSize, cropsOfInterest, experienceLevel)
  - [ ] `Input.swift` - Input model (type: PHOTO/LAB_REPORT, imageUrl, description, labData, crop, location, season)
  - [ ] `Recommendation.swift` - Recommendation model (diagnosis JSON, confidence, products, sources)
  - [ ] `Product.swift` - Product model (name, type, description, analysis)
  - [ ] `Feedback.swift` - Feedback model (helpful, rating, accuracy, outcome)
  - [ ] Use `Codable` for JSON encoding/decoding

- [ ] **Define API endpoints**
  - [ ] `APIEndpoint.swift` - Enum for all endpoints
    - `inputs` (POST, GET)
    - `inputDetail(id)` (GET)
    - `recommendations` (GET)
    - `recommendationDetail(id)` (GET, DELETE)
    - `products` (GET)
    - `productDetail(id)` (GET)
    - `productCompare` (POST)
    - `productPricingBatch` (POST)
    - `profile` (GET, PUT)
    - `feedback` (POST)
    - `upload` (POST)

- [ ] **Build generic API client**
  - [ ] `APIClient.swift` - Generic request method
    - `request<T: Codable>(_ endpoint: APIEndpoint) async throws -> T`
    - Auto-inject auth header (via `AuthInterceptor`)
    - Parse JSON response
    - Handle errors (network, parsing, 4xx/5xx)
  - [ ] Add retry logic for network failures (max 2 retries)
  - [ ] Add request logging (debug mode)

- [ ] **Network error types**
  - [ ] `NetworkError.swift` - Enum for errors
    - `unauthorized` (401)
    - `notFound` (404)
    - `serverError` (5xx)
    - `noInternet`
    - `timeout`
    - `decodingError`

#### Core Data Setup

- [ ] **Create Core Data schema** (`Models.xcdatamodeld`)
  - [ ] `RecommendationEntity` - Mirror `Recommendation` model (for offline)
  - [ ] `ProductEntity` - Mirror `Product` model
  - [ ] `UserProfileEntity` - Mirror `UserProfile` model
  - [ ] `PendingInputEntity` - Queue offline submissions (imageData, formData, timestamp)

- [ ] **Core Data stack**
  - [ ] `CoreDataStack.swift` - NSPersistentContainer setup
  - [ ] In-memory store for previews
  - [ ] Persistent store for production
  - [ ] Background context for sync operations

- [ ] **Repository pattern**
  - [ ] `RecommendationRepository.swift` - Fetch from API → save to Core Data
  - [ ] `ProductRepository.swift` - Fetch from API → save to Core Data
  - [ ] `ProfileRepository.swift` - Fetch from API → save to Core Data
  - [ ] `PendingInputRepository.swift` - Manage offline queue

- [ ] **Network monitor**
  - [ ] `NetworkMonitor.swift` - NWPathMonitor wrapper (SwiftUI observable)
  - [ ] Publish connectivity state (`isConnected: Bool`)
  - [ ] Use in UI to show offline banner

**Critical Files Created:**
- `CropCopilot/Core/Network/APIClient.swift`
- `CropCopilot/Core/Network/APIEndpoint.swift`
- `CropCopilot/Core/Network/NetworkError.swift`
- `CropCopilot/Core/Storage/CoreDataStack.swift`
- `CropCopilot/Core/Storage/Models.xcdatamodeld`
- `CropCopilot/Core/Storage/NetworkMonitor.swift`
- `CropCopilot/Features/Recommendations/Repositories/RecommendationRepository.swift`
- `CropCopilot/Models/User.swift`
- `CropCopilot/Models/UserProfile.swift`
- `CropCopilot/Models/Input.swift`
- `CropCopilot/Models/Recommendation.swift`
- `CropCopilot/Models/Product.swift`

**Validation:**
- [ ] Test API client with `/api/v1/recommendations` (fetch list)
- [ ] Test API client with `/api/v1/profile` (fetch profile)
- [ ] Test Core Data save/fetch (save a recommendation, fetch it back)
- [ ] Test network monitor (toggle airplane mode, verify `isConnected` updates)

---

### ✅ PHASE 3: Dashboard + Profile

- [ ] **Create tab bar navigation**
  - [ ] `MainTabView.swift` - TabView with 5 tabs
    - Dashboard
    - Diagnose
    - Recommendations
    - Products
    - Settings

- [ ] **Build dashboard view**
  - [ ] `DashboardView.swift` - Welcome banner, quick actions, recent recommendations
  - [ ] `DashboardViewModel.swift` - Fetch recent recommendations (via `RecommendationRepository`)
  - [ ] Pull-to-refresh (SwiftUI `refreshable` modifier)
  - [ ] Skeleton loading states (shimmer effect)
  - [ ] Empty state UI ("No recommendations yet - start a diagnosis!")

- [ ] **Build profile/settings view**
  - [ ] `ProfileView.swift` - Display profile data
  - [ ] `ProfileViewModel.swift` - Fetch and update profile (via `ProfileRepository`)
  - [ ] Form fields:
    - Farm location (picker for US states/Canadian provinces)
    - Farm size (text field with number validation)
    - Crops of interest (multi-select chips)
    - Experience level (beginner, intermediate, expert)
  - [ ] Biometric auth toggle
  - [ ] Logout button

- [ ] **Build settings view**
  - [ ] `SettingsView.swift` - App settings
  - [ ] Account section (profile, logout)
  - [ ] Notifications section (enable/disable push, preferences)
  - [ ] About section (version, privacy policy, terms)

**Critical Files Created:**
- `CropCopilot/Features/Dashboard/Views/DashboardView.swift`
- `CropCopilot/Features/Dashboard/ViewModels/DashboardViewModel.swift`
- `CropCopilot/Features/Settings/Views/ProfileView.swift`
- `CropCopilot/Features/Settings/ViewModels/ProfileViewModel.swift`
- `CropCopilot/Features/Settings/Views/SettingsView.swift`
- `CropCopilot/App/MainTabView.swift`

**Validation:**
- [ ] Test dashboard loads recent recommendations from API
- [ ] Test pull-to-refresh updates data
- [ ] Test profile form submission (PUT `/api/v1/profile`)
- [ ] Test logout clears Keychain tokens and navigates to login
- [ ] Test biometric toggle saves preference to UserDefaults

---

### ✅ PHASE 4: Camera Diagnosis Flow

**This is the highest-value iOS-native feature — the reason for building a native app.**

#### Camera View

- [ ] **Build custom camera view**
  - [ ] `CameraView.swift` - AVFoundation-based camera UI
  - [ ] `CameraManager.swift` - AVCaptureSession wrapper
  - [ ] Live preview layer (AVCaptureVideoPreviewLayer)
  - [ ] Framing overlay guide ("Center the soil/crop in frame")
  - [ ] Flash toggle button
  - [ ] Zoom pinch gesture (via AVCaptureDevice zoom)
  - [ ] Front/rear camera switch
  - [ ] Resolution picker (1080p, 4K) in settings
  - [ ] Shutter button with haptic feedback
  - [ ] Request camera permissions (AVCaptureDevice authorization)

- [ ] **Photo review screen**
  - [ ] `PhotoReviewView.swift` - Show captured image
  - [ ] Retake button
  - [ ] Use button (navigates to diagnosis form)

#### Diagnosis Form

- [ ] **Build diagnosis form view**
  - [ ] `DiagnosisFormView.swift` - Form for photo diagnosis
  - [ ] Fields:
    - Crop (picker matching Prisma enum: CORN, SOYBEANS, WHEAT, COTTON, etc.)
    - Growth stage (text field or picker)
    - Location (auto-filled from GPS via CLLocation, fallback to manual picker)
    - Description (text editor)
  - [ ] Auto-save form state to Core Data (in case user exits mid-entry)

- [ ] **Upload image to Supabase Storage**
  - [ ] Convert UIImage to JPEG data (compress to <10MB)
  - [ ] POST to `/api/v1/upload` with multipart/form-data
  - [ ] Show upload progress indicator
  - [ ] Handle upload errors (retry, show error message)

- [ ] **Submit diagnosis**
  - [ ] POST to `/api/v1/inputs` with form data + imageUrl
  - [ ] Show loading state ("Analyzing...")
  - [ ] Poll for recommendation completion (if async)
  - [ ] Navigate to result view on success

#### Result View

- [ ] **Build diagnosis result view**
  - [ ] `DiagnosisResultView.swift` - Show recommendation
  - [ ] Sections (expandable):
    - Diagnosis summary
    - Confidence score (visual indicator)
    - Recommendations list
    - Linked products
    - Cited sources (URLs)
  - [ ] Save button (save to Core Data for offline access)
  - [ ] Share button (share text summary via UIActivityViewController)
  - [ ] Feedback buttons (helpful, not helpful)

**Critical Files Created:**
- `CropCopilot/Core/Camera/CameraManager.swift`
- `CropCopilot/Core/Camera/CameraView.swift`
- `CropCopilot/Features/Diagnose/Views/PhotoReviewView.swift`
- `CropCopilot/Features/Diagnose/Views/DiagnosisFormView.swift`
- `CropCopilot/Features/Diagnose/Views/DiagnosisResultView.swift`
- `CropCopilot/Features/Diagnose/ViewModels/DiagnosisViewModel.swift`

**Validation:**
- [ ] Test camera permissions request (first launch)
- [ ] Test photo capture (tap shutter, review, retake)
- [ ] Test zoom pinch gesture
- [ ] Test flash toggle
- [ ] Test image upload to Supabase Storage
- [ ] Test form submission (POST `/api/v1/inputs`)
- [ ] Test result view displays diagnosis + products + sources
- [ ] Test save to Core Data (view offline later)

---

### ✅ PHASE 5: Lab Report Entry

- [ ] **Build lab report form view**
  - [ ] `LabReportFormView.swift` - Form for lab data entry
  - [ ] Match web form fields exactly (from `/apps/web/app/dashboard/inputs/new/lab-report/page.tsx`)
  - [ ] Grouped sections (accordion/expandable):
    - **Basic Info**: Crop, location, sample date
    - **pH & OM**: pH, organic matter %
    - **Primary Nutrients (NPK)**: N, P, K (ppm or lbs/acre)
    - **Secondary Nutrients**: Ca, Mg, S
    - **Micronutrients**: Fe, Mn, Zn, Cu, B, Mo
    - **Soil Properties**: CEC, base saturation %, texture
  - [ ] Number input fields with validation
  - [ ] Auto-save form state to Core Data (resume later)

- [ ] **Submit lab report**
  - [ ] POST to `/api/v1/inputs` with `type: LAB_REPORT` and `labData` JSON
  - [ ] Show loading state
  - [ ] Navigate to result view (reuse `DiagnosisResultView` from Phase 4)

- [ ] **OCR scanning (stretch goal)**
  - [ ] `LabReportScannerView.swift` - Point camera at printed lab report
  - [ ] Use Vision framework (`VNRecognizeTextRequest`) to extract text
  - [ ] Parse extracted text into form fields (regex or LLM-based parsing)
  - [ ] Show confidence indicator for each extracted field
  - [ ] Allow manual correction before submission

**Critical Files Created:**
- `CropCopilot/Features/Diagnose/Views/LabReportFormView.swift`
- `CropCopilot/Features/Diagnose/Views/LabReportScannerView.swift` (OCR, optional)
- `CropCopilot/Features/Diagnose/ViewModels/LabReportViewModel.swift`

**Validation:**
- [ ] Test form auto-save (enter data, exit app, relaunch, verify data persists)
- [ ] Test form submission (POST `/api/v1/inputs` with `type: LAB_REPORT`)
- [ ] Test result view displays diagnosis from lab data
- [ ] (Optional) Test OCR scanning accuracy with sample lab reports

---

### ✅ PHASE 6: Recommendations History

- [ ] **Build recommendations list view**
  - [ ] `RecommendationsListView.swift` - List of past recommendations
  - [ ] `RecommendationsViewModel.swift` - Fetch from API + Core Data
  - [ ] Search bar (filter by crop, keyword)
  - [ ] Filter chips (by crop type, date range)
  - [ ] Sort options (newest first, oldest first, highest confidence)
  - [ ] Pagination (infinite scroll or load-more button)
  - [ ] Swipe-to-delete gesture (remove from Core Data)

- [ ] **Build recommendation detail view**
  - [ ] `RecommendationDetailView.swift` - Full recommendation details
  - [ ] Expandable sections:
    - Diagnosis
    - Recommendations
    - Products
    - Sources (with clickable URLs)
  - [ ] Share button (share text summary)
  - [ ] Delete button (confirm dialog)
  - [ ] Feedback section (rate accuracy, mark as applied, add notes)

- [ ] **Core Data caching**
  - [ ] Fetch recommendations from API on first load
  - [ ] Save last 50 recommendations to Core Data
  - [ ] Use Core Data for offline viewing
  - [ ] Sync with API on pull-to-refresh

**Critical Files Created:**
- `CropCopilot/Features/Recommendations/Views/RecommendationsListView.swift`
- `CropCopilot/Features/Recommendations/Views/RecommendationDetailView.swift`
- `CropCopilot/Features/Recommendations/ViewModels/RecommendationsViewModel.swift`

**Validation:**
- [ ] Test recommendations list loads from API
- [ ] Test search filters results
- [ ] Test sort options reorder list
- [ ] Test pagination loads more results
- [ ] Test swipe-to-delete removes from Core Data
- [ ] Test detail view displays all sections
- [ ] Test offline viewing (fetch once, go offline, view cached data)

---

### ✅ PHASE 7: Products

- [ ] **Build product browser view**
  - [ ] `ProductBrowserView.swift` - Browse all products
  - [ ] `ProductsViewModel.swift` - Fetch from API
  - [ ] Search bar (filter by product name, type)
  - [ ] Filter chips (by type: fertilizer, pesticide, amendment)
  - [ ] Sort options (name, type)
  - [ ] Product cards (name, type, thumbnail)

- [ ] **Build product detail view**
  - [ ] `ProductDetailView.swift` - Full product details
  - [ ] Sections:
    - Product name + type
    - Analysis breakdown (NPK values, guarantees)
    - Application rates
    - Description
    - Linked recommendations (if any)
  - [ ] Add to comparison button

- [ ] **Build product comparison view**
  - [ ] `ProductComparisonView.swift` - Compare up to 6 products side-by-side
  - [ ] Drag-to-add-to-comparison UX (drag product card to comparison tray)
  - [ ] Horizontal scroll for side-by-side view
  - [ ] Highlight differences (different NPK ratios, application rates)
  - [ ] POST to `/api/v1/products/compare` for LLM-generated comparison summary

- [ ] **Pricing lookup**
  - [ ] Add pricing section to product detail view
  - [ ] POST to `/api/v1/products/pricing/batch` with product IDs
  - [ ] Display pricing results (retailer, price, link)
  - [ ] Show "Pricing unavailable" if no results

- [ ] **Deep links from recommendations**
  - [ ] Add product links to `RecommendationDetailView`
  - [ ] Tap product → navigate to `ProductDetailView`

**Critical Files Created:**
- `CropCopilot/Features/Products/Views/ProductBrowserView.swift`
- `CropCopilot/Features/Products/Views/ProductDetailView.swift`
- `CropCopilot/Features/Products/Views/ProductComparisonView.swift`
- `CropCopilot/Features/Products/ViewModels/ProductsViewModel.swift`

**Validation:**
- [ ] Test product browser loads from API
- [ ] Test search filters products
- [ ] Test product detail view displays all sections
- [ ] Test comparison view shows side-by-side comparison
- [ ] Test pricing lookup displays results
- [ ] Test deep links from recommendations → products

---

### ✅ PHASE 8: Offline Mode

**Make all features work without connectivity.**

- [ ] **Expand Core Data schema**
  - [ ] Cache all viewed recommendations (not just last 50)
  - [ ] Cache all viewed products
  - [ ] Cache user profile
  - [ ] Add `PendingInputEntity` for offline queue

- [ ] **Offline queue manager**
  - [ ] `OfflineQueueManager.swift` - Manage pending submissions
  - [ ] When offline:
    - Save photo + form data to Core Data as `PendingInputEntity`
    - Show "Queued" badge on submission
    - Add to pending list in dashboard
  - [ ] When online:
    - Auto-process queued submissions (POST `/api/v1/inputs`)
    - Show progress indicator
    - Remove from queue on success
    - Show error on failure (allow retry)

- [ ] **Background sync**
  - [ ] `BGTaskScheduler` setup (background processing)
  - [ ] Register background task (identifier: `com.cropcopilot.sync`)
  - [ ] Trigger sync on app return from background (if online)
  - [ ] Trigger sync on connectivity change (NWPathMonitor)

- [ ] **Conflict resolution**
  - [ ] Profile edits: Last-write-wins (overwrite on sync)
  - [ ] New diagnoses: Append-only (always create new on sync)
  - [ ] If sync fails: Show conflict UI (manual merge or discard)

- [ ] **Offline banner UI**
  - [ ] `OfflineBannerView.swift` - Subtle banner at top of screen
  - [ ] Show when offline ("No connection - changes will sync later")
  - [ ] Hide when online
  - [ ] Show toast on reconnect + syncing ("Syncing 3 pending items...")

- [ ] **Image caching**
  - [ ] Configure Kingfisher disk cache (cache recommendation images, product images)
  - [ ] Preload images for last 50 recommendations on app launch
  - [ ] Clear cache on logout

**Critical Files Created:**
- `CropCopilot/Core/Storage/OfflineQueueManager.swift`
- `CropCopilot/Shared/Components/OfflineBannerView.swift`

**Validation:**
- [ ] Test offline photo capture (save to queue)
- [ ] Test offline form submission (save to queue)
- [ ] Test pending list shows queued items
- [ ] Test auto-sync on reconnect (process queue)
- [ ] Test background sync (BGTaskScheduler)
- [ ] Test offline banner visibility (toggle airplane mode)
- [ ] Test image cache (view recommendation offline)

---

### ✅ PHASE 9: Push Notifications

- [ ] **APNs registration**
  - [ ] Add push notification capability to Xcode project
  - [ ] Request notification permissions (UNUserNotificationCenter)
  - [ ] Register for remote notifications (UIApplication)
  - [ ] Capture device token
  - [ ] Send token to server (store in `UserProfile` or new `DeviceToken` table)

- [ ] **Server-side push sending**
  - [ ] Add APNs integration to backend (use `node-apn` or `@parse/node-apn`)
  - [ ] Trigger push when diagnosis completes async:
    - Title: "Diagnosis Complete"
    - Body: "Your soil analysis is ready - tap to view"
    - Data: `{ recommendationId: "..." }`
  - [ ] Add notification preferences to `UserProfile` (enable/disable by type)

- [ ] **Notification handling**
  - [ ] `AppDelegate.swift` - Handle incoming notifications
  - [ ] Show notification when app in background/foreground
  - [ ] Tap notification → deep link to `RecommendationDetailView`

- [ ] **Notification categories**
  - [ ] Diagnosis complete
  - [ ] Seasonal reminders (soil testing windows, application timing)
  - [ ] Product price alerts (if user saves products)

- [ ] **Notification preferences UI**
  - [ ] Add to `SettingsView.swift`
  - [ ] Toggle for each notification type
  - [ ] Save preferences to API (PUT `/api/v1/profile`)

- [ ] **Rich notifications**
  - [ ] Add thumbnail image to notification (recommendation photo)
  - [ ] Use UNNotificationAttachment for images

**Critical Files Modified:**
- `CropCopilot/App/AppDelegate.swift`

**Critical Files Created:**
- `CropCopilot/Features/Settings/Views/NotificationPreferencesView.swift`

**Validation:**
- [ ] Test APNs registration (device token sent to server)
- [ ] Test notification received when diagnosis completes
- [ ] Test notification tap deep links to recommendation detail
- [ ] Test notification preferences toggle (enable/disable)
- [ ] Test rich notification with image

---

### ✅ PHASE 10: Widgets

**Home Screen and Lock Screen widgets for passive visibility.**

- [ ] **Set up App Group**
  - [ ] Enable App Groups capability in Xcode
  - [ ] Create shared container: `group.com.cropcopilot.shared`
  - [ ] Main app writes data to shared UserDefaults
  - [ ] Widget reads from shared UserDefaults

- [ ] **Small widget** (2x2 grid)
  - [ ] `SoilHealthSmallWidget.swift` - Show latest soil health score
  - [ ] Display: Crop name, confidence score, date
  - [ ] Tap → deep link to latest recommendation

- [ ] **Medium widget** (4x2 grid)
  - [ ] `SoilHealthMediumWidget.swift` - Show recent recommendation summary
  - [ ] Display: Crop name, diagnosis summary, confidence, thumbnail image
  - [ ] Tap → deep link to recommendation detail

- [ ] **Lock Screen widget** (iOS 16+)
  - [ ] `NextActionLockScreenWidget.swift` - Show next recommended action
  - [ ] Display: "Fertilize corn — 3 days"
  - [ ] Tap → deep link to recommendation detail

- [ ] **Widget timeline updates**
  - [ ] `WidgetDataProvider.swift` - Fetch latest recommendation from Core Data
  - [ ] Write to shared UserDefaults (widget reads this)
  - [ ] Update timeline on new recommendation (call `WidgetCenter.shared.reloadAllTimelines()`)

- [ ] **Widget deep links**
  - [ ] Handle widget tap (URL scheme: `cropcopilot://recommendation/:id`)
  - [ ] Parse URL and navigate to `RecommendationDetailView`

**Critical Files Created:**
- `CropCopilot/Widgets/SoilHealthWidget/SoilHealthSmallWidget.swift`
- `CropCopilot/Widgets/SoilHealthWidget/SoilHealthMediumWidget.swift`
- `CropCopilot/Widgets/SoilHealthWidget/NextActionLockScreenWidget.swift`
- `CropCopilot/Widgets/SoilHealthWidget/WidgetDataProvider.swift`

**Validation:**
- [ ] Test widget displays latest recommendation
- [ ] Test widget updates when new recommendation is created
- [ ] Test widget tap deep links to recommendation detail
- [ ] Test Lock Screen widget on iOS 16+ device

---

### ✅ PHASE 11: Share Extension + Siri Shortcuts

#### Share Extension

- [ ] **Create Share Extension target**
  - [ ] Add new target in Xcode: iOS Share Extension
  - [ ] Name: `CropCopilot Share`

- [ ] **Handle PDF/image sharing**
  - [ ] `ShareViewController.swift` - Receive shared file
  - [ ] Accept PDFs (lab reports) and images (photos)
  - [ ] Parse PDF for lab data (Vision framework OCR)
  - [ ] Save to Core Data as pending input
  - [ ] Show toast: "Saved to Crop Copilot - open app to complete"

#### Siri Shortcuts

- [ ] **Register Siri shortcuts**
  - [ ] Add `NSUserActivity` for "Start soil diagnosis"
  - [ ] Register with `NSUserActivityTypeBrowsingWeb` type
  - [ ] Donate activity when user opens camera view

- [ ] **Shortcut actions**
  - [ ] "Start soil diagnosis" → Opens camera view directly
  - [ ] "Show my latest recommendation" → Opens most recent recommendation

- [ ] **Shortcuts app integration**
  - [ ] Add to Shortcuts app (users can build automations)
  - [ ] Example: "Every Monday, remind me to check soil moisture"

#### Spotlight Indexing

- [ ] **Index recommendations in Spotlight**
  - [ ] `CoreSpotlightIndexer.swift` - Index recommendations with `CSSearchableItem`
  - [ ] Searchable fields: Crop name, diagnosis summary, confidence
  - [ ] Deep link: `cropcopilot://recommendation/:id`

**Critical Files Created:**
- `CropCopilotShare/ShareViewController.swift`
- `CropCopilot/Core/Shortcuts/ShortcutsManager.swift`
- `CropCopilot/Core/Spotlight/CoreSpotlightIndexer.swift`

**Validation:**
- [ ] Test sharing PDF from Mail → opens in Crop Copilot
- [ ] Test sharing image from Photos → opens in Crop Copilot
- [ ] Test Siri shortcut: "Hey Siri, start soil diagnosis" (opens camera)
- [ ] Test Spotlight search for recommendation (tap result, opens detail view)

---

### ✅ PHASE 12: Polish + App Store Prep

#### Polish

- [ ] **Haptic feedback**
  - [ ] Add haptics to key interactions:
    - Shutter button (camera)
    - Swipe-to-delete (recommendations list)
    - Toggle switches (settings)
    - Submit buttons (forms)
  - [ ] Use `UIImpactFeedbackGenerator`, `UINotificationFeedbackGenerator`

- [ ] **Accessibility audit**
  - [ ] Add VoiceOver labels to all images, buttons
  - [ ] Test with VoiceOver enabled
  - [ ] Support Dynamic Type (text scales with system font size)
  - [ ] Check color contrast ratios (WCAG AA minimum)

- [ ] **Error handling**
  - [ ] Add user-friendly error messages for all API failures
  - [ ] Add retry buttons for network errors
  - [ ] Add empty states for all list views

- [ ] **Loading states**
  - [ ] Add skeletons/shimmer for all loading views
  - [ ] Add progress indicators for uploads
  - [ ] Add spinners for API requests

#### App Store Assets

- [ ] **Screenshots**
  - [ ] Capture screenshots for required sizes:
    - 6.7" (iPhone 16 Pro Max, 15 Pro Max, 14 Pro Max)
    - 6.1" (iPhone 16, 15, 14)
    - iPad Pro (if supporting iPad)
  - [ ] Minimum 3 screenshots per size
  - [ ] Show key features: Camera, recommendations, products

- [ ] **App preview video** (optional)
  - [ ] 15-30 second demo of core flow (camera → diagnosis → recommendation)
  - [ ] Export in required formats

- [ ] **App Store description**
  - [ ] Title: "Crop Copilot - AI Agronomist"
  - [ ] Subtitle: "Soil & Crop Diagnostics"
  - [ ] Keywords: soil test, farming, agriculture, crop health, diagnosis, fertilizer
  - [ ] Category: Productivity or Food & Drink
  - [ ] Description (4000 char limit):
    - What it does
    - Key features (camera, offline, widgets)
    - Who it's for (farmers, agronomists)

- [ ] **Privacy nutrition labels** (App Store Connect)
  - [ ] Declare data collected:
    - User content (photos, lab reports)
    - Location (GPS for field location)
    - Contact info (email for account)
  - [ ] Declare data usage (analytics, product functionality)
  - [ ] Link to privacy policy (host at `cropcopilot.com/privacy`)

#### TestFlight Beta

- [ ] **Upload to TestFlight**
  - [ ] Archive build in Xcode
  - [ ] Upload to App Store Connect
  - [ ] Add beta testers (internal + external)
  - [ ] Add testing instructions

- [ ] **Collect beta feedback**
  - [ ] Share TestFlight link with early adopter farmers
  - [ ] Collect feedback via TestFlight feedback or survey
  - [ ] Iterate on bug fixes and UX improvements

#### App Store Submission

- [ ] **Prepare for review**
  - [ ] Test on physical devices (iPhone SE, iPhone 16, iPad if supported)
  - [ ] Test on iOS 16, 17, 18
  - [ ] Fix all crashes and major bugs
  - [ ] Add demo account credentials (for App Review team)

- [ ] **Submit for review**
  - [ ] Fill out all metadata in App Store Connect
  - [ ] Upload final build
  - [ ] Submit for review
  - [ ] Wait 1-7 days for approval
  - [ ] Fix any rejection issues

- [ ] **Launch!**
  - [ ] Release approved build
  - [ ] Monitor crash reports (Crashlytics/Sentry)
  - [ ] Monitor App Store reviews
  - [ ] Respond to user feedback

**Critical Files Modified:**
- Multiple files (haptics, accessibility labels, error messages)

**Critical Files Created:**
- `/docs/app-store/description.md`
- `/docs/app-store/privacy-policy.md`

**Validation:**
- [ ] Test haptics on physical device
- [ ] Test VoiceOver on all screens
- [ ] Test Dynamic Type (increase font size, verify layout)
- [ ] Test color contrast (use Xcode Accessibility Inspector)
- [ ] Test on all supported devices and iOS versions
- [ ] Submit TestFlight build, verify beta testers can install

---

## Critical Files Summary

### Backend (API Layer Refactor)
- `/apps/web/lib/services/*.service.ts` (7 new files)
- `/apps/web/lib/middleware/auth.ts` (new)
- `/apps/web/app/api/v1/**/*.ts` (new versioned routes)
- `/public/api/openapi.json` (new)

### iOS App
- **Project Setup**: 50+ files (MVVM structure, Core Data, network layer)
- **Key Views**: 20+ SwiftUI views (auth, dashboard, camera, recommendations, products, settings)
- **View Models**: 10+ ViewModels (auth, diagnosis, recommendations, products, profile)
- **Core Components**: API client, Keychain manager, Core Data stack, camera manager, network monitor
- **Extensions**: Share Extension, Widgets, Siri Shortcuts

---

## End-to-End Verification Plan

After all phases are complete, test the full user journey:

### 1. Onboarding
- [ ] Install app → sign up with email/password
- [ ] Complete profile (location, crops, experience level)
- [ ] Enable Face ID

### 2. Photo Diagnosis Flow
- [ ] Open camera → capture photo of soil/crop
- [ ] Fill out diagnosis form (crop, growth stage, location auto-filled)
- [ ] Submit → see loading state
- [ ] View result (diagnosis, confidence, recommendations, products, sources)
- [ ] Save to history

### 3. Lab Report Flow
- [ ] Open lab report form
- [ ] Enter lab data (pH, NPK, etc.)
- [ ] Submit → see result
- [ ] Save to history

### 4. Recommendations History
- [ ] View recommendations list
- [ ] Search for specific crop
- [ ] Filter by date range
- [ ] Open recommendation detail
- [ ] Swipe to delete
- [ ] View offline (toggle airplane mode, verify cached data loads)

### 5. Products
- [ ] Browse products
- [ ] Search for specific product
- [ ] View product detail
- [ ] Add to comparison (drag-to-add)
- [ ] View comparison (side-by-side)
- [ ] Look up pricing

### 6. Offline Mode
- [ ] Go offline (airplane mode)
- [ ] Capture photo + fill form
- [ ] Submit (saved to queue)
- [ ] Go online
- [ ] Verify auto-sync processes queue

### 7. Push Notifications
- [ ] Submit diagnosis
- [ ] Wait for push notification
- [ ] Tap notification → opens recommendation detail

### 8. Widgets
- [ ] Add widget to Home Screen
- [ ] Verify displays latest recommendation
- [ ] Tap widget → opens recommendation detail
- [ ] Add Lock Screen widget (iOS 16+)

### 9. Share Extension
- [ ] Share PDF from Mail → opens in Crop Copilot
- [ ] Verify PDF parsed into form

### 10. Siri Shortcuts
- [ ] Say "Hey Siri, start soil diagnosis" → opens camera
- [ ] Say "Hey Siri, show my latest recommendation" → opens recommendation

### 11. Logout & Re-login
- [ ] Logout → clears tokens
- [ ] Re-login with Face ID

---

## Revised Implementation Plan (Back-to-Back Execution)

All phases will be executed sequentially, back-to-back. Each phase will have:
- Dedicated Git branch
- Associated GitHub issue
- Pull request with integration tests
- Code review before merge

### **NEW PHASE 1: Foundation (API + iOS Setup + Auth + Core Infrastructure)**
**Combines original Phases 0, 1, 2**

**Branch:** `phase-1/api-ios-foundation`
**Issue:** "Phase 1: API Refactor + iOS Project Setup + Auth + Core Infrastructure"

**Deliverables:**
1. **Backend API Refactor**
   - Extract service layer (`/lib/services/`)
   - JWT bearer token auth
   - Versioned endpoints (`/api/v1/`)
   - OpenAPI spec generation

2. **iOS Project Structure**
   - Create `/apps/ios/CropCopilot.xcodeproj`
   - MVVM architecture with SwiftUI
   - Swift Package Manager dependencies (supabase-swift, Kingfisher)

3. **iOS Authentication**
   - Login/Signup views
   - Apple Sign In
   - Keychain token storage
   - Face ID/Touch ID
   - Deep link handling

4. **iOS Core Infrastructure**
   - API client with auth interceptor
   - Swift models (Codable)
   - Core Data setup
   - Repository pattern
   - Network monitor

**Tests:**
- Backend: API endpoint tests (TypeScript/Vitest)
- iOS: XCTest unit tests for auth, API client, repositories

---

### **NEW PHASE 2: Core Features (Dashboard + Camera + Lab Report + Recommendations)**
**Combines original Phases 3, 4, 5, 6**

**Branch:** `phase-2/core-features`
**Issue:** "Phase 2: Dashboard + Camera Diagnosis + Lab Report + Recommendations History"

**Deliverables:**
1. Dashboard with tab bar navigation
2. Profile/settings management
3. **Camera diagnosis flow** (AVFoundation, framing guides, upload, results)
4. **Lab report entry** (form with OCR stretch goal)
5. Recommendations history (list, detail, search, filter)

**Tests:**
- Backend: Input/recommendation creation tests
- iOS: XCTest for ViewModels, UI tests for camera flow

---

### **NEW PHASE 3: Products + Offline + Push**
**Combines original Phases 7, 8, 9**

**Branch:** `phase-3/products-offline-push`
**Issue:** "Phase 3: Products + Offline Mode + Push Notifications"

**Deliverables:**
1. Product browser, detail, comparison
2. Pricing lookup
3. **Offline mode** (queue manager, background sync, conflict resolution)
4. **Push notifications** (APNs, server-side sending, rich notifications)

**Tests:**
- Backend: Product/pricing endpoint tests, push notification tests
- iOS: Offline sync tests, notification handling tests

---

### **NEW PHASE 4: Native Integrations (Widgets + Share + Siri)**
**Combines original Phases 10, 11**

**Branch:** `phase-4/native-integrations`
**Issue:** "Phase 4: Widgets + Share Extension + Siri Shortcuts"

**Deliverables:**
1. Home Screen widgets (small, medium)
2. Lock Screen widgets
3. Share Extension (PDF/image import)
4. Siri Shortcuts integration
5. Spotlight indexing

**Tests:**
- iOS: Widget timeline tests, share extension tests, Siri shortcut tests

---

### **NEW PHASE 5: Polish + Launch**
**Original Phase 12**

**Branch:** `phase-5/polish-launch`
**Issue:** "Phase 5: Polish + App Store Preparation"

**Deliverables:**
1. Haptic feedback
2. Accessibility audit (VoiceOver, Dynamic Type, contrast)
3. Error handling + loading states
4. App Store assets (screenshots, description, privacy labels)
5. TestFlight beta setup
6. App Store submission preparation

**Tests:**
- iOS: Accessibility tests, UI polish verification tests

---

## Execution Strategy

Each phase follows this workflow:

1. **Create GitHub Issue** - Detailed description with acceptance criteria
2. **Create Branch** - From `main` branch
3. **Implement** - Complete all deliverables for the phase
4. **Write Tests** - Both backend (TypeScript) and iOS (XCTest) as applicable
5. **Create PR** - Link to issue, include test results
6. **Code Review** - Ensure quality and alignment with plan
7. **Merge** - After approval, merge to `main`
8. **Move to Next Phase** - Start immediately

**Timeline:** Back-to-back execution, no gaps between phases. Total time depends on implementation speed but phases are ordered by dependency.

---

## Phase 1 Detailed Implementation Plan

**Branch:** `phase-1/api-ios-foundation`
**Issue Title:** "Phase 1: API Refactor + iOS Project Setup + Auth + Core Infrastructure"

### Part A: Backend API Refactor

#### 1. Create Service Layer (`/apps/web/lib/services/`)

**Files to create:**

1. **`/apps/web/lib/services/diagnosis.service.ts`**
   - Extract logic from `/apps/web/app/api/inputs/route.ts` and `/apps/web/app/api/recommendations/route.ts`
   - Functions:
     - `createInput(userId, inputData)` - Validate and store input
     - `generateRecommendation(inputId, userId)` - Run RAG retrieval, call Claude, store result
     - `getInputById(inputId, userId)` - Fetch input with authorization check
   - Dependencies: Prisma, `/lib/retrieval/search.ts`, `/lib/ai/agents/recommendation.ts`

2. **`/apps/web/lib/services/recommendation.service.ts`**
   - Extract logic from `/apps/web/app/api/recommendations/route.ts`, `/apps/web/app/api/recommendations/[id]/route.ts`
   - Functions:
     - `getRecommendations(userId, filters, pagination)` - List with search/filter
     - `getRecommendationById(recommendationId, userId)` - Fetch single
     - `deleteRecommendation(recommendationId, userId)` - Soft delete
     - `reviseRecommendation(recommendationId, userId, feedback)` - Admin revision
   - Dependencies: Prisma

3. **`/apps/web/lib/services/product.service.ts`**
   - Extract logic from `/apps/web/app/api/products/**/*.ts`
   - Functions:
     - `searchProducts(query, filters)` - Search with filters
     - `getProductById(productId)` - Fetch single
     - `compareProducts(productIds)` - LLM comparison
     - `getProductPricing(productIds, region)` - Pricing lookup
   - Dependencies: Prisma, `/lib/ai/product-search.ts`, `/lib/ai/pricing-search.ts`

4. **`/apps/web/lib/services/profile.service.ts`**
   - Extract logic from `/apps/web/app/api/profile/route.ts`
   - Functions:
     - `getProfile(userId)` - Fetch profile
     - `upsertProfile(userId, profileData)` - Create or update
   - Dependencies: Prisma

5. **`/apps/web/lib/services/upload.service.ts`**
   - Extract logic from `/apps/web/app/api/upload/route.ts`
   - Functions:
     - `uploadImage(userId, file)` - Upload to Supabase Storage, return public URL
   - Dependencies: Supabase Storage client

6. **`/apps/web/lib/services/feedback.service.ts`**
   - Extract logic from `/apps/web/app/api/feedback/route.ts`
   - Functions:
     - `submitFeedback(userId, recommendationId, feedbackData)` - Upsert feedback
     - `processFeedbackSignals()` - Trigger learning pipeline
   - Dependencies: Prisma, `/lib/learning/feedback-signal.ts`

7. **`/apps/web/lib/services/retrieval.service.ts`**
   - Extract logic from `/apps/web/app/api/retrieval/search/route.ts`
   - Functions:
     - `searchKnowledge(query, filters)` - Vector search
   - Dependencies: Prisma, `/lib/retrieval/search.ts`

#### 2. Add JWT Auth Support

**Files to modify/create:**

1. **`/apps/web/lib/supabase/server.ts`**
   - Add function: `createClientFromJWT(token: string)` - Initialize Supabase with JWT
   - Keep existing cookie-based auth for web app

2. **`/apps/web/lib/middleware/auth.ts`** (new file)
   - `withAuth(handler, options?)` - Middleware factory
   - Check `Authorization: Bearer <token>` header OR cookie
   - Extract user from Supabase session
   - Return 401 if unauthorized
   - Pass `user` object to handler

#### 3. Version API Endpoints

**Create `/apps/web/app/api/v1/` routes:**

- Copy existing routes to `/api/v1/` structure
- Replace inline logic with service layer calls
- Wrap handlers with `withAuth` middleware
- Add request/response validation with Zod

**New routes:**
- `/api/v1/inputs/route.ts` (POST, GET)
- `/api/v1/inputs/[id]/route.ts` (GET)
- `/api/v1/recommendations/route.ts` (GET)
- `/api/v1/recommendations/[id]/route.ts` (GET, DELETE)
- `/api/v1/products/route.ts` (GET)
- `/api/v1/products/[id]/route.ts` (GET)
- `/api/v1/products/compare/route.ts` (POST)
- `/api/v1/products/pricing/batch/route.ts` (POST)
- `/api/v1/profile/route.ts` (GET, PUT)
- `/api/v1/feedback/route.ts` (POST)
- `/api/v1/upload/route.ts` (POST)
- `/api/v1/retrieval/search/route.ts` (POST)

#### 4. Generate OpenAPI Spec

**Files to create:**

1. **`/apps/web/lib/openapi/generator.ts`** (new file)
   - Use `@asteasolutions/zod-to-openapi` or `tsoa`
   - Generate spec from Zod schemas and route definitions
   - Export to `/public/api/openapi.json`

2. **`/apps/web/app/api/docs/route.ts`** (new file)
   - Serve Swagger UI at `/api/docs`
   - Load OpenAPI spec from `/public/api/openapi.json`

#### 5. Update Configuration

**Files to modify:**

1. **`/apps/web/.env.example`**
   - Add: `SUPABASE_SERVICE_ROLE_KEY` (for admin operations)
   - Add: `API_VERSION=v1`

2. **`.gitignore`**
   - Add Xcode ignores:
     ```
     # Xcode
     apps/ios/DerivedData/
     apps/ios/**/*.xcuserdata
     apps/ios/**/*.xcworkspace/xcuserdata
     apps/ios/.DS_Store
     ```

### Part B: iOS Project Setup

#### 1. Create Xcode Project Structure

**Create `/apps/ios/CropCopilot/` with:**

```
CropCopilot/
├── CropCopilot.xcodeproj/
│   └── project.pbxproj
├── CropCopilot/
│   ├── App/
│   │   ├── CropCopilotApp.swift
│   │   └── AppDelegate.swift
│   ├── Core/
│   │   ├── Network/
│   │   │   ├── APIClient.swift
│   │   │   ├── APIEndpoint.swift
│   │   │   ├── AuthInterceptor.swift
│   │   │   └── NetworkError.swift
│   │   └── Storage/
│   │       ├── KeychainManager.swift
│   │       ├── CoreDataStack.swift
│   │       └── CropCopilot.xcdatamodeld
│   ├── Models/
│   │   ├── User.swift
│   │   ├── UserProfile.swift
│   │   ├── Input.swift
│   │   ├── Recommendation.swift
│   │   └── Product.swift
│   ├── Features/
│   │   └── Auth/
│   │       ├── ViewModels/
│   │       │   └── AuthViewModel.swift
│   │       ├── Views/
│   │       │   ├── LoginView.swift
│   │       │   ├── SignupView.swift
│   │       │   └── BiometricAuthView.swift
│   │       └── Repositories/
│   │           └── AuthRepository.swift
│   ├── Shared/
│   │   ├── Theme/
│   │   │   ├── Colors.swift
│   │   │   └── Fonts.swift
│   │   └── Extensions/
│   │       └── View+Extensions.swift
│   ├── Info.plist
│   └── Assets.xcassets/
├── CropCopilotTests/
│   ├── AuthViewModelTests.swift
│   ├── APIClientTests.swift
│   └── AuthRepositoryTests.swift
└── README.md
```

#### 2. Configure Swift Package Dependencies

**Add to Xcode project (Package.swift or SPM):**

1. `supabase-swift` - https://github.com/supabase/supabase-swift
2. `Kingfisher` - https://github.com/onevcat/Kingfisher
3. `SwiftUIIntrospect` - https://github.com/siteline/swiftui-introspect (optional)

#### 3. Implement Core Network Layer

**Key files:**

1. **`APIClient.swift`**
   - Generic `request<T: Codable>()` method
   - Auto-inject auth header via `AuthInterceptor`
   - Error handling, retry logic
   - Base URL from env config

2. **`APIEndpoint.swift`**
   - Enum for all endpoints
   - URL construction
   - HTTP method, headers, body

3. **`AuthInterceptor.swift`**
   - Inject `Authorization: Bearer <token>` header
   - Handle 401 responses (refresh token, retry)

4. **`NetworkError.swift`**
   - Error types: unauthorized, notFound, serverError, noInternet, timeout, decodingError

#### 4. Implement Core Storage Layer

**Key files:**

1. **`KeychainManager.swift`**
   - `saveToken(_ token: String, for key: String)` - Save to Keychain
   - `getToken(for key: String) -> String?` - Retrieve from Keychain
   - `deleteToken(for key: String)` - Remove from Keychain
   - Keys: `accessToken`, `refreshToken`

2. **`CoreDataStack.swift`**
   - `NSPersistentContainer` setup
   - In-memory store for previews
   - Persistent store for production
   - Background context for sync operations

3. **`CropCopilot.xcdatamodeld`** (Core Data schema)
   - Entities: `RecommendationEntity`, `ProductEntity`, `UserProfileEntity`, `PendingInputEntity`

#### 5. Implement Auth Flow

**Key files:**

1. **`AuthViewModel.swift`**
   - `signIn(email: String, password: String)` - Call Supabase auth
   - `signUp(email: String, password: String)` - Create account
   - `signInWithApple()` - Apple Sign In flow
   - `signOut()` - Clear tokens, navigate to login
   - `refreshToken()` - Refresh expired token
   - `@Published var isAuthenticated: Bool`
   - `@Published var errorMessage: String?`

2. **`AuthRepository.swift`**
   - Wrapper around Supabase Swift SDK
   - `signIn()`, `signUp()`, `signOut()`, `refreshSession()`
   - Save tokens to Keychain

3. **`LoginView.swift`**
   - Email/password form
   - "Sign in with Apple" button
   - "Forgot password?" link
   - "Sign up" navigation

4. **`SignupView.swift`**
   - Email/password form
   - Password confirmation
   - Terms of service checkbox
   - "Sign in" navigation

5. **`BiometricAuthView.swift`**
   - Face ID / Touch ID prompt
   - Fallback to password if biometric fails
   - LocalAuthentication framework integration

#### 6. Implement Swift Models

**Key files (all `Codable`):**

1. **`User.swift`** - `id`, `email`
2. **`UserProfile.swift`** - `userId`, `location`, `farmSize`, `cropsOfInterest`, `experienceLevel`
3. **`Input.swift`** - `id`, `type`, `imageUrl`, `description`, `labData`, `crop`, `location`, `season`
4. **`Recommendation.swift`** - `id`, `inputId`, `diagnosis`, `confidence`, `products`, `sources`
5. **`Product.swift`** - `id`, `name`, `type`, `description`, `analysis`

### Part C: Integration Tests

#### Backend Tests

**Create `/apps/web/__tests__/api/v1/`:**

1. **`inputs.test.ts`**
   - Test POST `/api/v1/inputs` (create input)
   - Test GET `/api/v1/inputs` (list inputs)
   - Test GET `/api/v1/inputs/:id` (fetch single)
   - Test auth failures (401 without token)

2. **`recommendations.test.ts`**
   - Test GET `/api/v1/recommendations` (list)
   - Test GET `/api/v1/recommendations/:id` (fetch single)
   - Test DELETE `/api/v1/recommendations/:id` (soft delete)

3. **`products.test.ts`**
   - Test GET `/api/v1/products` (search)
   - Test GET `/api/v1/products/:id` (fetch single)
   - Test POST `/api/v1/products/compare` (comparison)

4. **`profile.test.ts`**
   - Test GET `/api/v1/profile` (fetch)
   - Test PUT `/api/v1/profile` (upsert)

5. **`upload.test.ts`**
   - Test POST `/api/v1/upload` (image upload)
   - Mock Supabase Storage

6. **`auth.test.ts`**
   - Test JWT token validation
   - Test token refresh
   - Test 401 handling

**Test setup:**
- Use Vitest or Jest
- Mock Supabase auth
- Use test database (Prisma test environment)
- Mock external APIs (Claude, Supabase Storage)

#### iOS Tests

**Create `/apps/ios/CropCopilotTests/`:**

1. **`AuthViewModelTests.swift`**
   - Test sign in success/failure
   - Test sign up success/failure
   - Test token storage
   - Mock `AuthRepository`

2. **`APIClientTests.swift`**
   - Test request success
   - Test auth header injection
   - Test error handling (401, 500, network error)
   - Test retry logic
   - Mock `URLSession`

3. **`AuthRepositoryTests.swift`**
   - Test Supabase auth calls
   - Test token refresh
   - Test Keychain storage
   - Mock Supabase Swift SDK

4. **`KeychainManagerTests.swift`**
   - Test save/get/delete token
   - Test Keychain errors

**Test setup:**
- Use XCTest framework
- Mock dependencies with protocols
- Use `@testable import CropCopilot`

### Part D: GitHub Issue & PR Template

**GitHub Issue Description:**

```markdown
## Phase 1: API Refactor + iOS Project Setup + Auth + Core Infrastructure

### Objectives
- Refactor Next.js API routes into shared service layer
- Add JWT bearer token auth for mobile clients
- Version API endpoints under `/api/v1/`
- Generate OpenAPI spec
- Create iOS Xcode project at `/apps/ios/`
- Implement iOS authentication (email/password, Apple Sign In, Face ID)
- Build core iOS infrastructure (API client, Core Data, Keychain)

### Deliverables

**Backend:**
- [ ] Service layer (`/lib/services/`) with 7 service files
- [ ] JWT auth middleware (`/lib/middleware/auth.ts`)
- [ ] Versioned API routes (`/app/api/v1/`)
- [ ] OpenAPI spec generation (`/lib/openapi/`, `/public/api/openapi.json`)
- [ ] Swagger UI at `/api/docs`
- [ ] Backend integration tests (Vitest)

**iOS:**
- [ ] Xcode project structure at `/apps/ios/CropCopilot/`
- [ ] Swift Package Manager dependencies (supabase-swift, Kingfisher)
- [ ] Core network layer (APIClient, AuthInterceptor, NetworkError)
- [ ] Core storage layer (KeychainManager, CoreDataStack)
- [ ] Auth ViewModels and Views (Login, Signup, Biometric)
- [ ] Swift models (User, UserProfile, Input, Recommendation, Product)
- [ ] iOS unit tests (XCTest)

**Configuration:**
- [ ] Update `.gitignore` for Xcode
- [ ] Update `.env.example`
- [ ] Update root README.md with iOS setup instructions

### Acceptance Criteria
- [ ] All backend service layer functions have unit tests
- [ ] All `/api/v1/*` endpoints return correct responses
- [ ] JWT token auth works (tested with Postman/Bruno)
- [ ] OpenAPI spec validates in Swagger UI
- [ ] iOS app builds successfully in Xcode
- [ ] iOS login flow works (save tokens to Keychain)
- [ ] iOS API client can call `/api/v1/profile` with JWT token
- [ ] All tests pass (backend + iOS)

### Testing Instructions
**Backend:**
```bash
cd apps/web
pnpm test
```

**iOS:**
```bash
cd apps/ios
xcodebuild test -scheme CropCopilot -destination 'platform=iOS Simulator,name=iPhone 15'
```

### Out of Scope
- Camera implementation (Phase 2)
- Offline mode (Phase 3)
- Push notifications (Phase 3)
- Widgets (Phase 4)
```

**PR Title:** `Phase 1: API Refactor + iOS Project Setup + Auth + Core Infrastructure`

**PR Description Template:**

```markdown
## Changes
Implements Phase 1 of the iOS native app development plan.

### Backend
- Extracted business logic into service layer (`/lib/services/`)
- Added JWT bearer token auth alongside existing cookie auth
- Created versioned API endpoints under `/api/v1/`
- Generated OpenAPI spec at `/public/api/openapi.json`
- Added Swagger UI at `/api/docs`

### iOS
- Created Xcode project at `/apps/ios/CropCopilot/`
- Implemented authentication flow (email/password, Apple Sign In, Face ID)
- Built core infrastructure (API client, Core Data, Keychain)
- Created Swift models matching Prisma schema

### Tests
- Backend: Integration tests for all `/api/v1/*` endpoints
- iOS: Unit tests for AuthViewModel, APIClient, Repositories

## Testing
- [ ] Backend tests pass (`pnpm test`)
- [ ] iOS tests pass (`xcodebuild test`)
- [ ] Manual testing: Login flow works on iOS Simulator
- [ ] Manual testing: API client can call `/api/v1/profile` with JWT token

## Screenshots
(Attach screenshots of iOS login screen, Swagger UI)

## Checklist
- [ ] Code follows project conventions
- [ ] Tests added and passing
- [ ] OpenAPI spec validates
- [ ] README.md updated with iOS setup instructions
- [ ] No breaking changes to existing web app

Closes #[issue-number]
```

### Part E: Verification Steps

**After merging Phase 1, verify:**

1. **Backend API:**
   ```bash
   # Get JWT token from Supabase
   curl -X POST https://your-project.supabase.co/auth/v1/token \
     -H "Content-Type: application/json" \
     -d '{"email":"test@example.com","password":"password"}'

   # Call versioned API with JWT
   curl -X GET http://localhost:3000/api/v1/profile \
     -H "Authorization: Bearer <token>"
   ```

2. **OpenAPI Spec:**
   - Visit `http://localhost:3000/api/docs`
   - Verify all endpoints documented
   - Test an endpoint via Swagger UI

3. **iOS App:**
   - Open `/apps/ios/CropCopilot.xcodeproj` in Xcode
   - Build and run on Simulator
   - Test login with email/password
   - Verify token saved to Keychain (use Xcode debugger)
   - Test Face ID on device (if available)

4. **Tests:**
   ```bash
   # Backend
   cd apps/web
   pnpm test

   # iOS
   cd apps/ios
   xcodebuild test -scheme CropCopilot -destination 'platform=iOS Simulator,name=iPhone 15'
   ```

---

## Risk Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Apple rejects app (guidelines) | Low | High | Follow HIG, declare permissions clearly, no web-view-only screens |
| Supabase Swift SDK limitations | Medium | Medium | SDK is mature; fallback to raw REST calls if needed |
| Offline sync conflicts | Medium | High | Last-write-wins for profile; append-only for diagnoses; conflict UI for edge cases |
| Apple tax kills unit economics | Medium | Medium | Offer web signup flow; Apple allows linking to website for account management |
| Maintaining 3 platforms (web, iOS, PWA) | High | High | Shared service layer + feature flags. Accept that iOS will lag web by 1-2 sprints |
| Low iOS adoption | Medium | Medium | Validate with TestFlight beta before full investment. If <10% of users are on iOS, PWA may suffice |

---

**Total Checklist Items:** 200+ tasks across 5 consolidated phases

**Success Criteria:**
- Farmers can capture soil photos in the field with no connectivity and get diagnoses when they return to WiFi
- Camera experience is noticeably better than web app (framing guides, manual controls, high-quality images)
- App Store rating ≥4.5 stars after 3 months
- iOS app adoption ≥15% of total user base within 6 months

---

## Important Implementation Notes

### iOS Project Structure in Monorepo

The iOS Xcode project will be created at `/apps/ios/CropCopilot/` with the following structure:

```
/apps/ios/
├── CropCopilot.xcodeproj/         # Xcode project file
├── CropCopilot/                   # Main app target
│   ├── App/
│   ├── Core/
│   ├── Features/
│   ├── Shared/
│   ├── Info.plist
│   └── Assets.xcassets/
├── CropCopilotTests/              # XCTest unit tests
├── CropCopilotUITests/            # XCTest UI tests
├── CropCopilotShare/              # Share Extension target
├── SoilHealthWidget/              # Widget Extension target
└── README.md
```

### Repository Configuration Updates

**Phase 1 will also update:**
- Root `package.json` - Add iOS-related scripts if needed
- `.gitignore` - Add Xcode-specific ignores (DerivedData, xcuserdata, etc.)
- `turbo.json` (if using Turborepo) - Configure iOS build pipeline
- GitHub Actions (if present) - Add iOS build/test workflow

### Testing Strategy

**Backend Tests (TypeScript):**
- Location: `/apps/web/__tests__/api/v1/`
- Framework: Vitest or Jest
- Coverage: All `/api/v1/*` endpoints, service layer functions
- Run with: `pnpm test` or `npm test`

**iOS Tests (Swift):**
- Location: `/apps/ios/CropCopilotTests/`
- Framework: XCTest
- Coverage: ViewModels, Repositories, API client, auth flows
- Run with: `xcodebuild test` or Xcode Test Navigator

### Device Testing Requirements

The following iOS features **require physical device testing** (cannot be tested in Simulator):
- Camera capture (AVFoundation)
- Face ID / Touch ID
- Push notifications (APNs)
- Widgets (can preview in Simulator but require device for full testing)
- Share Extension
- Siri Shortcuts

**Recommendation:** Use iPhone 12 or newer running iOS 16+ for testing. iPad testing optional but recommended for Phase 5.

### Apple Developer Requirements

To complete Phases 4-5, you'll need:
- **Apple Developer Program membership** ($99/year)
- **App Store Connect access** for TestFlight and submission
- **Provisioning profiles** for device testing
- **Push notification certificate/key** for APNs (Phase 3)

These can be set up during Phase 3-4 implementation.
