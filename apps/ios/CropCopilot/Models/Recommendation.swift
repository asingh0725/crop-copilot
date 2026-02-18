//
//  Recommendation.swift
//  CropCopilot
//
//  Created by Claude Code on Phase 1
//

import Foundation

struct Recommendation: Decodable, Identifiable {
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
struct DiagnosisData: Decodable {
    let diagnosis: DiagnosisDetails
    let recommendations: [RecommendationAction]
    let products: [RecommendedProduct]
    let sources: [Source]
    let confidence: Double

    enum CodingKeys: String, CodingKey {
        case diagnosis
        case recommendations
        case products
        case sources
        case confidence
        case condition
        case conditionType
        case conditionTypeSnake = "condition_type"
        case severity
        case reasoning
        case differentialDiagnosis
        case differentialDiagnosisSnake = "differential_diagnosis"
        case primaryCondition
    }

    init(
        diagnosis: DiagnosisDetails,
        recommendations: [RecommendationAction] = [],
        products: [RecommendedProduct] = [],
        sources: [Source] = [],
        confidence: Double
    ) {
        self.diagnosis = diagnosis
        self.recommendations = recommendations
        self.products = products
        self.sources = sources
        self.confidence = confidence
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)

        recommendations = try container.decodeIfPresent([RecommendationAction].self, forKey: .recommendations) ?? []
        products = try container.decodeIfPresent([RecommendedProduct].self, forKey: .products) ?? []
        sources = try container.decodeIfPresent([Source].self, forKey: .sources) ?? []

        if let nestedDiagnosis = try container.decodeIfPresent(DiagnosisDetails.self, forKey: .diagnosis) {
            diagnosis = nestedDiagnosis
        } else if let primaryCondition = try container.decodeIfPresent(DiagnosisDetails.self, forKey: .primaryCondition) {
            diagnosis = primaryCondition
        } else {
            diagnosis = DiagnosisDetails(
                condition: try container.decodeIfPresent(String.self, forKey: .condition) ?? "Unknown condition",
                conditionType:
                    try container.decodeIfPresent(String.self, forKey: .conditionType)
                    ?? (try container.decodeIfPresent(String.self, forKey: .conditionTypeSnake))
                    ?? "unknown",
                severity: try container.decodeIfPresent(String.self, forKey: .severity),
                confidence: try container.decodeIfPresent(Double.self, forKey: .confidence) ?? 0,
                reasoning: try container.decodeIfPresent(String.self, forKey: .reasoning) ?? "No diagnostic reasoning was provided.",
                differentialDiagnosis:
                    try container.decodeIfPresent([String].self, forKey: .differentialDiagnosis)
                    ?? (try container.decodeIfPresent([String].self, forKey: .differentialDiagnosisSnake))
            )
        }

        confidence = try container.decodeIfPresent(Double.self, forKey: .confidence) ?? diagnosis.confidence
    }
}

struct DiagnosisDetails: Decodable {
    let condition: String
    let conditionType: String
    let severity: String?
    let confidence: Double
    let reasoning: String
    let differentialDiagnosis: [String]?

    enum CodingKeys: String, CodingKey {
        case condition
        case conditionType = "condition_type"
        case conditionTypeCamel = "conditionType"
        case severity
        case confidence
        case reasoning
        case differentialDiagnosis = "differential_diagnosis"
        case differentialDiagnosisCamel = "differentialDiagnosis"
    }

    init(
        condition: String,
        conditionType: String,
        severity: String?,
        confidence: Double,
        reasoning: String,
        differentialDiagnosis: [String]?
    ) {
        self.condition = condition
        self.conditionType = conditionType
        self.severity = severity
        self.confidence = confidence
        self.reasoning = reasoning
        self.differentialDiagnosis = differentialDiagnosis
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        condition =
            try container.decodeIfPresent(String.self, forKey: .condition)
            ?? "Unknown condition"
        conditionType =
            try container.decodeIfPresent(String.self, forKey: .conditionType)
            ?? (try container.decodeIfPresent(String.self, forKey: .conditionTypeCamel))
            ?? "unknown"
        severity = try container.decodeIfPresent(String.self, forKey: .severity)
        confidence = try container.decodeIfPresent(Double.self, forKey: .confidence) ?? 0
        reasoning = try container.decodeIfPresent(String.self, forKey: .reasoning) ?? "No diagnostic reasoning was provided."
        differentialDiagnosis =
            try container.decodeIfPresent([String].self, forKey: .differentialDiagnosis)
            ?? (try container.decodeIfPresent([String].self, forKey: .differentialDiagnosisCamel))
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
