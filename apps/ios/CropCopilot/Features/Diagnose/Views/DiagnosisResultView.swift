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

private let feedbackIssues = [
    "Recommendations felt too generic",
    "Diagnosis did not match symptoms",
    "Actions were unclear",
    "Sources were weak or irrelevant",
    "Timing guidance was unrealistic"
]

struct DiagnosisResultView: View {
    let recommendationId: String

    @StateObject private var viewModel = DiagnosisResultViewModel()

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

    var body: some View {
        Group {
            if viewModel.isLoading {
                loadingView
            } else if let detail = viewModel.recommendation {
                resultContent(detail)
            } else if let error = viewModel.errorMessage {
                errorView(error)
            }
        }
        .navigationTitle("Diagnosis Result")
        .navigationBarTitleDisplayMode(.inline)
        .task {
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
        .sheet(item: $activeFeedbackStage) { stage in
            feedbackSheet(for: stage)
        }
    }

    private var loadingView: some View {
        VStack(spacing: 16) {
            ProgressView()
                .scaleEffect(1.5)
            Text("Loading recommendation...")
                .foregroundColor(.secondary)
        }
    }

    private func errorView(_ error: String) -> some View {
        VStack(spacing: 16) {
            Image(systemName: "exclamationmark.triangle")
                .font(.largeTitle)
                .foregroundColor(.orange)
            Text(error)
                .foregroundColor(.secondary)
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
            VStack(alignment: .leading, spacing: 20) {
                confidenceHeader(detail)

                sectionCard("Diagnosis") {
                    VStack(alignment: .leading, spacing: 8) {
                        Text(detail.diagnosis.diagnosis.condition)
                            .font(.headline)
                        Text(detail.diagnosis.diagnosis.reasoning)
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                        if let severity = detail.diagnosis.diagnosis.severity {
                            HStack {
                                Text("Severity:")
                                    .font(.caption.bold())
                                Text(severity)
                                    .font(.caption)
                            }
                        }
                    }
                }

                if !detail.diagnosis.recommendations.isEmpty {
                    sectionCard("Recommended Actions") {
                        ForEach(detail.diagnosis.recommendations) { action in
                            VStack(alignment: .leading, spacing: 4) {
                                HStack {
                                    priorityBadge(action.priority)
                                    Text(action.action)
                                        .font(.subheadline.bold())
                                }
                                Text(action.details)
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                                Text("Timing: \(action.timing)")
                                    .font(.caption2)
                                    .foregroundColor(.appPrimary)
                            }
                            .padding(.vertical, 4)
                            if action.id != detail.diagnosis.recommendations.last?.id {
                                Divider()
                            }
                        }
                    }
                }

                if !detail.diagnosis.products.isEmpty {
                    sectionCard("Recommended Products") {
                        ForEach(detail.diagnosis.products) { product in
                            VStack(alignment: .leading, spacing: 4) {
                                Text(product.productName)
                                    .font(.subheadline.bold())
                                Text(product.productType)
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                                if let rate = product.applicationRate {
                                    Text("Rate: \(rate)")
                                        .font(.caption)
                                        .foregroundColor(.appPrimary)
                                }
                            }
                            .padding(.vertical, 4)
                        }
                    }
                }

                if !detail.sources.isEmpty {
                    sectionCard("Sources") {
                        ForEach(detail.sources) { source in
                            if let ref = source.source {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(ref.title)
                                        .font(.caption.bold())
                                    if let url = ref.url {
                                        Text(url)
                                            .font(.caption2)
                                            .foregroundColor(.blue)
                                            .lineLimit(1)
                                    }
                                }
                                .padding(.vertical, 2)
                            }
                        }
                    }
                }

                shareButton(detail)
            }
            .padding()
        }
    }

