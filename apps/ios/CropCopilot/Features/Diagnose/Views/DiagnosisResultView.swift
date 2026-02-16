//
//  DiagnosisResultView.swift
//  CropCopilot
//
//  Created by Claude Code on Phase 2
//

import SwiftUI

struct DiagnosisResultView: View {
    let recommendationId: String
    @StateObject private var viewModel = DiagnosisResultViewModel()
    @Environment(\.dismiss) private var dismiss

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
        }
    }

    // MARK: - Loading
    private var loadingView: some View {
        VStack(spacing: 16) {
            ProgressView()
                .scaleEffect(1.5)
            Text("Loading recommendation...")
                .foregroundColor(.secondary)
        }
    }

    // MARK: - Error
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

    // MARK: - Result Content
    private func resultContent(_ detail: RecommendationDetailResponse) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                // Confidence header
                confidenceHeader(detail)

                // Diagnosis
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

                // Recommendations
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

                // Products
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

                // Sources
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

                // Feedback
                feedbackSection

                // Share
                shareButton(detail)
            }
            .padding()
        }
    }

    // MARK: - Components
    private func confidenceHeader(_ detail: RecommendationDetailResponse) -> some View {
        HStack {
            VStack(alignment: .leading) {
                Text(detail.diagnosis.diagnosis.conditionType.capitalized)
                    .font(.caption)
                    .foregroundColor(.secondary)
                if let crop = detail.input.crop {
                    Text(crop)
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
                    .foregroundColor(detail.confidence >= 0.7 ? .green : detail.confidence >= 0.4 ? .orange : .red)
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
            .foregroundColor(priority.lowercased() == "high" ? .red : priority.lowercased() == "medium" ? .orange : .green)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(
                (priority.lowercased() == "high" ? Color.red : priority.lowercased() == "medium" ? Color.orange : Color.green)
                    .opacity(0.1)
            )
            .cornerRadius(4)
    }

    private var feedbackSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Was this helpful?")
                .font(.headline)
            HStack(spacing: 16) {
                Button {
                    Task { await viewModel.submitFeedback(recommendationId: recommendationId, helpful: true) }
                } label: {
                    Label("Yes", systemImage: viewModel.feedbackSubmitted == true ? "hand.thumbsup.fill" : "hand.thumbsup")
                        .padding(.horizontal, 16)
                        .padding(.vertical, 8)
                        .background(viewModel.feedbackSubmitted == true ? Color.green.opacity(0.2) : Color.appSecondaryBackground)
                        .cornerRadius(8)
                }
                .buttonStyle(.plain)

                Button {
                    Task { await viewModel.submitFeedback(recommendationId: recommendationId, helpful: false) }
                } label: {
                    Label("No", systemImage: viewModel.feedbackSubmitted == false ? "hand.thumbsdown.fill" : "hand.thumbsdown")
                        .padding(.horizontal, 16)
                        .padding(.vertical, 8)
                        .background(viewModel.feedbackSubmitted == false ? Color.red.opacity(0.2) : Color.appSecondaryBackground)
                        .cornerRadius(8)
                }
                .buttonStyle(.plain)
            }
        }
        .padding()
        .background(Color.appSecondaryBackground)
        .cornerRadius(12)
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
}

// MARK: - ViewModel
@MainActor
class DiagnosisResultViewModel: ObservableObject {
    @Published var recommendation: RecommendationDetailResponse?
    @Published var isLoading = false
    @Published var errorMessage: String?
    @Published var feedbackSubmitted: Bool?

    private let apiClient = APIClient.shared

    func loadRecommendation(id: String) async {
        isLoading = true
        errorMessage = nil

        do {
            let response: RecommendationDetailResponse = try await apiClient.request(.getRecommendation(id: id))
            recommendation = response
        } catch {
            errorMessage = error.localizedDescription
        }

        isLoading = false
    }

    func submitFeedback(recommendationId: String, helpful: Bool) async {
        let body = FeedbackRequest(
            recommendationId: recommendationId,
            helpful: helpful,
            rating: nil,
            comments: nil
        )

        do {
            struct FeedbackResponse: Codable { let success: Bool }
            let _: FeedbackResponse = try await apiClient.request(.submitFeedback, body: body)
            feedbackSubmitted = helpful
        } catch {
            // Non-critical, silently fail
        }
    }
}
