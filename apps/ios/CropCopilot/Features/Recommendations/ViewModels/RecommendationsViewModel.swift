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
    private var requestGeneration = 0

    func loadRecommendations(reset: Bool = false) async {
        requestGeneration += 1
        let generation = requestGeneration

        if reset {
            currentPage = 1
            hasMorePages = false
        }

        isLoading = recommendations.isEmpty
        errorMessage = nil
        defer {
            if generation == requestGeneration {
                isLoading = false
            }
        }

        do {
            let response: RecommendationsListResponse = try await apiClient.request(
                .listRecommendations(
                    page: currentPage,
                    pageSize: pageSize,
                    search: searchText.isEmpty ? nil : searchText,
                    sort: selectedSort.rawValue
                )
            )
            guard generation == requestGeneration else {
                return
            }
            recommendations = response.recommendations
            hasMorePages = response.pagination.page < response.pagination.totalPages
        } catch let error as NetworkError {
            guard generation == requestGeneration else {
                return
            }
            if case .cancelled = error {
                return
            }
            errorMessage = error.localizedDescription
        } catch is CancellationError {
            return
        } catch {
            guard generation == requestGeneration else {
                return
            }
            errorMessage = error.localizedDescription
        }

    }

    func loadNextPage() async {
        let generation = requestGeneration
        guard hasMorePages, !isLoadingMore, !isLoading else { return }
        isLoadingMore = true
        defer { isLoadingMore = false }
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
            guard generation == requestGeneration else {
                return
            }
            recommendations.append(contentsOf: response.recommendations)
            hasMorePages = response.pagination.page < response.pagination.totalPages
        } catch let error as NetworkError {
            guard generation == requestGeneration else {
                return
            }
            if case .cancelled = error {
                currentPage -= 1
                return
            }
            errorMessage = error.localizedDescription
            currentPage -= 1
        } catch is CancellationError {
            currentPage -= 1
            return
        } catch {
            guard generation == requestGeneration else {
                return
            }
            errorMessage = error.localizedDescription
            currentPage -= 1
        }

    }

    func deleteRecommendations(at offsets: IndexSet) async {
        for index in offsets {
            let rec = recommendations[index]
            do {
                struct EmptyResponse: Codable {}
                let _: EmptyResponse = try await apiClient.request(.deleteRecommendation(id: rec.id))
                recommendations.remove(at: index)
            } catch let error as NetworkError {
                if case .cancelled = error {
                    continue
                }
                errorMessage = "Failed to delete: \(error.localizedDescription)"
            } catch is CancellationError {
                continue
            } catch {
                errorMessage = "Failed to delete: \(error.localizedDescription)"
            }
        }
    }
}
