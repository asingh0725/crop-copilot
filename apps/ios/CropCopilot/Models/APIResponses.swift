//
//  APIResponses.swift
//  CropCopilot
//
//  Created by Claude Code on Phase 2
//

import Foundation

// MARK: - Recommendations List Response
struct RecommendationsListResponse: Codable {
    let recommendations: [RecommendationSummary]
    let pagination: Pagination
}

struct RecommendationSummary: Codable, Identifiable {
    let id: String
    let createdAt: String
    let confidence: Double
    let condition: String
    let conditionType: String
    let firstAction: String?
    let input: RecommendationInputSummary
}

struct RecommendationInputSummary: Codable {
    let id: String
    let type: String
    let crop: String?
    let location: String?
    let imageUrl: String?
}

struct Pagination: Codable {
    let page: Int
    let pageSize: Int
    let total: Int
    let totalPages: Int
}

// MARK: - Recommendation Detail Response
struct RecommendationDetailResponse: Codable, Identifiable {
    let id: String
    let createdAt: String
    let diagnosis: DiagnosisData
    let confidence: Double
    let modelUsed: String
    let input: RecommendationInputDetail
    let sources: [RecommendationSourceDetail]
}

struct RecommendationInputDetail: Codable {
    let id: String
    let type: String
    let description: String?
    let imageUrl: String?
    let labData: [String: AnyCodable]?
    let crop: String?
    let location: String?
    let season: String?
    let createdAt: String
}

struct RecommendationSourceDetail: Codable, Identifiable {
    let id: String
    let chunkId: String?
    let type: String
    let content: String?
    let imageUrl: String?
    let relevanceScore: Double?
    let source: SourceReference?
}

struct SourceReference: Codable {
    let id: String
    let title: String
    let type: String
    let url: String?
}

// MARK: - Create Input Response
struct CreateInputResponse: Codable {
    let input: InputResponse
    let recommendationId: String
}

struct InputResponse: Codable {
    let id: String
    let userId: String
    let type: String
    let imageUrl: String?
    let description: String?
    let labData: [String: AnyCodable]?
    let location: String?
    let crop: String?
    let season: String?
    let createdAt: String
}

// MARK: - Upload Response
struct UploadResponse: Codable {
    let url: String
}

// MARK: - Profile Response
struct ProfileResponse: Codable {
    let profile: ProfileData
}

struct ProfileData: Codable {
    let id: String
    let userId: String
    let location: String?
    let farmSize: Double?
    let cropsOfInterest: [String]?
    let experienceLevel: String?
    let createdAt: String
    let updatedAt: String
}

// MARK: - Feedback Request
struct FeedbackRequest: Codable {
    let recommendationId: String
    let helpful: Bool?
    let rating: Int?
    let comments: String?
}

// MARK: - Error Response
struct APIErrorResponse: Codable {
    let error: String
    let details: String?
}
