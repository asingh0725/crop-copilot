//
//  RecommendationsViewModelTests.swift
//  CropCopilotTests
//
//  Created by Claude Code on Phase 2
//

import XCTest
@testable import CropCopilot

@MainActor
final class RecommendationsViewModelTests: XCTestCase {

    func testInitialState() {
        let viewModel = RecommendationsViewModel()
        XCTAssertTrue(viewModel.recommendations.isEmpty)
        XCTAssertFalse(viewModel.isLoading)
        XCTAssertFalse(viewModel.isLoadingMore)
        XCTAssertNil(viewModel.errorMessage)
        XCTAssertEqual(viewModel.searchText, "")
        XCTAssertEqual(viewModel.selectedSort, .dateDesc)
        XCTAssertFalse(viewModel.hasMorePages)
    }

    func testSortOptionDisplayNames() {
        XCTAssertEqual(RecommendationsViewModel.SortOption.dateDesc.displayName, "Newest")
        XCTAssertEqual(RecommendationsViewModel.SortOption.dateAsc.displayName, "Oldest")
        XCTAssertEqual(RecommendationsViewModel.SortOption.confidenceHigh.displayName, "High Confidence")
        XCTAssertEqual(RecommendationsViewModel.SortOption.confidenceLow.displayName, "Low Confidence")
    }

    func testSortOptionRawValues() {
        XCTAssertEqual(RecommendationsViewModel.SortOption.dateDesc.rawValue, "date_desc")
        XCTAssertEqual(RecommendationsViewModel.SortOption.dateAsc.rawValue, "date_asc")
        XCTAssertEqual(RecommendationsViewModel.SortOption.confidenceHigh.rawValue, "confidence_high")
        XCTAssertEqual(RecommendationsViewModel.SortOption.confidenceLow.rawValue, "confidence_low")
    }

    func testLoadSetsLoadingState() async {
        let viewModel = RecommendationsViewModel()
        await viewModel.loadRecommendations()
        XCTAssertFalse(viewModel.isLoading)
    }

    func testResetClearsRecommendations() async {
        let viewModel = RecommendationsViewModel()
        await viewModel.loadRecommendations(reset: true)
        // After reset + load (which will fail without server), list should be empty
        XCTAssertTrue(viewModel.recommendations.isEmpty)
    }
}
