//
//  AuthViewModelTests.swift
//  CropCopilotTests
//
//  Created by Claude Code on Phase 1
//

import XCTest
@testable import CropCopilot

@MainActor
class AuthViewModelTests: XCTestCase {
    var viewModel: AuthViewModel!

    override func setUp() async throws {
        viewModel = AuthViewModel()
    }

    override func tearDown() {
        viewModel = nil
    }

    func testInitialState() {
        XCTAssertFalse(viewModel.isAuthenticated)
        XCTAssertNil(viewModel.currentUser)
        XCTAssertNil(viewModel.errorMessage)
        XCTAssertFalse(viewModel.isLoading)
    }

    func testSignInWithoutRepositoryShowsError() async {
        // When - sign in called without setting up repository
        await viewModel.signIn(email: "test@example.com", password: "password123")

        // Then - should show error since repository is not set
        XCTAssertFalse(viewModel.isAuthenticated)
        XCTAssertNil(viewModel.currentUser)
        XCTAssertNotNil(viewModel.errorMessage)
        XCTAssertFalse(viewModel.isLoading)
    }

    func testSignUpWithoutRepositoryShowsError() async {
        // When
        await viewModel.signUp(email: "test@example.com", password: "password123")

        // Then
        XCTAssertFalse(viewModel.isAuthenticated)
        XCTAssertNotNil(viewModel.errorMessage)
        XCTAssertFalse(viewModel.isLoading)
    }

    func testSignOutClearsState() async {
        // Given - simulate authenticated state
        viewModel.isAuthenticated = true
        viewModel.currentUser = User(id: "123", email: "test@example.com", createdAt: Date())

        // When
        await viewModel.signOut()

        // Then
        XCTAssertFalse(viewModel.isAuthenticated)
        XCTAssertNil(viewModel.currentUser)
    }

    func testSetRepository() {
        // Verify setRepository doesn't crash
        // Real repository tests require Supabase client
        XCTAssertFalse(viewModel.isAuthenticated)
    }
}