    private func confidenceHeader(_ detail: RecommendationDetailResponse) -> some View {
        HStack {
            VStack(alignment: .leading) {
                Text(detail.diagnosis.diagnosis.conditionType.capitalized)
                    .font(.caption)
                    .foregroundColor(.secondary)
                if let crop = detail.input.crop {
                    Text(AppConstants.cropLabel(for: crop))
                        .font(.subheadline)
                }
            }
            Spacer()
            VStack(alignment: .trailing) {
                Text("Confidence")
                    .font(.caption)
                    .foregroundColor(.secondary)
                Text("\(Int(detail.confidence * 100))%")
                    .font(.title2.bold())
                    .foregroundColor(
                        detail.confidence >= 0.7 ? .green : detail.confidence >= 0.4 ? .orange : .red
                    )
            }
        }
        .padding()
        .background(Color.appSecondaryBackground)
        .cornerRadius(12)
    }

    private func sectionCard<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(title)
                .font(.headline)
            content()
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.appSecondaryBackground)
        .cornerRadius(12)
    }

    private func priorityBadge(_ priority: String) -> some View {
        Text(priority.uppercased())
            .font(.caption2.bold())
            .foregroundColor(
                priority.lowercased() == "high" ? .red : priority.lowercased() == "medium" ? .orange : .green
            )
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(
                (priority.lowercased() == "high" ? Color.red :
                    priority.lowercased() == "medium" ? Color.orange : Color.green).opacity(0.1)
            )
            .cornerRadius(4)
    }

    @ViewBuilder
    private func feedbackSheet(for stage: FeedbackStage) -> some View {
        switch stage {
        case .basic:
            basicFeedbackSheet
        case .detailed:
            detailedFeedbackSheet
        case .outcome:
            outcomeFeedbackSheet
        }
    }

    private var basicFeedbackSheet: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Quick Feedback")
                .font(.title3.bold())
            Text("Share an immediate signal on usefulness.")
                .font(.subheadline)
                .foregroundColor(.secondary)

            VStack(alignment: .leading, spacing: 8) {
                Text("Was this recommendation helpful?")
                    .font(.subheadline.bold())
                HStack(spacing: 12) {
                    Button {
                        quickHelpful = true
                    } label: {
                        Label("Helpful", systemImage: quickHelpful == true ? "hand.thumbsup.fill" : "hand.thumbsup")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(quickHelpful == true ? .green : .gray)

                    Button {
                        quickHelpful = false
                    } label: {
                        Label("Not Helpful", systemImage: quickHelpful == false ? "hand.thumbsdown.fill" : "hand.thumbsdown")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(quickHelpful == false ? .red : .gray)
                }
            }

            VStack(alignment: .leading, spacing: 8) {
                Text("Helpfulness Rating")
                    .font(.subheadline.bold())
                ratingSelector(selectedValue: quickRating) { value in
                    quickRating = value
                }
            }

            VStack(alignment: .leading, spacing: 8) {
                Text("Comment")
                    .font(.subheadline.bold())
                TextEditor(text: $quickComments)
                    .frame(minHeight: 90)
                    .padding(8)
                    .background(Color.appSecondaryBackground)
                    .cornerRadius(8)
            }

            HStack {
                Button("Later") {
                    viewModel.setSnooze(stage: .basic, recommendationId: recommendationId, days: 2)
                    activeFeedbackStage = nil
                }
                .buttonStyle(.bordered)
                .disabled(isSubmittingFeedback)

                Spacer()

                Button(isSubmittingFeedback ? "Saving..." : "Save & Continue") {
                    submitBasicFeedback()
                }
                .buttonStyle(.borderedProminent)
                .disabled(isSubmittingFeedback)
            }
        }
        .padding()
        .presentationDetents([.medium, .large])
    }

    private var detailedFeedbackSheet: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Detailed Feedback")
                .font(.title3.bold())
            Text("Add quality details to improve future recommendations.")
                .font(.subheadline)
                .foregroundColor(.secondary)

            VStack(alignment: .leading, spacing: 8) {
                Text("Accuracy Rating")
                    .font(.subheadline.bold())
                ratingSelector(selectedValue: detailedAccuracy) { value in
                    detailedAccuracy = value
                }
            }

            VStack(alignment: .leading, spacing: 8) {
                Text("What needs improvement?")
                    .font(.subheadline.bold())
                ForEach(feedbackIssues, id: \.self) { issue in
                    Button {
                        if selectedIssues.contains(issue) {
                            selectedIssues.remove(issue)
                        } else {
                            selectedIssues.insert(issue)
                        }
                    } label: {
                        HStack {
                            Image(systemName: selectedIssues.contains(issue) ? "checkmark.square.fill" : "square")
                            Text(issue)
                                .font(.footnote)
                            Spacer()
                        }
                    }
                    .buttonStyle(.plain)
                    .foregroundColor(.primary)
                }
            }

            VStack(alignment: .leading, spacing: 8) {
                Text("Additional Notes")
                    .font(.subheadline.bold())
                TextEditor(text: $detailedNotes)
                    .frame(minHeight: 90)
                    .padding(8)
                    .background(Color.appSecondaryBackground)
                    .cornerRadius(8)
            }

            HStack {
                Button("Later") {
                    viewModel.setSnooze(stage: .detailed, recommendationId: recommendationId, days: 1)
                    activeFeedbackStage = nil
                }
                .buttonStyle(.bordered)
                .disabled(isSubmittingFeedback)

                Spacer()

                Button(isSubmittingFeedback ? "Saving..." : "Save Detailed Feedback") {
                    submitDetailedFeedback()
                }
                .buttonStyle(.borderedProminent)
                .disabled(isSubmittingFeedback)
            }
        }
        .padding()
        .presentationDetents([.large])
    }

    private var outcomeFeedbackSheet: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Implementation Follow-up")
                .font(.title3.bold())
            Text("After applying this recommendation, what happened?")
                .font(.subheadline)
                .foregroundColor(.secondary)

            VStack(alignment: .leading, spacing: 8) {
                Text("Outcome")
                    .font(.subheadline.bold())
                HStack(spacing: 12) {
                    Button("Worked") {
                        outcomeSelection = .success
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(outcomeSelection == .success ? .green : .gray)

                    Button("Didn't Work") {
                        outcomeSelection = .failure
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(outcomeSelection == .failure ? .red : .gray)
                }
            }

            VStack(alignment: .leading, spacing: 8) {
                Text("Outcome Notes")
                    .font(.subheadline.bold())
                TextEditor(text: $outcomeNotes)
                    .frame(minHeight: 90)
                    .padding(8)
                    .background(Color.appSecondaryBackground)
                    .cornerRadius(8)
            }

            HStack {
                Button("Not Yet") {
                    viewModel.setSnooze(stage: .outcome, recommendationId: recommendationId, days: 3)
                    activeFeedbackStage = nil
                }
                .buttonStyle(.bordered)
                .disabled(isSubmittingFeedback)

                Spacer()

                Button(isSubmittingFeedback ? "Saving..." : "Save Outcome") {
                    submitOutcomeFeedback()
                }
                .buttonStyle(.borderedProminent)
                .disabled(isSubmittingFeedback)
            }
        }
        .padding()
        .presentationDetents([.medium, .large])
    }

    private func ratingSelector(
        selectedValue: Int,
        onSelect: @escaping (Int) -> Void
    ) -> some View {
        HStack(spacing: 6) {
            ForEach(1...5, id: \.self) { value in
                Button {
                    onSelect(value)
                } label: {
                    Image(systemName: selectedValue >= value ? "star.fill" : "star")
                        .foregroundColor(selectedValue >= value ? .yellow : .secondary)
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func shareButton(_ detail: RecommendationDetailResponse) -> some View {
        ShareLink(
            item: "Crop Copilot Diagnosis: \(detail.diagnosis.diagnosis.condition) - Confidence: \(Int(detail.confidence * 100))%",
            subject: Text("Crop Copilot Diagnosis"),
            message: Text(detail.diagnosis.diagnosis.reasoning)
        ) {
            Label("Share Result", systemImage: "square.and.arrow.up")
                .frame(maxWidth: .infinity)
                .padding()
                .background(Color.appPrimary.opacity(0.1))
                .cornerRadius(12)
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
