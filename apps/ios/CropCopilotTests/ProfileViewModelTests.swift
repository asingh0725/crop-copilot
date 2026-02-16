//
//  ProfileViewModelTests.swift
//  CropCopilotTests
//
//  Created by Claude Code on Phase 2
//

import XCTest
@testable import CropCopilot

@MainActor
final class ProfileViewModelTests: XCTestCase {

    func testInitialState() {
        let viewModel = ProfileViewModel()
        XCTAssertEqual(viewModel.location, "")
        XCTAssertEqual(viewModel.farmSize, "")
        XCTAssertTrue(viewModel.selectedCrops.isEmpty)
        XCTAssertNil(viewModel.experienceLevel)
        XCTAssertFalse(viewModel.isSaving)
        XCTAssertFalse(viewModel.isLoading)
        XCTAssertNil(viewModel.errorMessage)
        XCTAssertNil(viewModel.successMessage)
    }

    func testToggleCropAdds() {
        let viewModel = ProfileViewModel()
        viewModel.toggleCrop("Corn")
        XCTAssertTrue(viewModel.selectedCrops.contains("Corn"))
    }

    func testToggleCropRemoves() {
        let viewModel = ProfileViewModel()
        viewModel.toggleCrop("Corn")
        viewModel.toggleCrop("Corn")
        XCTAssertFalse(viewModel.selectedCrops.contains("Corn"))
    }

    func testToggleMultipleCrops() {
        let viewModel = ProfileViewModel()
        viewModel.toggleCrop("Corn")
        viewModel.toggleCrop("Soybeans")
        viewModel.toggleCrop("Wheat")
        XCTAssertEqual(viewModel.selectedCrops.count, 3)
        viewModel.toggleCrop("Soybeans")
        XCTAssertEqual(viewModel.selectedCrops.count, 2)
        XCTAssertFalse(viewModel.selectedCrops.contains("Soybeans"))
    }

    func testAvailableCropsNotEmpty() {
        let viewModel = ProfileViewModel()
        XCTAssertFalse(viewModel.availableCrops.isEmpty)
        XCTAssertTrue(viewModel.availableCrops.contains("Corn"))
    }
}
