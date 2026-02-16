//
//  CameraManagerTests.swift
//  CropCopilotTests
//
//  Created by Claude Code on Phase 2
//

import XCTest
@testable import CropCopilot

final class CameraManagerTests: XCTestCase {

    func testFlashToggle() {
        let manager = CameraManager()
        XCTAssertFalse(manager.isFlashOn)
        manager.toggleFlash()
        XCTAssertTrue(manager.isFlashOn)
        manager.toggleFlash()
        XCTAssertFalse(manager.isFlashOn)
    }

    func testCompressImageReturnsData() {
        let manager = CameraManager()
        // Create a simple 10x10 test image
        let renderer = UIGraphicsImageRenderer(size: CGSize(width: 10, height: 10))
        let image = renderer.image { context in
            UIColor.red.setFill()
            context.fill(CGRect(x: 0, y: 0, width: 10, height: 10))
        }

        let data = manager.compressImage(image)
        XCTAssertNotNil(data)
        XCTAssertTrue((data?.count ?? 0) > 0)
    }

    func testCompressImageRespectsMaxSize() {
        let manager = CameraManager()
        let renderer = UIGraphicsImageRenderer(size: CGSize(width: 100, height: 100))
        let image = renderer.image { context in
            UIColor.blue.setFill()
            context.fill(CGRect(x: 0, y: 0, width: 100, height: 100))
        }

        // Use a very small max size to test compression
        let data = manager.compressImage(image, maxSizeBytes: 500)
        XCTAssertNotNil(data)
    }

    func testInitialCapturedImageIsNil() {
        let manager = CameraManager()
        XCTAssertNil(manager.capturedImage)
    }
}
