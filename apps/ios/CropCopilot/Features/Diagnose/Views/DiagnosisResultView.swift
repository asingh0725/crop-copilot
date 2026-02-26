//
//  DiagnosisResultView.swift
//  CropCopilot
//
//  Created by Claude Code on Phase 2
//

import SwiftUI

enum FeedbackStage: String, Identifiable {
    case basic
    case detailed
    case outcome

    var id: String { rawValue }
}

private enum OutcomeSelection {
    case success
    case failure
}

private enum RecommendationSection: String, Hashable {
    case input
    case diagnosis
    case actions
    case premium
    case products
}

private enum CitationSheetDetent: CGFloat, CaseIterable {
    case compact = 0.42
    case medium = 0.66
    case expanded = 0.9
}

private struct CitationItem: Identifiable, Hashable {
    let id: String
    let title: String
    let url: String?
    let excerpt: String?
    let relevance: Double?
}

private struct MergedRecommendationProduct: Identifiable {
    let id: String
    let productId: String?
    let name: String
    let type: String
    let applicationRate: String?
    let reason: String?
}

private let feedbackIssues = [
    "Recommendations felt too generic",
    "Diagnosis did not match symptoms",
    "Actions were unclear",
    "Sources were weak or irrelevant",
    "Timing guidance was unrealistic",
]

struct DiagnosisResultView: View {
    let recommendationId: String

    @StateObject private var viewModel = DiagnosisResultViewModel()
    @Environment(\.openURL) private var openURL

    @State private var activeFeedbackStage: FeedbackStage?
    @State private var quickHelpful: Bool?
    @State private var quickRating = 0
    @State private var quickComments = ""
    @State private var detailedAccuracy = 0
    @State private var detailedNotes = ""
    @State private var selectedIssues: Set<String> = []
    @State private var outcomeSelection: OutcomeSelection?
    @State private var outcomeNotes = ""
    @State private var isSubmittingFeedback = false
    @State private var feedbackErrorMessage: String?
    @State private var feedbackSuccessMessage: String?
    @State private var expandedSections: Set<RecommendationSection> = [
        .input,
        .diagnosis,
        .actions,
        .premium,
    ]
    @State private var showCitationsModal = false
    @State private var citationDetent: CitationSheetDetent = .medium
    @State private var showProductNoticeAlert = false
    @State private var hasAcknowledgedProductNotice = false

    private var hasActiveModal: Bool {
        activeFeedbackStage != nil || showCitationsModal
    }

    var body: some View {
        ZStack {
            Group {
                if viewModel.isLoading {
                    loadingView
                } else if let detail = viewModel.recommendation {
                    resultContent(detail)
                } else if let error = viewModel.errorMessage {
                    errorView(error)
                }
            }
            // Disable all background tap targets while any modal is presented.
            .allowsHitTesting(!hasActiveModal)

            if hasActiveModal {
                // .contentShape(Rectangle()) ensures the full overlay area absorbs taps
                // even where the translucent fill renders as "empty" space.
                Color.black.opacity(0.38)
                    .ignoresSafeArea()
                    .contentShape(Rectangle())
                    .onTapGesture {}
                    .transition(.opacity)
            }

            if showCitationsModal {
                citationsModal
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }

            if let stage = activeFeedbackStage {
                feedbackModalContainer(for: stage)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .navigationTitle("Diagnosis Result")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            hasAcknowledgedProductNotice = UserDefaults.standard.bool(forKey: productNoticeKey)
            await viewModel.loadRecommendation(id: recommendationId)
            applyFeedbackSnapshot(viewModel.feedback)
            presentSuggestedModalIfNeeded()
        }
        .onChange(of: viewModel.feedback?.updatedAt ?? "") { _ in
            applyFeedbackSnapshot(viewModel.feedback)
        }
        .onChange(of: viewModel.nextSuggestedStage?.rawValue ?? "") { _ in
            presentSuggestedModalIfNeeded()
        }
        .animation(.easeInOut(duration: 0.18), value: activeFeedbackStage?.rawValue ?? "")
        .animation(.easeInOut(duration: 0.18), value: showCitationsModal)
        .sheet(isPresented: $showProductNoticeAlert) {
            productNoticeSheet
                .presentationDetents([.height(280)])
                .presentationDragIndicator(.visible)
        }
    }

    private var productNoticeSheet: some View {
        VStack(alignment: .leading, spacing: Spacing.lg) {
            HStack(spacing: Spacing.sm) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .font(.title3)
                    .foregroundStyle(.orange)
                Text("Important Notice")
                    .font(.headline)
                    .foregroundStyle(.primary)
                Spacer()
            }

            Text(
                "Product recommendations are informational only. Verify registration for your region and crop, follow label instructions, and comply with local regulations before applying any product."
            )
            .font(.subheadline)
            .foregroundStyle(.secondary)
            .fixedSize(horizontal: false, vertical: true)

            Spacer(minLength: 0)

            HStack(spacing: Spacing.sm) {
                Button("Not Now") {
                    showProductNoticeAlert = false
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, Spacing.sm)
                .background(Color.appSecondaryBackground)
                .foregroundStyle(.primary)
                .clipShape(RoundedRectangle(cornerRadius: CornerRadius.md, style: .continuous))
                .buttonStyle(.plain)

                Button("Understood") {
                    showProductNoticeAlert = false
                    hasAcknowledgedProductNotice = true
                    UserDefaults.standard.set(true, forKey: productNoticeKey)
                    expandedSections.insert(.products)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, Spacing.sm)
                .background(Color.appPrimary)
                .foregroundStyle(.black)
                .clipShape(RoundedRectangle(cornerRadius: CornerRadius.md, style: .continuous))
                .buttonStyle(.plain)
            }
            .font(.subheadline.weight(.semibold))
        }
        .padding(Spacing.xl)
        .padding(.top, Spacing.sm)
    }

