//
//  NetworkError.swift
//  CropCopilot
//
//  Created by Claude Code on Phase 1
//

import Foundation

enum NetworkError: LocalizedError {
    case unauthorized
    case forbidden
    case notFound
    case serverError(statusCode: Int)
    case noInternet
    case timeout
    case decodingError(Error)
    case encodingError(Error)
    case unknown(Error)

    var errorDescription: String? {
        switch self {
        case .unauthorized:
            return "You are not authorized. Please log in again."
        case .forbidden:
            return "You don't have permission to access this resource."
        case .notFound:
            return "The requested resource was not found."
        case .serverError(let statusCode):
            return "Server error (\(statusCode)). Please try again later."
        case .noInternet:
            return "No internet connection. Please check your network."
        case .timeout:
            return "Request timed out. Please try again."
        case .decodingError(let error):
            return "Failed to process server response: \(error.localizedDescription)"
        case .encodingError(let error):
            return "Failed to prepare request: \(error.localizedDescription)"
        case .unknown(let error):
            return "An unexpected error occurred: \(error.localizedDescription)"
        }
    }

    var recoverySuggestion: String? {
        switch self {
        case .unauthorized:
            return "Try logging in again."
        case .forbidden:
            return "Contact support if you believe this is an error."
        case .notFound:
            return "The item may have been deleted."
        case .serverError:
            return "Wait a few moments and try again."
        case .noInternet:
            return "Check your WiFi or cellular connection."
        case .timeout:
            return "Check your connection and try again."
        case .decodingError, .encodingError, .unknown:
            return "If the problem persists, please contact support."
        }
    }
}
