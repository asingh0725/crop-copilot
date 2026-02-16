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

        do {
            let response: RecommendationsListResponse = try await apiClient.request(
                .listRecommendations(page: 1, pageSize: 5, search: nil, sort: "date_desc")
            )
            recentRecommendations = response.recommendations
        } catch {
            errorMessage = error.localizedDescription
        }

        isLoading = false
    }
}
