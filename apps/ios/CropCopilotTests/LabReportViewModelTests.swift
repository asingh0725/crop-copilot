//
//  LabReportViewModelTests.swift
//  CropCopilotTests
//
//  Created by Claude Code on Phase 2
//

import XCTest
@testable import CropCopilot

@MainActor
final class LabReportViewModelTests: XCTestCase {

    func testInitialState() {
        let viewModel = LabReportViewModel()
        XCTAssertEqual(viewModel.crop, "")
        XCTAssertEqual(viewModel.location, "")
        XCTAssertEqual(viewModel.pH, "")
        XCTAssertEqual(viewModel.nitrogen, "")
        XCTAssertEqual(viewModel.phosphorus, "")
        XCTAssertEqual(viewModel.potassium, "")
        XCTAssertFalse(viewModel.isSubmitting)
        XCTAssertNil(viewModel.errorMessage)
        XCTAssertFalse(viewModel.showResult)
        XCTAssertNil(viewModel.resultRecommendationId)
    }

    func testCropOptionsNotEmpty() {
        let viewModel = LabReportViewModel()
        XCTAssertFalse(viewModel.cropOptions.isEmpty)
        XCTAssertTrue(viewModel.cropOptions.contains("Corn"))
    }

    func testAllFieldsInitiallyEmpty() {
        let viewModel = LabReportViewModel()
        // All numeric fields should start empty
        XCTAssertEqual(viewModel.organicMatter, "")
        XCTAssertEqual(viewModel.calcium, "")
        XCTAssertEqual(viewModel.magnesium, "")
        XCTAssertEqual(viewModel.sulfur, "")
        XCTAssertEqual(viewModel.iron, "")
        XCTAssertEqual(viewModel.manganese, "")
        XCTAssertEqual(viewModel.zinc, "")
        XCTAssertEqual(viewModel.copper, "")
        XCTAssertEqual(viewModel.boron, "")
        XCTAssertEqual(viewModel.cec, "")
        XCTAssertEqual(viewModel.baseSaturation, "")
        XCTAssertEqual(viewModel.soilTexture, "")
    }
}
