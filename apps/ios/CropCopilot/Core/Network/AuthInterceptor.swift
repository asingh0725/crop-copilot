//
//  AuthInterceptor.swift
//  CropCopilot
//
//  Created by Claude Code on Phase 1
//

import Foundation

actor AuthInterceptor {
    private let keychainManager = KeychainManager.shared
    private var isRefreshing = false
    private var pendingContinuations: [CheckedContinuation<String, Error>] = []

    func addAuthHeader(to request: inout URLRequest) {
        if let token = keychainManager.get(for: .accessToken) {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
    }

    func handleUnauthorized() async throws -> String {
        // If already refreshing, wait for the result
        if isRefreshing {
            return try await withCheckedThrowingContinuation { continuation in
                pendingContinuations.append(continuation)
            }
        }

        isRefreshing = true

        do {
            let newToken = try await refreshToken()
            isRefreshing = false
            // Resume all pending continuations
            for continuation in pendingContinuations {
                continuation.resume(returning: newToken)
            }
            pendingContinuations.removeAll()
            return newToken
        } catch {
            isRefreshing = false
            // Resume all pending continuations with error
            for continuation in pendingContinuations {
                continuation.resume(throwing: error)
            }
            pendingContinuations.removeAll()
            throw error
        }
    }

    private func refreshToken() async throws -> String {
        guard let refreshToken = keychainManager.get(for: .refreshToken) else {
            throw NetworkError.unauthorized
        }

        // Call Supabase's GoTrue token refresh endpoint directly
        guard let url = URL(string: Configuration.supabaseURL + "/auth/v1/token?grant_type=refresh_token") else {
            throw NetworkError.unauthorized
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer " + Configuration.supabaseAnonKey, forHTTPHeaderField: "apikey")

        let body = ["refresh_token": refreshToken]
        request.httpBody = try JSONEncoder().encode(body)

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw NetworkError.unauthorized
        }

        struct RefreshResponse: Codable {
            let access_token: String
            let refresh_token: String
        }

        let refreshResponse = try JSONDecoder().decode(RefreshResponse.self, from: data)

        // Save new tokens
        keychainManager.save(refreshResponse.access_token, for: .accessToken)
        keychainManager.save(refreshResponse.refresh_token, for: .refreshToken)

        return refreshResponse.access_token
    }
}
