//
//  AuthViewModel.swift
//  CropCopilot
//
//  Created by Claude Code on Phase 1
//

import Foundation
import SwiftUI
import AuthenticationServices
import Supabase

@MainActor
class AuthViewModel: ObservableObject {
    @Published var isAuthenticated = false
    @Published var currentUser: User?
    @Published var errorMessage: String?
    @Published var isLoading = false

    private var authRepository: AuthRepository?

    init() {
        // Repository will be injected via environment
        checkAuthStatus()
        setupAuthCallbackListener()
    }

    func setRepository(_ repository: AuthRepository) {
        self.authRepository = repository
        checkAuthStatus()
    }

    // MARK: - Check Auth Status
    private func checkAuthStatus() {
        Task {
            do {
                guard let repository = authRepository else { return }
                let user = try await repository.getCurrentUser()
                if let user = user {
                    currentUser = user
                    isAuthenticated = true
                }
            } catch {
                // No valid session
                isAuthenticated = false
            }
        }
    }

    // MARK: - Sign In
    func signIn(email: String, password: String) async {
        isLoading = true
        errorMessage = nil

        do {
            guard let repository = authRepository else {
                errorMessage = "Auth repository not initialized"
                isLoading = false
                return
            }

            let user = try await repository.signIn(email: email, password: password)
            currentUser = user
            isAuthenticated = true
        } catch {
            errorMessage = error.localizedDescription
        }

        isLoading = false
    }

    // MARK: - Sign Up
    func signUp(email: String, password: String) async {
        isLoading = true
        errorMessage = nil

        do {
            guard let repository = authRepository else {
                errorMessage = "Auth repository not initialized"
                isLoading = false
                return
            }

            let user = try await repository.signUp(email: email, password: password)
            currentUser = user
            isAuthenticated = true
        } catch {
            errorMessage = error.localizedDescription
        }

        isLoading = false
    }

    // MARK: - Sign In with Apple
    func signInWithApple() async {
        // This will be handled by ASAuthorizationControllerDelegate
        // Implementation in the view
    }

    func handleSignInWithAppleCompletion(idToken: String, nonce: String) async {
        isLoading = true
        errorMessage = nil

        do {
            guard let repository = authRepository else {
                errorMessage = "Auth repository not initialized"
                isLoading = false
                return
            }

            let user = try await repository.signInWithApple(idToken: idToken, nonce: nonce)
            currentUser = user
            isAuthenticated = true
        } catch {
            errorMessage = error.localizedDescription
        }

        isLoading = false
    }

    // MARK: - Sign Out
    func signOut() async {
        // Always clear local state, even if server sign-out fails
        defer {
            currentUser = nil
            isAuthenticated = false
            KeychainManager.shared.deleteAll()
        }

        do {
            try await authRepository?.signOut()
        } catch {
            // Server sign-out failed, but local state is still cleared
            print("Sign out error: \(error.localizedDescription)")
        }
    }

    // MARK: - Reset Password
    func resetPassword(email: String) async {
        isLoading = true
        errorMessage = nil

        do {
            guard let repository = authRepository else {
                errorMessage = "Auth repository not initialized"
                isLoading = false
                return
            }

            try await repository.resetPassword(email: email)
            // Show success message (could add a @Published var for this)
        } catch {
            errorMessage = error.localizedDescription
        }

        isLoading = false
    }

    // MARK: - Handle Deep Links
    private func setupAuthCallbackListener() {
        NotificationCenter.default.addObserver(
            forName: .didReceiveAuthCallback,
            object: nil,
            queue: .main
        ) { [weak self] notification in
            guard let url = notification.object as? URL else { return }
            self?.handleAuthCallback(url: url)
        }
    }

    private func handleAuthCallback(url: URL) {
        // Parse OAuth callback URL
        // Format: cropcopilot://auth/callback?access_token=...&refresh_token=...
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              let queryItems = components.queryItems else {
            return
        }

        let accessToken = queryItems.first(where: { $0.name == "access_token" })?.value
        let refreshToken = queryItems.first(where: { $0.name == "refresh_token" })?.value

        if let accessToken = accessToken {
            // Save tokens
            _ = KeychainManager.shared.save(accessToken, for: .accessToken)
            if let refreshToken = refreshToken {
                _ = KeychainManager.shared.save(refreshToken, for: .refreshToken)
            }

            // Update auth state
            isAuthenticated = true
            checkAuthStatus()
        }
    }
}
