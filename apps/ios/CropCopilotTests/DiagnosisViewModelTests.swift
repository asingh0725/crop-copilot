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

    func testCropOptionsMatchWebApp() {
        let viewModel = DiagnosisViewModel()
        XCTAssertFalse(viewModel.cropOptions.isEmpty)
        XCTAssertTrue(viewModel.cropOptions.contains(where: { $0.value == "corn" && $0.label == "Corn" }))
        XCTAssertTrue(viewModel.cropOptions.contains(where: { $0.value == "tomatoes" && $0.label == "Tomatoes" }))
        XCTAssertTrue(viewModel.cropOptions.contains(where: { $0.value == "soybeans" && $0.label == "Soybeans" }))
        XCTAssertEqual(viewModel.cropOptions.count, 31)
    }

    func testGrowthStageOptionsMatchWebApp() {
        let viewModel = DiagnosisViewModel()
        XCTAssertEqual(viewModel.growthStageOptions, ["Seedling", "Vegetative", "Flowering", "Fruiting", "Mature", "Harvest"])
    }
}
