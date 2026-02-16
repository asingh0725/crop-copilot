//
//  KeychainManagerTests.swift
//  CropCopilotTests
//
//  Created by Claude Code on Phase 1
//

import XCTest
@testable import CropCopilot

class KeychainManagerTests: XCTestCase {
    var keychainManager: KeychainManager!

    override func setUp() {
        keychainManager = KeychainManager.shared
        // Clean up before each test
        keychainManager.deleteAll()
    }

    override func tearDown() {
        keychainManager.deleteAll()
        keychainManager = nil
    }

    func testSaveAndRetrieveToken() {
        // Given
        let token = "test_access_token_12345"

        // When
        let saveResult = keychainManager.save(token, for: .accessToken)
        let retrievedToken = keychainManager.get(for: .accessToken)

        // Then
        XCTAssertTrue(saveResult, "Token should be saved successfully")
        XCTAssertEqual(retrievedToken, token, "Retrieved token should match saved token")
    }

    func testDeleteToken() {
        // Given
        let token = "test_token"
        keychainManager.save(token, for: .accessToken)

        // When
        let deleteResult = keychainManager.delete(for: .accessToken)
        let retrievedToken = keychainManager.get(for: .accessToken)

        // Then
        XCTAssertTrue(deleteResult, "Token should be deleted successfully")
        XCTAssertNil(retrievedToken, "Token should be nil after deletion")
    }

    func testDeleteNonExistentToken() {
        // When
        let deleteResult = keychainManager.delete(for: .accessToken)

        // Then
        XCTAssertTrue(deleteResult, "Deleting non-existent token should return true")
    }

    func testUpdateToken() {
        // Given
        let originalToken = "original_token"
        let updatedToken = "updated_token"

        // When
        keychainManager.save(originalToken, for: .accessToken)
        keychainManager.save(updatedToken, for: .accessToken)
        let retrievedToken = keychainManager.get(for: .accessToken)

        // Then
        XCTAssertEqual(retrievedToken, updatedToken, "Token should be updated")
        XCTAssertNotEqual(retrievedToken, originalToken, "Token should not be original")
    }

    func testSaveMultipleTokens() {
        // Given
        let accessToken = "access_token"
        let refreshToken = "refresh_token"

        // When
        keychainManager.save(accessToken, for: .accessToken)
        keychainManager.save(refreshToken, for: .refreshToken)

        // Then
        XCTAssertEqual(keychainManager.get(for: .accessToken), accessToken)
        XCTAssertEqual(keychainManager.get(for: .refreshToken), refreshToken)
    }

    func testDeleteAll() {
        // Given
        keychainManager.save("access", for: .accessToken)
        keychainManager.save("refresh", for: .refreshToken)

        // When
        keychainManager.deleteAll()

        // Then
        XCTAssertNil(keychainManager.get(for: .accessToken))
        XCTAssertNil(keychainManager.get(for: .refreshToken))
    }
}
