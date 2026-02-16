//
//  DiagnosisViewModelTests.swift
//  CropCopilotTests
//
//  Created by Claude Code on Phase 2
//

import XCTest
@testable import CropCopilot

@MainActor
final class DiagnosisViewModelTests: XCTestCase {

    func testInitialState() {
        let viewModel = DiagnosisViewModel()
        XCTAssertEqual(viewModel.selectedCrop, "")
        XCTAssertEqual(viewModel.growthStage, "")
        XCTAssertEqual(viewModel.location, "")
        XCTAssertEqual(viewModel.description, "")
        XCTAssertFalse(viewModel.isSubmitting)
        XCTAssertNil(viewModel.errorMessage)
        XCTAssertFalse(viewModel.showResult)
        XCTAssertNil(viewModel.resultRecommendationId)
    }

    func testCropOptionsNotEmpty() {
        let viewModel = DiagnosisViewModel()
        XCTAssertFalse(viewModel.cropOptions.isEmpty)
        XCTAssertTrue(viewModel.cropOptions.contains("Corn"))
        XCTAssertTrue(viewModel.cropOptions.contains("Other"))
    }
}
