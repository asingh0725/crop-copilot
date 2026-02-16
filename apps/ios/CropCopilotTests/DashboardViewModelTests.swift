//
//  DashboardViewModelTests.swift
//  CropCopilotTests
//
//  Created by Claude Code on Phase 2
//

import XCTest
@testable import CropCopilot

@MainActor
final class DashboardViewModelTests: XCTestCase {

    func testInitialState() {
        let viewModel = DashboardViewModel()
        XCTAssertTrue(viewModel.recentRecommendations.isEmpty)
        XCTAssertFalse(viewModel.isLoading)
        XCTAssertNil(viewModel.errorMessage)
    }

    func testLoadSetsLoadingState() async {
        let viewModel = DashboardViewModel()
        // Without a real server, this will fail with an error
        // but the loading state should be managed correctly
        await viewModel.loadRecentRecommendations()
        XCTAssertFalse(viewModel.isLoading) // loading should be false after completion
    }
}
