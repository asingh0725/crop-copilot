//
//  AuthRepository.swift
//  CropCopilot
//
//  Created by Claude Code on Phase 1
//

import Foundation
import Supabase
import AuthenticationServices
import CryptoKit

class AuthRepository {
    private let supabase: SupabaseClient
    private let keychainManager = KeychainManager.shared

    init(supabase: SupabaseClient) {
        self.supabase = supabase
    }

    // MARK: - Sign In
    func signIn(email: String, password: String) async throws -> User {
        let session = try await supabase.auth.signIn(
            email: email,
            password: password
        )

        // Save tokens to Keychain
        keychainManager.save(session.accessToken, for: .accessToken)
        keychainManager.save(session.refreshToken, for: .refreshToken)

        return User(
            id: session.user.id.uuidString,
            email: session.user.email ?? email,
            createdAt: session.user.createdAt
        )
    }

    // MARK: - Sign Up
    func signUp(email: String, password: String) async throws -> User {
        let response = try await supabase.auth.signUp(
            email: email,
            password: password
        )

        // Save tokens to Keychain if session is available
        // (session may be nil when email confirmation is required)
        if let session = response.session {
            keychainManager.save(session.accessToken, for: .accessToken)
            keychainManager.save(session.refreshToken, for: .refreshToken)
        }

        let user = response.user
        return User(
            id: user.id.uuidString,
            email: user.email ?? email,
            createdAt: user.createdAt
        )
    }

    // MARK: - Sign In with Apple
    func signInWithApple(idToken: String, nonce: String) async throws -> User {
        let session = try await supabase.auth.signInWithIdToken(
            credentials: .init(
                provider: .apple,
                idToken: idToken,
                nonce: nonce
            )
        )

        // Save tokens to Keychain
        keychainManager.save(session.accessToken, for: .accessToken)
        keychainManager.save(session.refreshToken, for: .refreshToken)

        return User(
            id: session.user.id.uuidString,
            email: session.user.email ?? "",
            createdAt: session.user.createdAt
        )
    }

    // MARK: - Sign Out
    func signOut() async throws {
        try await supabase.auth.signOut()
        keychainManager.deleteAll()
    }

    // MARK: - Refresh Session
    func refreshSession() async throws {
        let session = try await supabase.auth.refreshSession()

        // Update tokens in Keychain
        keychainManager.save(session.accessToken, for: .accessToken)
        keychainManager.save(session.refreshToken, for: .refreshToken)
    }

    // MARK: - Get Current User
    func getCurrentUser() async throws -> User? {
        guard keychainManager.get(for: .accessToken) != nil else {
            return nil
        }

        let user = try await supabase.auth.user()

        return User(
            id: user.id.uuidString,
            email: user.email ?? "",
            createdAt: user.createdAt
        )
    }

    // MARK: - Reset Password
    func resetPassword(email: String) async throws {
        try await supabase.auth.resetPasswordForEmail(email)
    }

    // MARK: - Nonce Generation (for Apple Sign In CSRF protection)
    static func randomNonceString(length: Int = 32) -> String {
        precondition(length > 0)
        var randomBytes = [UInt8](repeating: 0, count: length)
        let errorCode = SecRandomCopyBytes(kSecRandomDefault, randomBytes.count, &randomBytes)
        if errorCode != errSecSuccess {
            fatalError("Unable to generate nonce. SecRandomCopyBytes failed with OSStatus \(errorCode)")
        }
        let charset: [Character] = Array("0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._")
        return String(randomBytes.map { charset[Int($0) % charset.count] })
    }

    static func sha256(_ input: String) -> String {
        let inputData = Data(input.utf8)
        let hashedData = SHA256.hash(data: inputData)
        return hashedData.compactMap { String(format: "%02x", $0) }.joined()
    }
}
