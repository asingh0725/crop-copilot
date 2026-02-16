//
//  RecommendationsViewModel.swift
//  CropCopilot
//
//  Created by Claude Code on Phase 2
//

import Foundation

@MainActor
class RecommendationsViewModel: ObservableObject {
    enum SortOption: String, CaseIterable {
        case dateDesc = "date_desc"
        case dateAsc = "date_asc"
        case confidenceHigh = "confidence_high"
        case confidenceLow = "confidence_low"

        var displayName: String {
            switch self {
            case .dateDesc: return "Newest"
            case .dateAsc: return "Oldest"
            case .confidenceHigh: return "High Confidence"
            case .confidenceLow: return "Low Confidence"
            }
        }
    }

    @Published var recommendations: [RecommendationSummary] = []
    @Published var isLoading = false
    @Published var isLoadingMore = false
    @Published var errorMessage: String?
    @Published var searchText = ""
    @Published var selectedSort: SortOption = .dateDesc
    @Published var hasMorePages = false

    private var currentPage = 1
    private let pageSize = 20
    private let apiClient = APIClient.shared

    func loadRecommendations(reset: Bool = false) async {
        if reset {
            currentPage = 1
            recommendations = []
        }

        isLoading = recommendations.isEmpty
        errorMessage = nil

        do {
            let response: RecommendationsListResponse = try await apiClient.request(
                .listRecommendations(
                    page: currentPage,
                    pageSize: pageSize,
                    search: searchText.isEmpty ? nil : searchText,
                    sort: selectedSort.rawValue
                )
            )
            recommendations = response.recommendations
            hasMorePages = response.pagination.page < response.pagination.totalPages
        } catch {
            errorMessage = error.localizedDescription
        }

        isLoading = false
    }

    func loadNextPage() async {
        guard hasMorePages, !isLoadingMore else { return }
        isLoadingMore = true
        currentPage += 1

        do {
            let response: RecommendationsListResponse = try await apiClient.request(
                .listRecommendations(
                    page: currentPage,
                    pageSize: pageSize,
                    search: searchText.isEmpty ? nil : searchText,
                    sort: selectedSort.rawValue
                )
            )
            recommendations.append(contentsOf: response.recommendations)
            hasMorePages = response.pagination.page < response.pagination.totalPages
        } catch {
            errorMessage = error.localizedDescription
            currentPage -= 1
        }

        isLoadingMore = false
    }

    func deleteRecommendations(at offsets: IndexSet) async {
        for index in offsets {
            let rec = recommendations[index]
            do {
                struct EmptyResponse: Codable {}
                let _: EmptyResponse = try await apiClient.request(.deleteRecommendation(id: rec.id))
                recommendations.remove(at: index)
            } catch {
                errorMessage = "Failed to delete: \(error.localizedDescription)"
            }
        }
    }
}
