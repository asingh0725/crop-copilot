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
struct RecommendationDetailResponse: Decodable, Identifiable {
    let id: String
    let createdAt: String
    let diagnosis: DiagnosisData
    let confidence: Double
    let modelUsed: String
    let input: RecommendationInputDetail
    let sources: [RecommendationSourceDetail]

    enum CodingKeys: String, CodingKey {
        case id
        case createdAt
        case diagnosis
        case confidence
        case modelUsed
        case input
        case sources
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        createdAt = try container.decodeIfPresent(String.self, forKey: .createdAt) ?? ""
        diagnosis = (try? container.decode(DiagnosisData.self, forKey: .diagnosis))
            ?? DiagnosisData(
                diagnosis: DiagnosisDetails(
                    condition: "Unknown condition",
                    conditionType: "unknown",
                    severity: nil,
                    confidence: 0,
                    reasoning: "No diagnostic reasoning was returned yet.",
                    differentialDiagnosis: nil
                ),
                recommendations: [],
                products: [],
                sources: [],
                confidence: 0
            )
        confidence = try container.decodeIfPresent(Double.self, forKey: .confidence) ?? diagnosis.confidence
        modelUsed = try container.decodeIfPresent(String.self, forKey: .modelUsed) ?? "unknown"
        input = try container.decode(RecommendationInputDetail.self, forKey: .input)
        sources = try container.decodeIfPresent([RecommendationSourceDetail].self, forKey: .sources) ?? []
    }
}

struct RecommendationInputDetail: Decodable {
    let id: String
    let type: String
    let description: String?
    let imageUrl: String?
    let labData: [String: AnyCodable]?
    let crop: String?
    let location: String?
    let season: String?
    let createdAt: String

    enum CodingKeys: String, CodingKey {
        case id
        case type
        case description
        case imageUrl
        case labData
        case crop
        case location
        case season
        case createdAt
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        type = try container.decodeIfPresent(String.self, forKey: .type) ?? "UNKNOWN"
        description = try container.decodeIfPresent(String.self, forKey: .description)
        imageUrl = try container.decodeIfPresent(String.self, forKey: .imageUrl)
        labData = try container.decodeIfPresent([String: AnyCodable].self, forKey: .labData)
        crop = try container.decodeIfPresent(String.self, forKey: .crop)
        location = try container.decodeIfPresent(String.self, forKey: .location)
        season = try container.decodeIfPresent(String.self, forKey: .season)
        createdAt = try container.decodeIfPresent(String.self, forKey: .createdAt) ?? ""
    }
}

struct RecommendationSourceDetail: Decodable, Identifiable {
    let id: String
    let chunkId: String?
    let type: String
    let content: String?
    let imageUrl: String?
    let relevanceScore: Double?
    let source: SourceReference?

    enum CodingKeys: String, CodingKey {
        case id
        case chunkId
        case type
        case content
        case imageUrl
        case relevanceScore
        case source
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        chunkId = try container.decodeIfPresent(String.self, forKey: .chunkId)
        type = try container.decodeIfPresent(String.self, forKey: .type) ?? "text"
        content = try container.decodeIfPresent(String.self, forKey: .content)
        imageUrl = try container.decodeIfPresent(String.self, forKey: .imageUrl)
        relevanceScore = try container.decodeIfPresent(Double.self, forKey: .relevanceScore)
        source = try container.decodeIfPresent(SourceReference.self, forKey: .source)
    }
}

struct SourceReference: Decodable {
    let id: String
    let title: String
    let type: String
    let url: String?
}

// MARK: - Async Recommendation Contract
struct CreateInputAcceptedResponse: Codable {
    let inputId: String
    let jobId: String
    let status: String
    let acceptedAt: String
}

struct RecommendationJobStatusResponse: Decodable {
    let inputId: String
    let jobId: String
    let status: String
    let updatedAt: String
    let failureReason: String?
    let result: RecommendationJobResult?
}

struct RecommendationJobResult: Decodable {
    let recommendationId: String
    let confidence: Double
    let diagnosis: [String: AnyCodable]
    let sources: [RecommendationJobSource]
    let modelUsed: String

    enum CodingKeys: String, CodingKey {
        case recommendationId
        case confidence
        case diagnosis
        case sources
        case modelUsed
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        recommendationId = try container.decode(String.self, forKey: .recommendationId)
        confidence = try container.decodeIfPresent(Double.self, forKey: .confidence) ?? 0
        diagnosis = try container.decodeIfPresent([String: AnyCodable].self, forKey: .diagnosis) ?? [:]
        sources = try container.decodeIfPresent([RecommendationJobSource].self, forKey: .sources) ?? []
        modelUsed = try container.decodeIfPresent(String.self, forKey: .modelUsed) ?? "unknown"
    }
}

struct RecommendationJobSource: Decodable {
    let chunkId: String
    let relevance: Double
    let excerpt: String

    enum CodingKeys: String, CodingKey {
        case chunkId
        case id
        case relevance
        case score
        case excerpt
        case content
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        chunkId =
            try container.decodeIfPresent(String.self, forKey: .chunkId)
            ?? (try container.decodeIfPresent(String.self, forKey: .id))
            ?? UUID().uuidString
        relevance =
            try container.decodeIfPresent(Double.self, forKey: .relevance)
            ?? (try container.decodeIfPresent(Double.self, forKey: .score))
            ?? 0
        excerpt =
            try container.decodeIfPresent(String.self, forKey: .excerpt)
            ?? (try container.decodeIfPresent(String.self, forKey: .content))
            ?? ""
    }
}

// MARK: - Upload URL Response
struct UploadUrlResponse: Codable {
    let uploadUrl: String
    let objectKey: String
    let expiresInSeconds: Int
}

struct UploadViewUrlResponse: Decodable {
    let downloadUrl: String
    let expiresInSeconds: Int
}

// MARK: - Products Responses
struct ProductsListResponse: Decodable {
    let products: [ProductListItem]
    let total: Int
    let limit: Int
    let offset: Int
}

struct ProductListItem: Decodable, Identifiable {
    let id: String
    let name: String
    let brand: String?
    let type: String
    let description: String?
    let applicationRate: String?
    let crops: [String]?
}

// MARK: - Profile Response
struct ProfileResponse: Codable {
    let profile: ProfileData
}

struct ProfileData: Codable {
    let userId: String
    let location: String?
    let farmSize: String?
    let cropsOfInterest: [String]?
    let experienceLevel: String?
    let createdAt: String
    let updatedAt: String
}

// MARK: - Feedback Request
struct FeedbackRequest: Codable {
    let recommendationId: String
    let stage: String?
    let helpful: Bool?
    let rating: Int?
    let accuracy: Int?
    let comments: String?
    let issues: [String]?
    let outcomeApplied: Bool?
    let outcomeSuccess: Bool?
    let outcomeNotes: String?
}

struct FeedbackRecord: Codable {
    let id: String
    let recommendationId: String
    let userId: String
    let helpful: Bool?
    let rating: Int?
    let accuracy: Int?
    let comments: String?
    let issues: [String]
    let detailedCompletedAt: String?
    let outcomeApplied: Bool?
    let outcomeSuccess: Bool?
    let outcomeNotes: String?
    let outcomeReported: Bool
    let createdAt: String
    let updatedAt: String
}

struct FeedbackGetResponse: Codable {
    let feedback: FeedbackRecord?
}

struct FeedbackSubmitResponse: Codable {
    let success: Bool
    let feedback: FeedbackRecord
}

// MARK: - Error Response
struct APIErrorResponse: Codable {
    let error: String
    let details: String?
}