    private var loadingView: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Spacing.lg) {
                // Skeleton confidence header
                SkeletonCard(height: 110, cornerRadius: CornerRadius.lg)

                // Skeleton sections
                ForEach(0..<3, id: \.self) { _ in
                    VStack(alignment: .leading, spacing: Spacing.sm) {
                        SkeletonLine(width: 120, height: 18)
                        SkeletonLine(height: 13)
                        SkeletonLine(height: 13)
                        SkeletonLine(width: 180, height: 13)
                    }
                    .padding(Spacing.lg)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .antigravityGlass(cornerRadius: CornerRadius.lg)
                }
            }
            .padding(Spacing.lg)
        }
    }

    private func errorView(_ error: String) -> some View {
        VStack(spacing: 16) {
            Image(systemName: "exclamationmark.triangle")
                .font(.largeTitle)
                .foregroundColor(.orange)
            Text(error)
                .font(.body)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            Button("Retry") {
                Task { await viewModel.loadRecommendation(id: recommendationId) }
            }
            .buttonStyle(.borderedProminent)
        }
        .padding()
    }

    private func resultContent(_ detail: RecommendationDetailResponse) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                confidenceHeader(detail)

                collapsibleSection(
                    "Input",
                    section: .input
                ) {
                    inputSummaryContent(detail)
                }

                collapsibleSection(
                    "Diagnosis",
                    section: .diagnosis,
                    accessory: citationsButton(detail)
                ) {
                    diagnosisContent(detail)
                }

                collapsibleSection(
                    "Recommended Actions",
                    section: .actions,
                    accessory: citationsButton(detail)
                ) {
                    actionsContent(detail)
                }

                collapsibleSection(
                    "Premium Insights",
                    section: .premium
                ) {
                    premiumContent(detail)
                }

                collapsibleSection(
                    "Product Recommendations",
                    section: .products
                ) {
                    productsContent(detail)
                }
            }
            .padding()
            .padding(.bottom, 24)
        }
    }

    private func confidenceHeader(_ detail: RecommendationDetailResponse) -> some View {
        HStack(alignment: .center, spacing: Spacing.md) {
            VStack(alignment: .leading, spacing: 6) {
                Text(prettyConditionType(detail.diagnosis.diagnosis.conditionType))
                    .font(.appMicro)
                    .foregroundStyle(.white.opacity(0.60))
                    .textCase(.uppercase)

                Text(detail.diagnosis.diagnosis.condition)
                    .font(.headline)
                    .foregroundStyle(.white)
                    .lineLimit(3)
                    .fixedSize(horizontal: false, vertical: true)

                if let crop = detail.input.crop {
                    Label(AppConstants.cropLabel(for: crop), systemImage: "leaf.fill")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.white.opacity(0.72))
                }
            }

            Spacer(minLength: Spacing.sm)

            // Dark-mode confidence ring — white text, colored arc, no opaque pill background
            heroConfidenceArc(detail.confidence)
        }
        .padding(Spacing.lg)
        .heroGradientCard()
    }

    /// Confidence ring styled for dark hero card backgrounds.
    /// Uses white percentage text and a light track — no opaque background pill.
    private func heroConfidenceArc(_ confidence: Double) -> some View {
        let level = ConfidenceLevel.from(confidence)
        let clamped = min(max(confidence, 0), 1)
        let pct = Int((clamped * 100).rounded())

        return VStack(spacing: 5) {
            ZStack {
                Circle()
                    .stroke(.white.opacity(0.18), lineWidth: 5.5)
                    .frame(width: 64, height: 64)

                Circle()
                    .trim(from: 0, to: clamped)
                    .stroke(
                        level.foreground,
                        style: StrokeStyle(lineWidth: 5.5, lineCap: .round)
                    )
                    .rotationEffect(.degrees(-90))
                    .frame(width: 64, height: 64)

                Text("\(pct)%")
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(.white)
                    .monospacedDigit()
            }
            .pulseGlow(color: level.foreground, radius: 14, duration: 3.0)

            Text(level.title)
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(.white.opacity(0.70))
                .lineLimit(1)
        }
    }

    @ViewBuilder
    private func collapsibleSection<Content: View>(
        _ title: String,
        section: RecommendationSection,
        accessory: some View = EmptyView(),
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Button {
                toggle(section: section)
            } label: {
                HStack(spacing: 10) {
                    Text(title)
                        .font(.title3.weight(.semibold))
                        .foregroundStyle(.primary)
                    Spacer()
                    accessory
                    Image(systemName: "chevron.right")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.secondary)
                        .rotationEffect(.degrees(isExpanded(section) ? 90 : 0))
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 14)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            if isExpanded(section) {
                Divider().padding(.horizontal, 16)
                VStack(alignment: .leading, spacing: 12) {
                    content()
                }
                .padding(16)
                .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .antigravityGlass(cornerRadius: 14)
    }

    private func inputSummaryContent(_ detail: RecommendationDetailResponse) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 12) {
                if let imageUrl = detail.input.imageUrl {
                    SecureAsyncImage(source: imageUrl) { image in
                        image
                            .resizable()
                            .scaledToFill()
                    } placeholder: {
                        ProgressView().tint(Color.appPrimary)
                    } failure: {
                        ZStack {
                            Color.appSecondaryBackground
                            Image(systemName: "photo")
                                .foregroundStyle(.secondary)
                        }
                    }
                    .frame(width: 96, height: 96)
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .stroke(.black.opacity(0.08), lineWidth: 0.8)
                    )
                } else {
                    // Lab report — no photo by design; show a themed icon thumbnail
                    ZStack {
                        LinearGradient(
                            stops: [
                                .init(color: Color.appEarth800, location: 0),
                                .init(color: Color.appEarth950, location: 1),
                            ],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                        Image(systemName: "flask.fill")
                            .font(.system(size: 30))
                            .foregroundStyle(Color.appPrimary.opacity(0.75))
                    }
                    .frame(width: 96, height: 96)
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .stroke(Color.appPrimary.opacity(0.15), lineWidth: 0.8)
                    )
                }

                VStack(alignment: .leading, spacing: 6) {
                    if let crop = detail.input.crop {
                        Text("Crop: \(AppConstants.cropLabel(for: crop))")
                            .font(.body.weight(.semibold))
                            .foregroundStyle(.primary)
                    }
                    if let location = detail.input.location {
                        Text("Location: \(location)")
                            .font(.body)
                            .foregroundStyle(.secondary)
                    }
                    if let season = detail.input.season {
                        Text("Season: \(season)")
                            .font(.body)
                            .foregroundStyle(.secondary)
                    }
                }
                Spacer()
            }

            if let description = detail.input.description, !description.isEmpty {
                Text(description)
                    .font(.body)
                    .foregroundStyle(.secondary)
                    .lineSpacing(3)
            }
        }
    }

    private func diagnosisContent(_ detail: RecommendationDetailResponse) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(detail.diagnosis.diagnosis.condition)
                .font(.title3.weight(.semibold))
                .foregroundStyle(.primary)

            Text(detail.diagnosis.diagnosis.reasoning)
                .font(.body)
                .foregroundStyle(.secondary)
                .lineSpacing(4)

            if let severity = detail.diagnosis.diagnosis.severity,
               !severity.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                Text("Severity: \(severity)")
                    .font(.body.weight(.medium))
                    .foregroundStyle(.primary)
            }

            if let differential = detail.diagnosis.diagnosis.differentialDiagnosis,
               !differential.isEmpty {
                Text("Differential: \(differential.joined(separator: ", "))")
                    .font(.body)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private func actionsContent(_ detail: RecommendationDetailResponse) -> some View {
        let actions = detail.diagnosis.recommendations
        return VStack(alignment: .leading, spacing: Spacing.sm) {
            if actions.isEmpty {
                Text("No specific action set was generated for this recommendation.")
                    .font(.body)
                    .foregroundStyle(.secondary)
            } else {
                ForEach(actions) { action in
                    HStack(spacing: 0) {
                        // Urgency accent bar — red=Immediate, orange=Soon, earth=Monitor
                        RoundedRectangle(cornerRadius: 2, style: .continuous)
                            .fill(urgencyColor(timing: action.timing, priority: action.priority))
                            .frame(width: 4)
                            .padding(.vertical, Spacing.xs)
                            .padding(.leading, Spacing.xs)

                        VStack(alignment: .leading, spacing: Spacing.sm) {
                            HStack(alignment: .top, spacing: Spacing.sm) {
                                Image(systemName: iconForAction(action.action))
                                    .font(.body.weight(.semibold))
                                    .foregroundStyle(urgencyColor(timing: action.timing, priority: action.priority))
                                    .frame(width: 22, alignment: .center)

                                Text(action.action)
                                    .font(.subheadline.weight(.semibold))
                                    .foregroundStyle(.primary)
                            }

                            Text(action.details)
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                                .lineSpacing(3)

                            HStack(spacing: Spacing.sm) {
                                timingChip(action.timing)
                                priorityChip(action.priority)
                            }
                        }
                        .padding(Spacing.md)
                    }
                    .antigravityGlass(cornerRadius: CornerRadius.md)
                }
            }
        }
    }

    private func productsContent(_ detail: RecommendationDetailResponse) -> some View {
        let products = mergedProducts(detail)

        return VStack(alignment: .leading, spacing: 10) {
            if products.isEmpty {
                Text("No product recommendations were attached to this run yet.")
                    .font(.body)
                    .foregroundStyle(.secondary)
            } else {
                ForEach(products) { product in
                    if isNavigableProductId(product.productId), let productId = product.productId {
                        NavigationLink {
                            ProductDetailView(productId: productId)
                        } label: {
                            productRow(product, showChevron: true)
                        }
                        .buttonStyle(.plain)
                    } else {
                        productRow(product, showChevron: false)
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func premiumContent(_ detail: RecommendationDetailResponse) -> some View {
        let premium = detail.premium
        let normalizedStatus = premium.status.lowercased()

        if normalizedStatus == "not_available" {
            VStack(alignment: .leading, spacing: Spacing.sm) {
                Text("Grower Pro required")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.primary)
                Text(
                    "Upgrade to Grower Pro to unlock application risk review, cost optimization, spray-window alerts, and a one-tap application prep packet."
                )
                .font(.subheadline)
                .foregroundStyle(.secondary)
            }
            .padding(Spacing.md)
            .frame(maxWidth: .infinity, alignment: .leading)
            .antigravityGlass(cornerRadius: CornerRadius.md)
        } else if normalizedStatus == "queued" || normalizedStatus == "processing" {
            VStack(alignment: .leading, spacing: Spacing.sm) {
                Label("Premium risk review is \(premium.status).", systemImage: "hourglass")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.primary)
                ProgressView()
                    .tint(Color.appPrimary)
                Text("This runs asynchronously and does not block base recommendations.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .padding(Spacing.md)
            .frame(maxWidth: .infinity, alignment: .leading)
            .antigravityGlass(cornerRadius: CornerRadius.md)
        } else if normalizedStatus == "failed" {
            VStack(alignment: .leading, spacing: Spacing.sm) {
                Label("Premium analysis failed", systemImage: "exclamationmark.triangle.fill")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Color.semanticError)
                Text(premium.failureReason ?? "Unknown failure.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            .padding(Spacing.md)
            .frame(maxWidth: .infinity, alignment: .leading)
            .antigravityGlass(cornerRadius: CornerRadius.md)
        } else if normalizedStatus == "ready" {
            VStack(alignment: .leading, spacing: Spacing.sm) {
                HStack(spacing: Spacing.sm) {
                    Text("Risk review: \(riskReviewLabel(premium.riskReview))")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(premiumDecisionColor(premium.riskReview))
                    Spacer()
                }
                .padding(Spacing.sm)
                .background(premiumDecisionColor(premium.riskReview).opacity(0.12))
                .clipShape(RoundedRectangle(cornerRadius: CornerRadius.md, style: .continuous))

                if let cost = premium.costAnalysis {
                    HStack(spacing: Spacing.md) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Per-acre cost")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            Text(formatUsd(cost.perAcreTotalUsd))
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(.primary)
                        }
                        Spacer()
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Whole-field cost")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            Text(formatUsd(cost.wholeFieldTotalUsd))
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(.primary)
                        }
                    }
                    .padding(Spacing.sm)
                    .antigravityGlass(cornerRadius: CornerRadius.md)
                }

                if !premium.checks.isEmpty {
                    VStack(alignment: .leading, spacing: Spacing.xs) {
                        Text("Risk checks (advisory)")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.secondary)
                        ForEach(premium.checks.prefix(4)) { check in
                            VStack(alignment: .leading, spacing: 3) {
                                Text("\(check.title) (\(riskReviewLabel(check.result)))")
                                    .font(.caption.weight(.semibold))
                                    .foregroundStyle(checkResultColor(check.result))
                                Text(check.message)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            .padding(Spacing.sm)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .antigravityGlass(cornerRadius: CornerRadius.md)
                        }
                    }
                }

                if let advisoryNotice = premium.advisoryNotice, !advisoryNotice.isEmpty {
                    Text(advisoryNotice)
                        .font(.caption)
                        .foregroundStyle(Color.semanticWarning)
                        .padding(Spacing.sm)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Color.semanticWarning.opacity(0.12))
                        .clipShape(RoundedRectangle(cornerRadius: CornerRadius.md, style: .continuous))
                }

                if !premium.sprayWindows.isEmpty {
                    VStack(alignment: .leading, spacing: Spacing.xs) {
                        Text("Spray windows")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.secondary)
                        ForEach(premium.sprayWindows.prefix(3)) { window in
                            VStack(alignment: .leading, spacing: 3) {
                                Text(formattedDateRange(start: window.startsAt, end: window.endsAt))
                                    .font(.caption.weight(.semibold))
                                    .foregroundStyle(.primary)
                                Text("Score \(window.score) · \(window.summary)")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            .padding(Spacing.sm)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .antigravityGlass(cornerRadius: CornerRadius.md)
                        }
                    }
                }

                if let report = premium.report {
                    VStack(alignment: .leading, spacing: Spacing.xs) {
                        Text("Application prep packet")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.secondary)
                        HStack(spacing: Spacing.sm) {
                            if let htmlUrl = report.htmlUrl, let url = URL(string: htmlUrl) {
                                Button {
                                    openURL(url)
                                } label: {
                                    Text("Open HTML")
                                }
                                .buttonStyle(.bordered)
                            }
                            if let pdfUrl = report.pdfUrl, let url = URL(string: pdfUrl) {
                                Button {
                                    openURL(url)
                                } label: {
                                    Text("Open PDF")
                                }
                                .buttonStyle(.bordered)
                            }
                            if report.html == nil && report.htmlUrl == nil && report.pdfUrl == nil {
                                Text("Report generated.")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            }
        } else {
            Text("Premium status: \(premium.status)")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
    }

    private func productRow(_ product: MergedRecommendationProduct, showChevron: Bool) -> some View {
        HStack(spacing: Spacing.md) {
            IconBadge(
                icon: iconForProductType(product.type),
                color: .forProductType(product.type),
                size: 40,
                cornerRadius: 12
            )

            VStack(alignment: .leading, spacing: 4) {
                Text(product.name)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.primary)
                    .lineLimit(2)

                ProductTypeBadge(type: product.type)

                if let rate = product.applicationRate, !rate.isEmpty {
                    Text("Rate: \(rate)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                if let reason = product.reason, !reason.isEmpty {
                    Text(reason)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineSpacing(2)
                        .lineLimit(3)
                }
            }

            Spacer(minLength: 0)

            if showChevron {
                Image(systemName: "chevron.right")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(.secondary)
                    .frame(width: 22, height: 22)
                    .background(Color.appSecondaryBackground)
                    .clipShape(Circle())
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Spacing.md)
        .antigravityGlass(cornerRadius: CornerRadius.md)
        .contentShape(RoundedRectangle(cornerRadius: CornerRadius.md, style: .continuous))
    }

    private func timingChip(_ timing: String) -> some View {
        let compactTiming = timing
            .components(separatedBy: " - ")
            .first?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let displayValue = (compactTiming?.isEmpty == false) ? compactTiming! : timing
        let color = timingColor(timing)
        return Label(displayValue, systemImage: "clock")
            .font(.caption.weight(.semibold))
            .foregroundStyle(color)
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(color.opacity(0.12))
            .clipShape(Capsule())
            .overlay(Capsule().stroke(color.opacity(0.28), lineWidth: 0.8))
    }

    private func timingColor(_ timing: String) -> Color {
        let lower = timing.lowercased()
        if lower.contains("immediate") || lower.contains("urgent") { return Color.semanticError }
        if lower.contains("day") || lower.contains("week") || lower.contains("soon") { return Color.semanticWarning }
        return Color.appSecondary
    }

    private func priorityChip(_ priority: String) -> some View {
        let normalized = priority
            .replacingOccurrences(of: "_", with: " ")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let label = normalized.isEmpty ? "Standard" : normalized.capitalized
        let color = priorityColor(normalized)
        return Text(label)
            .font(.caption.weight(.semibold))
            .foregroundStyle(color)
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(color.opacity(0.12))
            .clipShape(Capsule())
            .overlay(Capsule().stroke(color.opacity(0.28), lineWidth: 0.8))
    }

    private func priorityColor(_ priority: String) -> Color {
        switch priority.lowercased() {
        case "critical", "immediate":        return Color.semanticError
        case "soon", "high", "urgent":       return Color.semanticWarning
        default:                             return Color.appSecondary
        }
    }

    private func urgencyColor(timing: String, priority: String) -> Color {
        let combined = "\(timing) \(priority)".lowercased()
        if combined.contains("immediate") || combined.contains("urgent") || combined.contains("critical") {
            return Color.semanticError
        }
        if combined.contains("day") || combined.contains("soon") || combined.contains("high") || combined.contains("week") {
            return Color.semanticWarning
        }
        return Color.appSecondary
    }

    private func premiumDecisionColor(_ decision: String?) -> Color {
        switch decision?.lowercased() {
        case "clear_signal", "pass":
            return Color.semanticSuccess
        case "potential_conflict", "block":
            return Color.semanticError
        case "needs_manual_verification", "review":
            return Color.semanticWarning
        default:
            return Color.appSecondary
        }
    }

    private func riskReviewLabel(_ decision: String?) -> String {
        switch decision?.lowercased() {
        case "clear_signal", "pass":
            return "Clear Signal"
        case "potential_conflict", "block":
            return "Potential Conflict"
        case "needs_manual_verification", "review":
            return "Needs Manual Verification"
        default:
            return "N/A"
        }
    }

    private func checkResultColor(_ result: String) -> Color {
        switch result.lowercased() {
        case "clear_signal", "pass":
            return Color.semanticSuccess
        case "potential_conflict", "block":
            return Color.semanticError
        case "needs_manual_verification", "review":
            return Color.semanticWarning
        default:
            return Color.secondary
        }
    }

    private func formatUsd(_ value: Double?) -> String {
        guard let value else {
            return "N/A"
        }
        return String(format: "$%.2f", value)
    }

    private func formattedDateRange(start: String, end: String) -> String {
        let parser = ISO8601DateFormatter()
        parser.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let fallbackParser = ISO8601DateFormatter()

        let startDate = parser.date(from: start) ?? fallbackParser.date(from: start)
        let endDate = parser.date(from: end) ?? fallbackParser.date(from: end)
        guard let startDate, let endDate else {
            return "\(start) - \(end)"
        }

        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateStyle = .medium
        formatter.timeStyle = .short
        return "\(formatter.string(from: startDate)) - \(formatter.string(from: endDate))"
    }

    private func iconForAction(_ action: String) -> String {
        let lower = action.lowercased()
        if lower.contains("spray") || lower.contains("apply") || lower.contains("treat") { return "wand.and.rays" }
        if lower.contains("water") || lower.contains("irrigat") { return "drop.fill" }
        if lower.contains("fertiliz") || lower.contains("nutrient") { return "leaf.fill" }
        if lower.contains("prune") || lower.contains("remove") || lower.contains("cut") { return "scissors" }
        if lower.contains("monitor") || lower.contains("inspect") || lower.contains("check") { return "eye.fill" }
        if lower.contains("harvest") { return "basket.fill" }
        if lower.contains("soil") || lower.contains("amend") { return "square.stack.3d.up.fill" }
        return "checkmark.circle.fill"
    }

    private func iconForProductType(_ type: String) -> String {
        switch type.uppercased() {
        case "FERTILIZER":     return "drop.fill"
        case "PESTICIDE":      return "shield.fill"
        case "HERBICIDE":      return "xmark.circle.fill"
        case "FUNGICIDE":      return "staroflife.fill"
        case "AMENDMENT":      return "square.stack.3d.up.fill"
        case "BIOLOGICAL":     return "leaf.fill"
        case "INSECTICIDE":    return "ant.fill"
        case "SEED_TREATMENT": return "circle.hexagongrid.fill"
        default:               return "shippingbox.fill"
        }
    }

    @ViewBuilder
    private func citationsButton(_ detail: RecommendationDetailResponse) -> some View {
        let citations = citationItems(detail)
        Button {
            activeFeedbackStage = nil
            // Detent scales with citation count so at most ~3 are visible without scrolling.
            // Each card is ~130pt tall with a 6-line excerpt, header is ~72pt.
            let count = citations.count
            if count == 0 {
                citationDetent = .compact     // empty state — small modal
            } else if count == 1 {
                citationDetent = .compact     // 1 citation fits at 42% screen height
            } else if count == 2 {
                citationDetent = .medium      // 2 citations fit at 66% screen height
            } else {
                citationDetent = .expanded    // 3+ → expanded, user scrolls for more
            }
            showCitationsModal = true
        } label: {
            Text(citations.isEmpty ? "Citations" : "Citations (\(citations.count))")
                .font(.caption.weight(.semibold))
                .foregroundStyle(citations.isEmpty ? .secondary : Color.appSecondary)
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(
                    citations.isEmpty
                        ? Color.appSecondaryBackground
                        : Color.appPrimary.opacity(0.16)
                )
                .clipShape(Capsule())
        }
        .buttonStyle(.plain)
    }

    private var citationsModal: some View {
        let sheetHeight = citationSheetHeight
        let citations = currentCitationItems

        return VStack {
            Spacer()

            VStack(spacing: 0) {
                // Drag handle
                Capsule()
                    .fill(Color.secondary.opacity(0.35))
                    .frame(width: 38, height: 5)
                    .padding(.top, 10)
                    .padding(.bottom, 2)

                // Earth gradient header
                HStack(alignment: .center) {
                    VStack(alignment: .leading, spacing: 3) {
                        Text("Cited Sources")
                            .font(.title3.weight(.semibold))
                            .foregroundStyle(.white)

                        if !citations.isEmpty {
                            Text("\(citations.count) reference\(citations.count == 1 ? "" : "s")")
                                .font(.caption.weight(.medium))
                                .foregroundStyle(.white.opacity(0.65))
                        }
                    }
                    Spacer()
                    Button {
                        showCitationsModal = false
                    } label: {
                        Image(systemName: "xmark")
                            .font(.subheadline.weight(.bold))
                            .foregroundStyle(.white.opacity(0.80))
                            .frame(width: 30, height: 30)
                            .background(.white.opacity(0.15))
                            .clipShape(Circle())
                    }
                    .buttonStyle(.plain)
                }
                .padding(.horizontal, Spacing.lg)
                .padding(.vertical, Spacing.md)
                .background(
                    LinearGradient(
                        stops: [
                            .init(color: Color.appEarth950, location: 0),
                            .init(color: Color.appEarth800, location: 1),
                        ],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )

                // Citations content
                if citations.isEmpty {
                    Text("No citations are attached to this recommendation yet.")
                        .font(.body)
                        .foregroundStyle(.secondary)
                        .padding(20)
                        .frame(maxWidth: .infinity, alignment: .leading)
                } else {
                    ScrollView {
                        VStack(alignment: .leading, spacing: 10) {
                            ForEach(citations) { citation in
                                citationCard(citation)
                            }
                        }
                        .padding(Spacing.lg)
                    }
                }

                Spacer(minLength: 0)
            }
            .frame(height: sheetHeight, alignment: .top)
            .frame(maxWidth: .infinity)
            .background(Color.appSecondaryBackground)
            .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
            .gesture(citationDetentDragGesture)
            .padding(.horizontal, 12)
            .padding(.bottom, 10)
        }
    }

    private func citationCard(_ citation: CitationItem) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top, spacing: Spacing.sm) {
                // Colored accent bar
                RoundedRectangle(cornerRadius: 2, style: .continuous)
                    .fill(Color.appPrimary.opacity(0.70))
                    .frame(width: 3)
                    .frame(minHeight: 20)

                VStack(alignment: .leading, spacing: 5) {
                    Text(citation.title)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.primary)

                    if let excerpt = citation.excerpt,
                       !excerpt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                        Text(excerpt)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .lineSpacing(3)
                            .lineLimit(6)  // cap excerpt so 3 citations fit without scrolling
                    }
                }
            }

            HStack {
                if let relevance = citation.relevance {
                    Label("\(Int((relevance * 100).rounded()))% relevant", systemImage: "chart.bar.fill")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(Color.appPrimary)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(Color.appPrimary.opacity(0.10))
                        .clipShape(Capsule())
                }

                Spacer()

                if let link = citation.url,
                   let url = URL(string: link) {
                    Button {
                        openURL(url)
                    } label: {
                        Label("Open", systemImage: "arrow.up.right")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(Color.appSecondary)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Spacing.md)
        .antigravityGlass(cornerRadius: 12)
    }

    private func feedbackModalContainer(for stage: FeedbackStage) -> some View {
        VStack {
            Spacer()

            if usesScrollableFeedbackSheet(stage) {
                feedbackModalShell(stage: stage) {
                    ScrollView {
                        feedbackSheet(for: stage)
                            .padding(.horizontal, 20)
                            .padding(.top, 10)
                            .padding(.bottom, 20)
                    }
                }
                .frame(maxHeight: feedbackModalMaxHeight(for: stage))
            } else {
                feedbackModalShell(stage: stage) {
                    feedbackSheet(for: stage)
                        .padding(.horizontal, 20)
                        .padding(.top, 10)
                        .padding(.bottom, 20)
                }
            }
        }
    }

    private func feedbackModalMaxHeight(for stage: FeedbackStage) -> CGFloat {
        let screenHeight = UIScreen.main.bounds.height
        switch stage {
        case .basic:
            return min(screenHeight * 0.66, 560)
        case .detailed:
            return min(screenHeight * 0.80, 700)
        case .outcome:
            return min(screenHeight * 0.70, 600)
        }
    }

    private func usesScrollableFeedbackSheet(_ stage: FeedbackStage) -> Bool {
        stage == .detailed
    }

    @ViewBuilder
    private func feedbackModalShell<Content: View>(
        stage: FeedbackStage,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(spacing: 0) {
            // Drag handle
            Capsule()
                .fill(Color.secondary.opacity(0.35))
                .frame(width: 38, height: 5)
                .padding(.top, 10)
                .padding(.bottom, 2)

            // Earth gradient header with stage icon
            HStack(alignment: .center, spacing: Spacing.sm) {
                Image(systemName: modalIcon(stage))
                    .font(.title3.weight(.semibold))
                    .foregroundStyle(Color.appPrimary)
                    .frame(width: 34, height: 34)
                    .background(Color.appPrimary.opacity(0.15))
                    .clipShape(RoundedRectangle(cornerRadius: 9, style: .continuous))

                VStack(alignment: .leading, spacing: 2) {
                    Text(modalTitle(stage))
                        .font(.title3.weight(.semibold))
                        .foregroundStyle(.white)
                    Text(modalSubtitle(stage))
                        .font(.caption)
                        .foregroundStyle(.white.opacity(0.65))
                        .lineLimit(1)
                }

                Spacer()

                Button {
                    activeFeedbackStage = nil
                } label: {
                    Image(systemName: "xmark")
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(.white.opacity(0.80))
                        .frame(width: 30, height: 30)
                        .background(.white.opacity(0.15))
                        .clipShape(Circle())
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, Spacing.lg)
            .padding(.vertical, Spacing.md)
            .background(
                LinearGradient(
                    stops: [
                        .init(color: Color.appEarth950, location: 0),
                        .init(color: Color.appEarth800, location: 1),
                    ],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )

            content()
        }
        .frame(maxWidth: .infinity)
        .background(Color.appSecondaryBackground)
        .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
        .padding(.horizontal, 12)
        .padding(.bottom, 10)
    }

    private func modalIcon(_ stage: FeedbackStage) -> String {
        switch stage {
        case .basic:    return "hand.thumbsup.fill"
        case .detailed: return "list.clipboard.fill"
        case .outcome:  return "checkmark.circle.fill"
        }
    }

    private func modalSubtitle(_ stage: FeedbackStage) -> String {
        switch stage {
        case .basic:    return "Quick signal on usefulness"
        case .detailed: return "Quality details for improvement"
        case .outcome:  return "Implementation outcome"
        }
    }

    private func modalTitle(_ stage: FeedbackStage) -> String {
        switch stage {
        case .basic:
            return "Quick Feedback"
        case .detailed:
            return "Detailed Feedback"
        case .outcome:
            return "Implementation Follow-up"
        }
    }

    @ViewBuilder
    private func feedbackSheet(for stage: FeedbackStage) -> some View {
        switch stage {
        case .basic:
            basicFeedbackContent
        case .detailed:
            detailedFeedbackContent
        case .outcome:
            outcomeFeedbackContent
        }
    }

    private var basicFeedbackContent: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Share an immediate signal on usefulness.")
                .font(.body)
                .foregroundStyle(.secondary)

            VStack(alignment: .leading, spacing: 8) {
                Text("Was this recommendation helpful?")
                    .font(.headline)
                    .foregroundStyle(.primary)

                HStack(spacing: 10) {
                    feedbackChoiceButton(
                        title: "Helpful",
                        icon: quickHelpful == true ? "hand.thumbsup.fill" : "hand.thumbsup",
                        isSelected: quickHelpful == true
                    ) {
                        quickHelpful = true
                    }

                    feedbackChoiceButton(
                        title: "Not Helpful",
                        icon: quickHelpful == false ? "hand.thumbsdown.fill" : "hand.thumbsdown",
                        isSelected: quickHelpful == false
                    ) {
                        quickHelpful = false
                    }
                }
            }

            VStack(alignment: .leading, spacing: 8) {
                Text("Helpfulness Rating")
                    .font(.headline)
                    .foregroundStyle(.primary)
                ratingSelector(selectedValue: quickRating) { value in
                    quickRating = value
                }
            }

            VStack(alignment: .leading, spacing: 8) {
                Text("Comment")
                    .font(.headline)
                    .foregroundStyle(.primary)
                TextEditor(text: $quickComments)
                    .font(.body)
                    .frame(minHeight: 110)
                    .scrollContentBackground(.hidden)
                    .padding(8)
                    .background(Color.appBackground)
                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: 10, style: .continuous)
                            .stroke(Color.black.opacity(0.08), lineWidth: 0.8)
                    )
            }

            HStack(spacing: 10) {
                Button {
                    viewModel.setSnooze(stage: .basic, recommendationId: recommendationId, days: 2)
                    activeFeedbackStage = nil
                } label: {
                    secondaryActionLabel("Later")
                }
                .buttonStyle(.plain)
                .disabled(isSubmittingFeedback)

                Spacer()

                Button(isSubmittingFeedback ? "Saving..." : "Save & Continue") {
                    submitBasicFeedback()
                }
                .buttonStyle(GlowSkeuomorphicButtonStyle())
                .disabled(isSubmittingFeedback)
            }
        }
    }

    private func feedbackChoiceButton(
        title: String,
        icon: String,
        isSelected: Bool,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            Label(title, systemImage: icon)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.primary)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 10)
                .background(isSelected ? Color.appPrimary.opacity(0.24) : Color.appSecondaryBackground)
                .clipShape(Capsule())
                .overlay(
                    Capsule()
                        .stroke(isSelected ? Color.appPrimary : Color.black.opacity(0.12), lineWidth: 0.9)
                )
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private var detailedFeedbackContent: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Add quality details to improve future recommendations.")
                .font(.body)
                .foregroundStyle(.secondary)

            VStack(alignment: .leading, spacing: 8) {
                Text("Accuracy Rating")
                    .font(.headline)
                    .foregroundStyle(.primary)
                ratingSelector(selectedValue: detailedAccuracy) { value in
                    detailedAccuracy = value
                }
            }

            VStack(alignment: .leading, spacing: 8) {
                Text("What needs improvement?")
                    .font(.headline)
                    .foregroundStyle(.primary)

                ForEach(feedbackIssues, id: \.self) { issue in
                    Button {
                        if selectedIssues.contains(issue) {
                            selectedIssues.remove(issue)
                        } else {
                            selectedIssues.insert(issue)
                        }
                    } label: {
                        HStack(spacing: 8) {
                            Image(systemName: selectedIssues.contains(issue) ? "checkmark.square.fill" : "square")
                                .foregroundStyle(selectedIssues.contains(issue) ? Color.appSecondary : Color.secondary)
                            Text(issue)
                                .font(.body)
                                .foregroundStyle(.primary)
                            Spacer()
                        }
                    }
                    .buttonStyle(.plain)
                }
            }

            VStack(alignment: .leading, spacing: 8) {
                Text("Additional Notes")
                    .font(.headline)
                    .foregroundStyle(.primary)
                TextEditor(text: $detailedNotes)
                    .font(.body)
                    .frame(minHeight: 110)
                    .scrollContentBackground(.hidden)
                    .padding(8)
                    .background(Color.appBackground)
                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: 10, style: .continuous)
                            .stroke(Color.black.opacity(0.08), lineWidth: 0.8)
                    )
            }

            HStack(spacing: 10) {
                Button {
                    viewModel.setSnooze(stage: .detailed, recommendationId: recommendationId, days: 1)
                    activeFeedbackStage = nil
                } label: {
                    secondaryActionLabel("Later")
                }
                .buttonStyle(.plain)
                .disabled(isSubmittingFeedback)

                Spacer()

                Button(isSubmittingFeedback ? "Saving..." : "Save Detailed Feedback") {
                    submitDetailedFeedback()
                }
                .buttonStyle(GlowSkeuomorphicButtonStyle())
                .disabled(isSubmittingFeedback)
            }
        }
    }

    private var outcomeFeedbackContent: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("After applying this recommendation, what happened?")
                .font(.body)
                .foregroundStyle(.secondary)

            VStack(alignment: .leading, spacing: 8) {
                Text("Outcome")
                    .font(.headline)
                    .foregroundStyle(.primary)

                HStack(spacing: 10) {
                    feedbackChoiceButton(
                        title: "Worked",
                        icon: "checkmark.circle",
                        isSelected: outcomeSelection == .success
                    ) {
                        outcomeSelection = .success
                    }

                    feedbackChoiceButton(
                        title: "Did Not Work",
                        icon: "xmark.circle",
                        isSelected: outcomeSelection == .failure
                    ) {
                        outcomeSelection = .failure
                    }
                }
            }

            VStack(alignment: .leading, spacing: 8) {
                Text("Outcome Notes")
                    .font(.headline)
                    .foregroundStyle(.primary)
                TextEditor(text: $outcomeNotes)
                    .font(.body)
                    .frame(minHeight: 110)
                    .scrollContentBackground(.hidden)
                    .padding(8)
                    .background(Color.appBackground)
                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: 10, style: .continuous)
                            .stroke(Color.black.opacity(0.08), lineWidth: 0.8)
                    )
            }

            HStack(spacing: 10) {
                Button {
                    viewModel.setSnooze(stage: .outcome, recommendationId: recommendationId, days: 3)
                    activeFeedbackStage = nil
                } label: {
                    secondaryActionLabel("Not Yet")
                }
                .buttonStyle(.plain)
                .disabled(isSubmittingFeedback)

                Spacer()

                Button(isSubmittingFeedback ? "Saving..." : "Save Outcome") {
                    submitOutcomeFeedback()
                }
                .buttonStyle(GlowSkeuomorphicButtonStyle())
                .disabled(isSubmittingFeedback)
            }
        }
    }

    private func ratingSelector(
        selectedValue: Int,
        onSelect: @escaping (Int) -> Void
    ) -> some View {
        HStack(spacing: 8) {
            ForEach(1...5, id: \.self) { value in
                Button {
                    onSelect(value)
                } label: {
                    Image(systemName: selectedValue >= value ? "star.fill" : "star")
                        .font(.title3)
                        .foregroundColor(selectedValue >= value ? .yellow : .secondary)
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func secondaryActionLabel(_ text: String) -> some View {
        Text(text)
            .font(.headline)
            .foregroundStyle(.primary)
            .padding(.horizontal, 18)
            .padding(.vertical, 12)
            .background(Color.appSecondaryBackground)
            .clipShape(Capsule())
            .overlay(
                Capsule()
                    .stroke(Color.black.opacity(0.10), lineWidth: 0.8)
            )
            .contentShape(Rectangle())
    }

    private func isExpanded(_ section: RecommendationSection) -> Bool {
        expandedSections.contains(section)
    }

    private func toggle(section: RecommendationSection) {
        if section == .products,
           !expandedSections.contains(section),
           !hasAcknowledgedProductNotice {
            showProductNoticeAlert = true
            return
        }

        if expandedSections.contains(section) {
            expandedSections.remove(section)
        } else {
            expandedSections.insert(section)
        }
    }

    private var productNoticeKey: String {
        "cropcopilot.product.notice.\(recommendationId)"
    }

    private var currentCitationItems: [CitationItem] {
        guard let detail = viewModel.recommendation else {
            return []
        }
        return citationItems(detail)
    }

    private func citationItems(_ detail: RecommendationDetailResponse) -> [CitationItem] {
        var merged: [String: CitationItem] = [:]
        var orderedKeys: [String] = []

        func normalize(_ value: String?) -> String? {
            guard let value else {
                return nil
            }
            let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
            return trimmed.isEmpty ? nil : trimmed
        }

        func isGenericTitle(_ value: String) -> Bool {
            let normalized = value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            return normalized == "source excerpt" || normalized == "source"
        }

        func resolveKey(
            id: String?,
            url: String?,
            title: String,
            excerpt: String?
        ) -> String {
            if let id = normalize(id) {
                return "id::\(id.lowercased())"
            }
            if let url = normalize(url) {
                return "url::\(url.lowercased())"
            }
            if let excerpt = normalize(excerpt) {
                return "excerpt::\(excerpt.lowercased())"
            }
            return "title::\(title.trimmingCharacters(in: .whitespacesAndNewlines).lowercased())"
        }

        func upsert(_ item: CitationItem) {
            let key = resolveKey(
                id: item.id,
                url: item.url,
                title: item.title,
                excerpt: item.excerpt
            )

            guard let existing = merged[key] else {
                merged[key] = item
                orderedKeys.append(key)
                return
            }

            let preferredTitle: String = {
                if !isGenericTitle(existing.title) {
                    return existing.title
                }
                if !isGenericTitle(item.title) {
                    return item.title
                }
                return existing.title.count >= item.title.count ? existing.title : item.title
            }()

            let preferredExcerpt: String? = {
                let existingExcerpt = normalize(existing.excerpt)
                let incomingExcerpt = normalize(item.excerpt)
                switch (existingExcerpt, incomingExcerpt) {
                case (.some(let current), .some(let incoming)):
                    return incoming.count > current.count ? incoming : current
                case (.none, .some(let incoming)):
                    return incoming
                case (.some(let current), .none):
                    return current
                case (.none, .none):
                    return nil
                }
            }()

            merged[key] = CitationItem(
                id: existing.id,
                title: preferredTitle,
                url: existing.url ?? item.url,
                excerpt: preferredExcerpt,
                relevance: max(existing.relevance ?? -1, item.relevance ?? -1)
            )
        }

        for source in detail.sources {
            let title =
                source.source?.title
                ?? normalize(source.content)
                ?? "Source excerpt"

            upsert(
                CitationItem(
                    id: source.chunkId ?? source.source?.id ?? source.id,
                    title: title,
                    url: source.source?.url,
                    excerpt: source.content,
                    relevance: source.relevanceScore
                )
            )
        }

        for source in detail.diagnosis.sources {
            upsert(
                CitationItem(
                    id: source.chunkId,
                    title: source.title,
                    url: source.url,
                    excerpt: nil,
                    relevance: source.relevance
                )
            )
        }

        return orderedKeys
            .compactMap { merged[$0] }
            .filter { item in
                let title = item.title.trimmingCharacters(in: .whitespacesAndNewlines)
                let excerpt = item.excerpt?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
                return !title.isEmpty && !(isGenericTitle(title) && excerpt.isEmpty)
            }
            .sorted { (lhs, rhs) -> Bool in
                (lhs.relevance ?? -1) > (rhs.relevance ?? -1)
            }
    }

    private func mergedProducts(_ detail: RecommendationDetailResponse) -> [MergedRecommendationProduct] {
        func isGenericName(_ value: String) -> Bool {
            let normalized = value
                .trimmingCharacters(in: .whitespacesAndNewlines)
                .lowercased()
            return normalized.isEmpty || normalized == "suggested product" || normalized == "unspecified"
        }

        var candidates: [MergedRecommendationProduct] = []

        for product in detail.recommendedProducts {
            candidates.append(
                MergedRecommendationProduct(
                    id: product.id,
                    productId: normalizeCatalogProductId(product.catalogProductId),
                    name: product.name.trimmingCharacters(in: .whitespacesAndNewlines),
                    type: product.type,
                    applicationRate: product.applicationRate,
                    reason: product.reason
                )
            )
        }

        for product in detail.diagnosis.products {
            candidates.append(
                MergedRecommendationProduct(
                    id: product.id,
                    productId: normalizeCatalogProductId(product.productId),
                    name: product.productName.trimmingCharacters(in: .whitespacesAndNewlines),
                    type: product.productType,
                    applicationRate: product.applicationRate,
                    reason: product.reasoning
                )
            )
        }

        let hasSpecificCandidate = candidates.contains { !isGenericName($0.name) }
        let filteredCandidates = hasSpecificCandidate
            ? candidates.filter { !isGenericName($0.name) }
            : candidates

        var merged: [MergedRecommendationProduct] = []
        var seenKeys = Set<String>()
        for product in filteredCandidates {
            let fallbackNameKey = product.name.lowercased()
            let key = product.productId ?? fallbackNameKey
            if seenKeys.contains(key) {
                continue
            }
            seenKeys.insert(key)
            merged.append(product)
        }

        return merged
    }

    private func normalizeCatalogProductId(_ value: String?) -> String? {
        guard let value else {
            return nil
        }
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            return nil
        }
        let lowered = trimmed.lowercased()
        guard lowered != "null", lowered != "undefined" else {
            return nil
        }
        return trimmed
    }

    private func isNavigableProductId(_ value: String?) -> Bool {
        // Accept any non-empty, non-null ID — catalog IDs are not UUIDs
        return normalizeCatalogProductId(value) != nil
    }

    private func prettyConditionType(_ value: String) -> String {
        value.replacingOccurrences(of: "_", with: " ").capitalized
    }

    private var citationSheetHeight: CGFloat {
        let screenHeight = UIScreen.main.bounds.height
        return max(320, screenHeight * citationDetent.rawValue)
    }

    private var citationDetentDragGesture: some Gesture {
        DragGesture(minimumDistance: 12, coordinateSpace: .local)
            .onEnded { value in
                let verticalDelta = value.translation.height
                if verticalDelta < -30 {
                    citationDetent = nextLargerCitationDetent(from: citationDetent)
                } else if verticalDelta > 30 {
                    citationDetent = nextSmallerCitationDetent(from: citationDetent)
                }
            }
    }

    private func nextLargerCitationDetent(from current: CitationSheetDetent) -> CitationSheetDetent {
        switch current {
        case .compact:
            return .medium
        case .medium:
            return .expanded
        case .expanded:
            return .expanded
        }
    }

    private func nextSmallerCitationDetent(from current: CitationSheetDetent) -> CitationSheetDetent {
        switch current {
        case .compact:
            return .compact
        case .medium:
            return .compact
        case .expanded:
            return .medium
        }
    }

    private func presentSuggestedModalIfNeeded() {
        guard activeFeedbackStage == nil else {
            return
        }
        guard let stage = viewModel.nextSuggestedStage else {
            return
        }

        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 1_000_000_000)
            guard activeFeedbackStage == nil else {
                return
            }
            activeFeedbackStage = stage
            feedbackErrorMessage = nil
            feedbackSuccessMessage = nil
            showCitationsModal = false
            viewModel.consumeSuggestedStage()
        }
    }

    private func applyFeedbackSnapshot(_ feedback: FeedbackRecord?) {
        guard let feedback else {
            return
        }

        quickHelpful = feedback.helpful
        quickRating = feedback.rating ?? 0
        quickComments = feedback.comments ?? ""
        detailedAccuracy = feedback.accuracy ?? 0
        selectedIssues = Set(feedback.issues)
        detailedNotes = feedback.comments ?? ""
        outcomeSelection = feedback.outcomeSuccess == true ? .success : feedback.outcomeSuccess == false ? .failure : nil
        outcomeNotes = feedback.outcomeNotes ?? ""
    }

    private func submitBasicFeedback() {
        guard let helpful = quickHelpful else {
            feedbackErrorMessage = "Select whether the recommendation was helpful."
            return
        }

        isSubmittingFeedback = true
        feedbackErrorMessage = nil

        Task { @MainActor in
            do {
                let feedback = try await viewModel.submitQuickFeedback(
                    recommendationId: recommendationId,
                    helpful: helpful,
                    rating: quickRating > 0 ? quickRating : nil,
                    comments: trimmedOrNil(quickComments)
                )

                applyFeedbackSnapshot(feedback)
                feedbackSuccessMessage = "Quick feedback saved. Please add detail."
                viewModel.clearSnooze(stage: .basic, recommendationId: recommendationId)
                isSubmittingFeedback = false
                activeFeedbackStage = .detailed
            } catch {
                isSubmittingFeedback = false
                feedbackErrorMessage = "Could not save quick feedback. Please try again."
            }
        }
    }

    private func submitDetailedFeedback() {
        isSubmittingFeedback = true
        feedbackErrorMessage = nil

        Task { @MainActor in
            do {
                let feedback = try await viewModel.submitDetailedFeedback(
                    recommendationId: recommendationId,
                    accuracy: detailedAccuracy > 0 ? detailedAccuracy : nil,
                    issues: selectedIssues.isEmpty ? nil : Array(selectedIssues),
                    comments: trimmedOrNil(detailedNotes)
                )

                applyFeedbackSnapshot(feedback)
                feedbackSuccessMessage = "Detailed feedback saved."
                viewModel.clearSnooze(stage: .detailed, recommendationId: recommendationId)
                isSubmittingFeedback = false
                activeFeedbackStage = nil
            } catch {
                isSubmittingFeedback = false
                feedbackErrorMessage = "Could not save detailed feedback. Please try again."
            }
        }
    }

    private func submitOutcomeFeedback() {
        guard let outcomeSelection else {
            feedbackErrorMessage = "Select whether the implementation worked."
            return
        }

        isSubmittingFeedback = true
        feedbackErrorMessage = nil

        Task { @MainActor in
            do {
                let feedback = try await viewModel.submitOutcomeFeedback(
                    recommendationId: recommendationId,
                    outcomeSuccess: outcomeSelection == .success,
                    outcomeNotes: trimmedOrNil(outcomeNotes)
                )

                applyFeedbackSnapshot(feedback)
                feedbackSuccessMessage = "Outcome feedback saved. Thank you."
                viewModel.clearSnooze(stage: .outcome, recommendationId: recommendationId)
                isSubmittingFeedback = false
                activeFeedbackStage = nil
            } catch {
                isSubmittingFeedback = false
                feedbackErrorMessage = "Could not save outcome feedback. Please try again."
            }
        }
    }

    private func trimmedOrNil(_ value: String) -> String? {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}

@MainActor
class DiagnosisResultViewModel: ObservableObject {
    @Published var recommendation: RecommendationDetailResponse?
    @Published var isLoading = false
    @Published var errorMessage: String?
    @Published var feedback: FeedbackRecord?
    @Published var isFeedbackLoading = false
    @Published var nextSuggestedStage: FeedbackStage?

    private static let followUpDays = 5
    private static let secondsInDay: TimeInterval = 24 * 60 * 60

    private let apiClient = APIClient.shared

    var quickFeedbackComplete: Bool {
        hasBasicFeedback(feedback)
    }

    var detailedFeedbackComplete: Bool {
        hasDetailedFeedback(feedback)
    }

    var shouldPromptOutcome: Bool {
        shouldPromptOutcome(feedback)
    }

    var feedbackSummary: String {
        if isFeedbackLoading {
            return "Loading feedback status..."
        }

        if !quickFeedbackComplete {
            return "Start with quick feedback to improve future recommendations."
        }

        if !detailedFeedbackComplete {
            return "Quick feedback saved. Add detail so recommendations improve faster."
        }

        if shouldPromptOutcome {
            return "It has been about \(Self.followUpDays) days. Share implementation outcomes."
        }

        return "Feedback captured. You can still update it anytime."
    }

    func loadRecommendation(id: String) async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            let response: RecommendationDetailResponse = try await apiClient.request(.getRecommendation(id: id))
            recommendation = response
            await loadFeedback(recommendationId: id)
        } catch let error as NetworkError {
            if case .cancelled = error {
                return
            }
            errorMessage = error.localizedDescription
        } catch is CancellationError {
            return
        } catch {
            errorMessage = error.localizedDescription
        }

    }

    func submitQuickFeedback(
        recommendationId: String,
        helpful: Bool,
        rating: Int?,
        comments: String?
    ) async throws -> FeedbackRecord {
        let body = FeedbackRequest(
            recommendationId: recommendationId,
            stage: "basic",
            helpful: helpful,
            rating: rating,
            accuracy: nil,
            comments: comments,
            issues: nil,
            outcomeApplied: nil,
            outcomeSuccess: nil,
            outcomeNotes: nil
        )

        return try await submitFeedback(body: body, recommendationId: recommendationId)
    }

    func submitDetailedFeedback(
        recommendationId: String,
        accuracy: Int?,
        issues: [String]?,
        comments: String?
    ) async throws -> FeedbackRecord {
        let body = FeedbackRequest(
            recommendationId: recommendationId,
            stage: "detailed",
            helpful: nil,
            rating: nil,
            accuracy: accuracy,
            comments: comments,
            issues: issues,
            outcomeApplied: nil,
            outcomeSuccess: nil,
            outcomeNotes: nil
        )

        return try await submitFeedback(body: body, recommendationId: recommendationId)
    }

    func submitOutcomeFeedback(
        recommendationId: String,
        outcomeSuccess: Bool,
        outcomeNotes: String?
    ) async throws -> FeedbackRecord {
        let body = FeedbackRequest(
            recommendationId: recommendationId,
            stage: "outcome",
            helpful: nil,
            rating: nil,
            accuracy: nil,
            comments: nil,
            issues: nil,
            outcomeApplied: true,
            outcomeSuccess: outcomeSuccess,
            outcomeNotes: outcomeNotes
        )

        return try await submitFeedback(body: body, recommendationId: recommendationId)
    }

    func setSnooze(stage: FeedbackStage, recommendationId: String, days: Int) {
        let date = Date().addingTimeInterval(Double(days) * Self.secondsInDay)
        UserDefaults.standard.set(date, forKey: snoozeKey(recommendationId: recommendationId, stage: stage))
        nextSuggestedStage = nil
    }

    func clearSnooze(stage: FeedbackStage, recommendationId: String) {
        UserDefaults.standard.removeObject(forKey: snoozeKey(recommendationId: recommendationId, stage: stage))
    }

    func consumeSuggestedStage() {
        nextSuggestedStage = nil
    }

    private func loadFeedback(recommendationId: String) async {
        isFeedbackLoading = true
        defer { isFeedbackLoading = false }

        do {
            let response: FeedbackGetResponse = try await apiClient.request(
                .getFeedback(recommendationId: recommendationId)
            )
            feedback = response.feedback
        } catch let error as NetworkError {
            if case .cancelled = error {
                return
            }
            feedback = nil
        } catch is CancellationError {
            return
        } catch {
            feedback = nil
        }

        nextSuggestedStage = suggestedStage(recommendationId: recommendationId)
    }

    private func submitFeedback(
        body: FeedbackRequest,
        recommendationId: String
    ) async throws -> FeedbackRecord {
        let response: FeedbackSubmitResponse = try await apiClient.request(.submitFeedback, body: body)
        feedback = response.feedback
        nextSuggestedStage = suggestedStage(recommendationId: recommendationId)
        return response.feedback
    }

    private func suggestedStage(recommendationId: String) -> FeedbackStage? {
        if !hasBasicFeedback(feedback), !isSnoozed(stage: .basic, recommendationId: recommendationId) {
            return .basic
        }

        if hasBasicFeedback(feedback),
           !hasDetailedFeedback(feedback),
           !isSnoozed(stage: .detailed, recommendationId: recommendationId) {
            return .detailed
        }

        if shouldPromptOutcome(feedback),
           !isSnoozed(stage: .outcome, recommendationId: recommendationId) {
            return .outcome
        }

        return nil
    }

    private func hasBasicFeedback(_ feedback: FeedbackRecord?) -> Bool {
        guard let feedback else {
            return false
        }

        let hasComments = !(feedback.comments?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?? true)
        return feedback.helpful != nil || feedback.rating != nil || hasComments
    }

    private func hasDetailedFeedback(_ feedback: FeedbackRecord?) -> Bool {
        guard let feedback else {
            return false
        }

        return feedback.detailedCompletedAt != nil || feedback.accuracy != nil || !feedback.issues.isEmpty
    }

    private func shouldPromptOutcome(_ feedback: FeedbackRecord?) -> Bool {
        guard let feedback else {
            return false
        }
        guard hasBasicFeedback(feedback) else {
            return false
        }
        guard feedback.outcomeReported == false else {
            return false
        }
        guard let anchorDate = parseDate(feedback.updatedAt) ?? parseDate(feedback.createdAt) else {
            return false
        }

        return Date().timeIntervalSince(anchorDate) >= Double(Self.followUpDays) * Self.secondsInDay
    }

    private func parseDate(_ value: String?) -> Date? {
        guard let value else {
            return nil
        }

        let formatterWithFractional = ISO8601DateFormatter()
        formatterWithFractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let parsed = formatterWithFractional.date(from: value) {
            return parsed
        }

        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.date(from: value)
    }

    private func snoozeKey(recommendationId: String, stage: FeedbackStage) -> String {
        "cropcopilot.feedback.\(recommendationId).\(stage.rawValue).snoozeUntil"
    }

    private func isSnoozed(stage: FeedbackStage, recommendationId: String) -> Bool {
        guard let date = UserDefaults.standard.object(
            forKey: snoozeKey(recommendationId: recommendationId, stage: stage)
        ) as? Date else {
            return false
        }

        return date > Date()
    }
}
