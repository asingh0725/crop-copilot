//
//  Recommendation.swift
//  CropCopilot
//
//  Created by Claude Code on Phase 1
//

import Foundation

struct Recommendation: Codable, Identifiable {
    let id: String
    let userId: String
    let inputId: String
    let diagnosis: DiagnosisData
    let confidence: Double
    let modelUsed: String
    let createdAt: Date

    enum CodingKeys: String, CodingKey {
        case id
        case userId = "user_id"
        case inputId = "input_id"
        case diagnosis
        case confidence
        case modelUsed = "model_used"
        case createdAt = "created_at"
    }
}

// Matches the structure from the recommendation agent output
struct DiagnosisData: Codable {
    let diagnosis: DiagnosisDetails
    let recommendations: [RecommendationAction]
    let products: [RecommendedProduct]
    let sources: [Source]
    let confidence: Double
}

struct DiagnosisDetails: Codable {
    let condition: String
    let conditionType: String
    let severity: String?
    let confidence: Double
    let reasoning: String
    let differentialDiagnosis: [String]?

    enum CodingKeys: String, CodingKey {
        case condition
        case conditionType = "condition_type"
        case severity
        case confidence
        case reasoning
        case differentialDiagnosis = "differential_diagnosis"
    }
}

struct RecommendationAction: Codable, Identifiable {
    var id: String { action }
    let action: String
    let timing: String
    let priority: String
    let details: String
}

struct RecommendedProduct: Codable, Identifiable {
    var id: String { productName }
    let productName: String
    let productType: String
    let applicationRate: String?
    let reasoning: String

    enum CodingKeys: String, CodingKey {
        case productName = "product_name"
        case productType = "product_type"
        case applicationRate = "application_rate"
        case reasoning
    }
}

struct Source: Codable, Identifiable {
    var id: String { chunkId }
    let chunkId: String
    let title: String
    let url: String?
    let relevance: Double

    enum CodingKeys: String, CodingKey {
        case chunkId = "chunk_id"
        case title
        case url
        case relevance
    }
}
