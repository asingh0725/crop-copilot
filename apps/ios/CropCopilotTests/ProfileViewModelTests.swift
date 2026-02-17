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
        viewModel.toggleCrop("corn")
        XCTAssertTrue(viewModel.selectedCrops.contains("corn"))
    }

    func testToggleCropRemoves() {
        let viewModel = ProfileViewModel()
        viewModel.toggleCrop("corn")
        viewModel.toggleCrop("corn")
        XCTAssertFalse(viewModel.selectedCrops.contains("corn"))
    }

    func testToggleMultipleCrops() {
        let viewModel = ProfileViewModel()
        viewModel.toggleCrop("corn")
        viewModel.toggleCrop("soybeans")
        viewModel.toggleCrop("wheat")
        XCTAssertEqual(viewModel.selectedCrops.count, 3)
        viewModel.toggleCrop("soybeans")
        XCTAssertEqual(viewModel.selectedCrops.count, 2)
        XCTAssertFalse(viewModel.selectedCrops.contains("soybeans"))
    }

    func testAvailableCropsMatchWebApp() {
        let viewModel = ProfileViewModel()
        XCTAssertEqual(viewModel.availableCrops.count, 31)
        XCTAssertTrue(viewModel.availableCrops.contains(where: { $0.value == "corn" && $0.label == "Corn" }))
        XCTAssertTrue(viewModel.availableCrops.contains(where: { $0.value == "tomatoes" && $0.label == "Tomatoes" }))
        XCTAssertTrue(viewModel.availableCrops.contains(where: { $0.value == "soybeans" && $0.label == "Soybeans" }))
        XCTAssertTrue(viewModel.availableCrops.contains(where: { $0.value == "sugar beets" && $0.label == "Sugar Beets" }))
    }

    func testExperienceLevelsMatchWebApp() {
        let levels = ExperienceLevel.allCases
        XCTAssertEqual(levels.count, 4)
        XCTAssertEqual(levels[0].rawValue, "beginner")
        XCTAssertEqual(levels[1].rawValue, "intermediate")
        XCTAssertEqual(levels[2].rawValue, "advanced")
        XCTAssertEqual(levels[3].rawValue, "professional")
    }
}
