//
//  DashboardViewModel.swift
//  CropCopilot
//
//  Created by Claude Code on Phase 2
//

import Foundation

@MainActor
class DashboardViewModel: ObservableObject {
    @Published var recentRecommendations: [RecommendationSummary] = []
    @Published var isLoading = false
    @Published var errorMessage: String?

    private let apiClient = APIClient.shared

    func loadRecentRecommendations() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            let response: RecommendationsListResponse = try await apiClient.request(
                .listRecommendations(page: 1, pageSize: 5, search: nil, sort: "date_desc")
            )
            recentRecommendations = response.recommendations
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
}
