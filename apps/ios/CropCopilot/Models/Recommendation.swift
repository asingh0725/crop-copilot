//
//  Recommendation.swift
//  CropCopilot
//
//  Created by Claude Code on Phase 1
//

import Foundation

private struct LossyDecodingArray<Element: Decodable>: Decodable {
    let values: [Element]

    private struct Ignored: Decodable {}

    init(from decoder: Decoder) throws {
        var container = try decoder.unkeyedContainer()
        var decoded: [Element] = []
        decoded.reserveCapacity(container.count ?? 0)

        while !container.isAtEnd {
            if let element = try? container.decode(Element.self) {
                decoded.append(element)
            } else {
                _ = try? container.decode(Ignored.self)
            }
        }

        values = decoded
    }
}

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
        case recommendedProducts
        case productRecommendations
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

        let parsedRecommendations =
            (try? container.decode(LossyDecodingArray<RecommendationAction>.self, forKey: .recommendations).values)
            ?? []
        let parsedProducts =
            (try? container.decode(LossyDecodingArray<RecommendedProduct>.self, forKey: .products).values)
            ?? []
        let aliasProducts =
            (try? container.decode(LossyDecodingArray<RecommendedProduct>.self, forKey: .recommendedProducts).values)
            ?? (try? container.decode(LossyDecodingArray<RecommendedProduct>.self, forKey: .productRecommendations).values)
            ?? []
        let parsedSources =
            (try? container.decode(LossyDecodingArray<Source>.self, forKey: .sources).values)
            ?? []

        recommendations = parsedRecommendations
        products = parsedProducts.isEmpty ? aliasProducts : parsedProducts
        sources = parsedSources

        if let nestedDiagnosis = try? container.decode(DiagnosisDetails.self, forKey: .diagnosis) {
            diagnosis = nestedDiagnosis
        } else if let primaryCondition = try? container.decode(DiagnosisDetails.self, forKey: .primaryCondition) {
            diagnosis = primaryCondition
        } else {
            let fallbackCondition =
                (try? container.decode(String.self, forKey: .condition))
                ?? "Unknown condition"
            let fallbackReasoning =
                (try? container.decode(String.self, forKey: .reasoning))
                ?? "No diagnostic reasoning was provided."
            let rawConditionType =
                (try? container.decode(String.self, forKey: .conditionType))
                ?? (try? container.decode(String.self, forKey: .conditionTypeSnake))
            diagnosis = DiagnosisDetails(
                condition: fallbackCondition,
                conditionType: Self.inferConditionType(rawConditionType, condition: fallbackCondition),
                severity: try? container.decode(String.self, forKey: .severity),
                confidence: DiagnosisData.parseDouble(
                    from: container,
                    key: .confidence
                ) ?? 0,
                reasoning: fallbackReasoning,
                differentialDiagnosis:
                    (try? container.decode([String].self, forKey: .differentialDiagnosis))
                    ?? (try? container.decode([String].self, forKey: .differentialDiagnosisSnake))
            )
        }

        confidence = DiagnosisData.parseDouble(from: container, key: .confidence) ?? diagnosis.confidence
    }

    private static func parseDouble(
        from container: KeyedDecodingContainer<CodingKeys>,
        key: CodingKeys
    ) -> Double? {
        if let value = try? container.decode(Double.self, forKey: key) {
            return value
        }
        if let raw = try? container.decode(String.self, forKey: key) {
            return Double(raw.trimmingCharacters(in: .whitespacesAndNewlines))
        }
        return nil
    }

    private static func inferConditionType(_ raw: String?, condition: String) -> String {
        guard let raw else {
            return fallbackConditionType(from: condition)
        }
        let normalized = raw.lowercased()
        if ["deficiency", "disease", "pest", "environmental", "unknown"].contains(normalized) {
            return normalized
        }
        return fallbackConditionType(from: condition)
    }

    private static func fallbackConditionType(from condition: String) -> String {
        let lowered = condition.lowercased()
        if lowered.contains("deficien") || lowered.contains("chlorosis") || lowered.contains("nutrient") {
            return "deficiency"
        }
        if lowered.contains("pest") || lowered.contains("insect") || lowered.contains("mite") {
            return "pest"
        }
        if lowered.contains("disease") || lowered.contains("rust") || lowered.contains("blight") || lowered.contains("fung") {
            return "disease"
        }
        if lowered.contains("drought") || lowered.contains("heat") || lowered.contains("cold") || lowered.contains("water") {
            return "environmental"
        }
        return "unknown"
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

struct RecommendationAction: Decodable, Identifiable {
    var id: String { action + timing + priority }
    let action: String
    let timing: String
    let priority: String
    let details: String

    enum CodingKeys: String, CodingKey {
        case action
        case title
        case recommendation
        case timing
        case when
        case priority
        case details
        case rationale
        case description
    }

    init(action: String, timing: String, priority: String, details: String) {
        self.action = action
        self.timing = timing
        self.priority = priority
        self.details = details
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        action =
            try container.decodeIfPresent(String.self, forKey: .action)
            ?? (try container.decodeIfPresent(String.self, forKey: .title))
            ?? (try container.decodeIfPresent(String.self, forKey: .recommendation))
            ?? "Recommended action"
        timing =
            try container.decodeIfPresent(String.self, forKey: .timing)
            ?? (try container.decodeIfPresent(String.self, forKey: .when))
            ?? "As soon as practical"
        priority =
            try container.decodeIfPresent(String.self, forKey: .priority)
            ?? "medium"
        details =
            try container.decodeIfPresent(String.self, forKey: .details)
            ?? (try container.decodeIfPresent(String.self, forKey: .rationale))
            ?? (try container.decodeIfPresent(String.self, forKey: .description))
            ?? "No additional details were provided."
    }
}

struct RecommendedProduct: Decodable, Identifiable {
    var id: String { productId ?? productName }
    let productId: String?
    let productName: String
    let productType: String
    let applicationRate: String?
    let reasoning: String

    enum CodingKeys: String, CodingKey {
        case productId = "product_id"
        case productIdCamel = "productId"
        case id
        case productName = "product_name"
        case productNameCamel = "productName"
        case name
        case productType = "product_type"
        case productTypeCamel = "productType"
        case type
        case applicationRate = "application_rate"
        case applicationRateCamel = "applicationRate"
        case reasoning
        case reason
    }

    init(
        productId: String?,
        productName: String,
        productType: String,
        applicationRate: String?,
        reasoning: String
    ) {
        self.productId = productId
        self.productName = productName
        self.productType = productType
        self.applicationRate = applicationRate
        self.reasoning = reasoning
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        productId =
            try container.decodeIfPresent(String.self, forKey: .productId)
            ?? (try container.decodeIfPresent(String.self, forKey: .productIdCamel))
            ?? (try container.decodeIfPresent(String.self, forKey: .id))
        productName =
            try container.decodeIfPresent(String.self, forKey: .productName)
            ?? (try container.decodeIfPresent(String.self, forKey: .productNameCamel))
            ?? (try container.decodeIfPresent(String.self, forKey: .name))
            ?? "Suggested product"
        productType =
            try container.decodeIfPresent(String.self, forKey: .productType)
            ?? (try container.decodeIfPresent(String.self, forKey: .productTypeCamel))
            ?? (try container.decodeIfPresent(String.self, forKey: .type))
            ?? "unspecified"
        applicationRate =
            try container.decodeIfPresent(String.self, forKey: .applicationRate)
            ?? (try container.decodeIfPresent(String.self, forKey: .applicationRateCamel))
        reasoning =
            try container.decodeIfPresent(String.self, forKey: .reasoning)
            ?? (try container.decodeIfPresent(String.self, forKey: .reason))
            ?? "No product rationale provided."
    }
}

struct Source: Decodable, Identifiable {
    var id: String { chunkId }
    let chunkId: String
    let title: String
    let url: String?
    let relevance: Double

    enum CodingKeys: String, CodingKey {
        case chunkId = "chunk_id"
        case chunkIdCamel = "chunkId"
        case id
        case title
        case url
        case relevance
        case relevanceScore = "relevance_score"
        case relevanceScoreCamel = "relevanceScore"
        case score
    }

    init(chunkId: String, title: String, url: String?, relevance: Double) {
        self.chunkId = chunkId
        self.title = title
        self.url = url
        self.relevance = relevance
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        chunkId =
            (try? container.decode(String.self, forKey: .chunkId))
            ?? (try? container.decode(String.self, forKey: .chunkIdCamel))
            ?? (try? container.decode(String.self, forKey: .id))
            ?? UUID().uuidString
        title = (try? container.decode(String.self, forKey: .title)) ?? "Source excerpt"
        url = try? container.decode(String.self, forKey: .url)
        let numericRelevance =
            (try? container.decode(Double.self, forKey: .relevance))
            ?? (try? container.decode(Double.self, forKey: .relevanceScore))
            ?? (try? container.decode(Double.self, forKey: .relevanceScoreCamel))
            ?? (try? container.decode(Double.self, forKey: .score))

        if let numericRelevance {
            relevance = numericRelevance
            return
        }

        let relevanceKeys: [CodingKeys] = [.relevance, .relevanceScore, .relevanceScoreCamel, .score]
        var parsedRelevance: Double? = nil

        for key in relevanceKeys {
            if let raw = try? container.decode(String.self, forKey: key),
               let parsed = Double(raw) {
                parsedRelevance = parsed
                break
            }
        }

        relevance = parsedRelevance ?? 0
    }
}
