//
//  APIResponses.swift
//  CropCopilot
//
//  Created by Claude Code on Phase 2
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

// MARK: - Recommendations List Response
struct RecommendationsListResponse: Decodable {
    let recommendations: [RecommendationSummary]
    let pagination: Pagination

    private enum CodingKeys: String, CodingKey {
        case recommendations
        case items
        case pagination
        case data
        case page
        case pageSize
        case total
        case totalPages
        case limit
        case offset
    }

    private struct DataEnvelope: Decodable {
        let recommendations: LossyDecodingArray<RecommendationSummary>?
        let items: LossyDecodingArray<RecommendationSummary>?
        let pagination: Pagination?
        let page: Int?
        let pageSize: Int?
        let total: Int?
        let totalPages: Int?
        let limit: Int?
        let offset: Int?
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)

        let dataEnvelope = try container.decodeIfPresent(DataEnvelope.self, forKey: .data)
        if let direct = try? container.decode(
            LossyDecodingArray<RecommendationSummary>.self,
            forKey: .recommendations
        ) {
            recommendations = direct.values
        } else if let items = try? container.decode(
            LossyDecodingArray<RecommendationSummary>.self,
            forKey: .items
        ) {
            recommendations = items.values
        } else if let nested = dataEnvelope?.recommendations?.values {
            recommendations = nested
        } else if let nestedItems = dataEnvelope?.items?.values {
            recommendations = nestedItems
        } else {
            recommendations = []
        }

        if let directPagination = try container.decodeIfPresent(Pagination.self, forKey: .pagination) {
            pagination = directPagination
            return
        }

        if let nestedPagination = dataEnvelope?.pagination {
            pagination = nestedPagination
            return
        }

        let page = try container.decodeIfPresent(Int.self, forKey: .page)
            ?? dataEnvelope?.page
            ?? 1
        let pageSize = try container.decodeIfPresent(Int.self, forKey: .pageSize)
            ?? dataEnvelope?.pageSize
            ?? dataEnvelope?.limit
            ?? recommendations.count
        let total = try container.decodeIfPresent(Int.self, forKey: .total)
            ?? dataEnvelope?.total
            ?? recommendations.count
        let totalPages = try container.decodeIfPresent(Int.self, forKey: .totalPages)
            ?? dataEnvelope?.totalPages
            ?? max(1, Int(ceil(Double(max(total, 1)) / Double(max(pageSize, 1)))))

        pagination = Pagination(
            page: max(1, page),
            pageSize: max(1, pageSize),
            total: max(0, total),
            totalPages: max(1, totalPages)
        )
    }
}

struct RecommendationSummary: Decodable, Identifiable {
    let id: String
    let createdAt: String
    let confidence: Double
    let condition: String
    let conditionType: String
    let firstAction: String?
    let input: RecommendationInputSummary

    private enum CodingKeys: String, CodingKey {
        case id
        case createdAt
        case createdAtSnake = "created_at"
        case confidence
        case condition
        case conditionType
        case conditionTypeSnake = "condition_type"
        case firstAction
        case firstActionSnake = "first_action"
        case input
        case inputId = "input_id"
        case inputType = "input_type"
        case inputCrop = "input_crop"
        case inputLocation = "input_location"
        case inputImageUrl = "input_image_url"
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decodeIfPresent(String.self, forKey: .id) ?? UUID().uuidString
        createdAt =
            try container.decodeIfPresent(String.self, forKey: .createdAt)
            ?? (try container.decodeIfPresent(String.self, forKey: .createdAtSnake))
            ?? ""
        confidence = try container.decodeIfPresent(Double.self, forKey: .confidence) ?? 0
        condition = try container.decodeIfPresent(String.self, forKey: .condition) ?? "Unknown"

        let rawConditionType =
            try container.decodeIfPresent(String.self, forKey: .conditionType)
            ?? (try container.decodeIfPresent(String.self, forKey: .conditionTypeSnake))
        conditionType = Self.inferConditionType(rawConditionType, condition: condition)
        firstAction =
            try container.decodeIfPresent(String.self, forKey: .firstAction)
            ?? (try container.decodeIfPresent(String.self, forKey: .firstActionSnake))

        if let nestedInput = try container.decodeIfPresent(RecommendationInputSummary.self, forKey: .input) {
            input = nestedInput
        } else {
            input = RecommendationInputSummary(
                id: try container.decodeIfPresent(String.self, forKey: .inputId) ?? id,
                type: try container.decodeIfPresent(String.self, forKey: .inputType) ?? "UNKNOWN",
                crop: try container.decodeIfPresent(String.self, forKey: .inputCrop),
                location: try container.decodeIfPresent(String.self, forKey: .inputLocation),
                imageUrl: try container.decodeIfPresent(String.self, forKey: .inputImageUrl)
            )
        }
    }

    private static func inferConditionType(_ rawType: String?, condition: String) -> String {
        let normalized = rawType?.lowercased()
        if ["deficiency", "disease", "pest", "environmental", "unknown"].contains(normalized) {
            return normalized ?? "unknown"
        }

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

struct RecommendationInputSummary: Decodable {
    let id: String
    let type: String
    let crop: String?
    let location: String?
    let imageUrl: String?

    private enum CodingKeys: String, CodingKey {
        case id
        case inputId
        case inputIdSnake = "input_id"
        case type
        case inputType
        case inputTypeSnake = "input_type"
        case crop
        case location
        case imageUrl
        case inputImageUrl
        case inputImageUrlSnake = "input_image_url"
    }

    init(id: String, type: String, crop: String?, location: String?, imageUrl: String?) {
        self.id = id
        self.type = type
        self.crop = crop
        self.location = location
        self.imageUrl = imageUrl
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id =
            try container.decodeIfPresent(String.self, forKey: .id)
            ?? (try container.decodeIfPresent(String.self, forKey: .inputId))
            ?? (try container.decodeIfPresent(String.self, forKey: .inputIdSnake))
            ?? UUID().uuidString
        type =
            try container.decodeIfPresent(String.self, forKey: .type)
            ?? (try container.decodeIfPresent(String.self, forKey: .inputType))
            ?? (try container.decodeIfPresent(String.self, forKey: .inputTypeSnake))
            ?? "UNKNOWN"
        crop = try container.decodeIfPresent(String.self, forKey: .crop)
        location = try container.decodeIfPresent(String.self, forKey: .location)
        imageUrl =
            try container.decodeIfPresent(String.self, forKey: .imageUrl)
            ?? (try container.decodeIfPresent(String.self, forKey: .inputImageUrl))
            ?? (try container.decodeIfPresent(String.self, forKey: .inputImageUrlSnake))
    }
}

struct Pagination: Codable {
    let page: Int
    let pageSize: Int
    let total: Int
    let totalPages: Int

    init(page: Int, pageSize: Int, total: Int, totalPages: Int) {
        self.page = page
        self.pageSize = pageSize
        self.total = total
        self.totalPages = totalPages
    }
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
    let recommendedProducts: [RecommendationProductSummary]

    enum CodingKeys: String, CodingKey {
        case id
        case createdAt
        case createdAtSnake = "created_at"
        case diagnosis
        case confidence
        case modelUsed
        case modelUsedSnake = "model_used"
        case input
        case sources
        case recommendedProducts
        case productRecommendations
        case products
        case recommendation
        case data
    }

    init(from decoder: Decoder) throws {
        let rootContainer = try decoder.container(keyedBy: CodingKeys.self)
        let container: KeyedDecodingContainer<CodingKeys>
        if rootContainer.contains(.id) {
            container = rootContainer
        } else if let nested = try? rootContainer.nestedContainer(
            keyedBy: CodingKeys.self,
            forKey: .recommendation
        ) {
            container = nested
        } else if let nested = try? rootContainer.nestedContainer(
            keyedBy: CodingKeys.self,
            forKey: .data
        ) {
            container = nested
        } else {
            container = rootContainer
        }

        id = try container.decodeIfPresent(String.self, forKey: .id) ?? UUID().uuidString
        createdAt =
            try container.decodeIfPresent(String.self, forKey: .createdAt)
            ?? (try container.decodeIfPresent(String.self, forKey: .createdAtSnake))
            ?? ""
        diagnosis = (try? container.decode(DiagnosisData.self, forKey: .diagnosis))
            ?? RecommendationDetailResponse.decodeStringifiedDiagnosis(from: container)
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
        confidence =
            (try? container.decode(Double.self, forKey: .confidence))
            ?? {
                if let raw = try? container.decode(String.self, forKey: .confidence) {
                    return Double(raw)
                }
                return nil
            }()
            ?? diagnosis.confidence
        modelUsed =
            try container.decodeIfPresent(String.self, forKey: .modelUsed)
            ?? (try container.decodeIfPresent(String.self, forKey: .modelUsedSnake))
            ?? "unknown"
        input =
            (try? container.decode(RecommendationInputDetail.self, forKey: .input))
            ?? RecommendationInputDetail.empty
        sources =
            (try? container.decode(LossyDecodingArray<RecommendationSourceDetail>.self, forKey: .sources).values)
            ?? []
        let directProducts =
            (try? container.decode(LossyDecodingArray<RecommendationProductSummary>.self, forKey: .recommendedProducts).values)
            ?? (try? container.decode(LossyDecodingArray<RecommendationProductSummary>.self, forKey: .productRecommendations).values)
            ?? (try? container.decode(LossyDecodingArray<RecommendationProductSummary>.self, forKey: .products).values)
            ?? []

        if !directProducts.isEmpty {
            recommendedProducts = directProducts
            return
        }

        recommendedProducts = diagnosis.products.map {
            RecommendationProductSummary(
                id: $0.productId ?? UUID().uuidString,
                catalogProductId: $0.productId,
                name: $0.productName,
                brand: nil,
                type: $0.productType,
                reason: $0.reasoning,
                applicationRate: $0.applicationRate
            )
        }
    }

    private static func decodeStringifiedDiagnosis(
        from container: KeyedDecodingContainer<CodingKeys>
    ) -> DiagnosisData? {
        guard let raw = try? container.decode(String.self, forKey: .diagnosis) else {
            return nil
        }

        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, let data = trimmed.data(using: .utf8) else {
            return nil
        }

        return try? JSONDecoder().decode(DiagnosisData.self, from: data)
    }
}

struct RecommendationProductSummary: Decodable, Identifiable {
    let id: String
    let catalogProductId: String?
    let name: String
    let brand: String?
    let type: String
    let reason: String?
    let applicationRate: String?

    private enum CodingKeys: String, CodingKey {
        case id
        case productId
        case productIdSnake = "product_id"
        case name
        case productName
        case productNameSnake = "product_name"
        case brand
        case type
        case productType
        case productTypeSnake = "product_type"
        case reason
        case reasoning
        case applicationRate
        case applicationRateSnake = "application_rate"
    }

    init(
        id: String,
        catalogProductId: String? = nil,
        name: String,
        brand: String?,
        type: String,
        reason: String?,
        applicationRate: String?
    ) {
        self.id = id
        self.catalogProductId = catalogProductId
        self.name = name
        self.brand = brand
        self.type = type
        self.reason = reason
        self.applicationRate = applicationRate
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let explicitProductId =
            RecommendationProductSummary.decodeString(
                from: container,
                primary: .productId,
                secondary: .productIdSnake
            )
        let decodedId = RecommendationProductSummary.decodeString(
            from: container,
            primary: .id
        )
        id =
            decodedId
            ?? explicitProductId
            ?? UUID().uuidString
        catalogProductId = explicitProductId ?? decodedId
        name =
            try container.decodeIfPresent(String.self, forKey: .name)
            ?? (try container.decodeIfPresent(String.self, forKey: .productName))
            ?? (try container.decodeIfPresent(String.self, forKey: .productNameSnake))
            ?? "Suggested product"
        brand = try container.decodeIfPresent(String.self, forKey: .brand)
        type =
            try container.decodeIfPresent(String.self, forKey: .type)
            ?? (try container.decodeIfPresent(String.self, forKey: .productType))
            ?? (try container.decodeIfPresent(String.self, forKey: .productTypeSnake))
            ?? "unknown"
        reason =
            try container.decodeIfPresent(String.self, forKey: .reason)
            ?? (try container.decodeIfPresent(String.self, forKey: .reasoning))
        applicationRate =
            try container.decodeIfPresent(String.self, forKey: .applicationRate)
            ?? (try container.decodeIfPresent(String.self, forKey: .applicationRateSnake))
    }

    private static func decodeString(
        from container: KeyedDecodingContainer<CodingKeys>,
        primary: CodingKeys,
        secondary: CodingKeys? = nil
    ) -> String? {
        if let value = try? container.decodeIfPresent(String.self, forKey: primary) {
            return value
        }
        if let secondary,
           secondary != primary,
           let value = try? container.decodeIfPresent(String.self, forKey: secondary) {
            return value
        }
        if let intValue = ((try? container.decodeIfPresent(Int.self, forKey: primary)) ?? nil) {
            return String(intValue)
        }
        if let secondary,
           secondary != primary,
           let intValue = ((try? container.decodeIfPresent(Int.self, forKey: secondary)) ?? nil) {
            return String(intValue)
        }
        return nil
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
        case inputId = "input_id"
        case type
        case inputType = "input_type"
        case description
        case notes
        case imageUrl
        case imageUrlSnake = "image_url"
        case labData
        case labDataSnake = "lab_data"
        case crop
        case location
        case season
        case createdAt
        case createdAtSnake = "created_at"
    }

    static let empty = RecommendationInputDetail(
        id: UUID().uuidString,
        type: "UNKNOWN",
        description: nil,
        imageUrl: nil,
        labData: nil,
        crop: nil,
        location: nil,
        season: nil,
        createdAt: ""
    )

    init(
        id: String,
        type: String,
        description: String?,
        imageUrl: String?,
        labData: [String: AnyCodable]?,
        crop: String?,
        location: String?,
        season: String?,
        createdAt: String
    ) {
        self.id = id
        self.type = type
        self.description = description
        self.imageUrl = imageUrl
        self.labData = labData
        self.crop = crop
        self.location = location
        self.season = season
        self.createdAt = createdAt
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id =
            try container.decodeIfPresent(String.self, forKey: .id)
            ?? (try container.decodeIfPresent(String.self, forKey: .inputId))
            ?? UUID().uuidString
        type =
            try container.decodeIfPresent(String.self, forKey: .type)
            ?? (try container.decodeIfPresent(String.self, forKey: .inputType))
            ?? "UNKNOWN"
        description =
            try container.decodeIfPresent(String.self, forKey: .description)
            ?? (try container.decodeIfPresent(String.self, forKey: .notes))
        imageUrl =
            try container.decodeIfPresent(String.self, forKey: .imageUrl)
            ?? (try container.decodeIfPresent(String.self, forKey: .imageUrlSnake))
        labData =
            (try? container.decodeIfPresent([String: AnyCodable].self, forKey: .labData))
            ?? (try? container.decodeIfPresent([String: AnyCodable].self, forKey: .labDataSnake))
        crop = try container.decodeIfPresent(String.self, forKey: .crop)
        location = try container.decodeIfPresent(String.self, forKey: .location)
        season = try container.decodeIfPresent(String.self, forKey: .season)
        createdAt =
            try container.decodeIfPresent(String.self, forKey: .createdAt)
            ?? (try container.decodeIfPresent(String.self, forKey: .createdAtSnake))
            ?? ""
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
        case chunkIdSnake = "chunk_id"
        case type
        case content
        case imageUrl
        case imageUrlSnake = "image_url"
        case relevanceScore
        case relevanceScoreSnake = "relevance_score"
        case source
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        chunkId =
            try container.decodeIfPresent(String.self, forKey: .chunkId)
            ?? (try container.decodeIfPresent(String.self, forKey: .chunkIdSnake))
        id = try container.decodeIfPresent(String.self, forKey: .id) ?? chunkId ?? UUID().uuidString
        type = try container.decodeIfPresent(String.self, forKey: .type) ?? "text"
        content = try container.decodeIfPresent(String.self, forKey: .content)
        imageUrl =
            try container.decodeIfPresent(String.self, forKey: .imageUrl)
            ?? (try container.decodeIfPresent(String.self, forKey: .imageUrlSnake))
        relevanceScore =
            try container.decodeIfPresent(Double.self, forKey: .relevanceScore)
            ?? (try container.decodeIfPresent(Double.self, forKey: .relevanceScoreSnake))
        source = try container.decodeIfPresent(SourceReference.self, forKey: .source)
    }
}

struct SourceReference: Decodable {
    let id: String
    let title: String
    let type: String
    let url: String?

    private enum CodingKeys: String, CodingKey {
        case id
        case title
        case type
        case sourceType = "source_type"
        case url
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decodeIfPresent(String.self, forKey: .id) ?? UUID().uuidString
        title = try container.decodeIfPresent(String.self, forKey: .title) ?? "Source"
        type =
            try container.decodeIfPresent(String.self, forKey: .type)
            ?? (try container.decodeIfPresent(String.self, forKey: .sourceType))
            ?? "UNKNOWN"
        url = try container.decodeIfPresent(String.self, forKey: .url)
    }
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

    enum CodingKeys: String, CodingKey {
        case inputId
        case inputIdSnake = "input_id"
        case jobId
        case jobIdSnake = "job_id"
        case status
        case updatedAt
        case updatedAtSnake = "updated_at"
        case failureReason
        case failureReasonSnake = "failure_reason"
        case result
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        inputId =
            try container.decodeIfPresent(String.self, forKey: .inputId)
            ?? (try container.decodeIfPresent(String.self, forKey: .inputIdSnake))
            ?? UUID().uuidString
        jobId =
            try container.decodeIfPresent(String.self, forKey: .jobId)
            ?? (try container.decodeIfPresent(String.self, forKey: .jobIdSnake))
            ?? UUID().uuidString
        status = try container.decodeIfPresent(String.self, forKey: .status) ?? "queued"
        updatedAt =
            try container.decodeIfPresent(String.self, forKey: .updatedAt)
            ?? (try container.decodeIfPresent(String.self, forKey: .updatedAtSnake))
            ?? ""
        failureReason =
            try container.decodeIfPresent(String.self, forKey: .failureReason)
            ?? (try container.decodeIfPresent(String.self, forKey: .failureReasonSnake))
        result = try container.decodeIfPresent(RecommendationJobResult.self, forKey: .result)
    }
}

struct RecommendationJobResult: Decodable {
    let recommendationId: String
    let confidence: Double
    let diagnosis: [String: AnyCodable]
    let sources: [RecommendationJobSource]
    let modelUsed: String

    enum CodingKeys: String, CodingKey {
        case recommendationId
        case recommendationIdSnake = "recommendation_id"
        case confidence
        case diagnosis
        case sources
        case modelUsed
        case modelUsedSnake = "model_used"
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        recommendationId =
            try container.decodeIfPresent(String.self, forKey: .recommendationId)
            ?? (try container.decodeIfPresent(String.self, forKey: .recommendationIdSnake))
            ?? UUID().uuidString
        confidence = try container.decodeIfPresent(Double.self, forKey: .confidence) ?? 0
        diagnosis = (try? container.decodeIfPresent([String: AnyCodable].self, forKey: .diagnosis)) ?? [:]
        sources =
            (try? container.decode(LossyDecodingArray<RecommendationJobSource>.self, forKey: .sources).values)
            ?? []
        modelUsed =
            try container.decodeIfPresent(String.self, forKey: .modelUsed)
            ?? (try container.decodeIfPresent(String.self, forKey: .modelUsedSnake))
            ?? "unknown"
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

    private enum CodingKeys: String, CodingKey {
        case products
        case total
        case limit
        case offset
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        products =
            (try? container.decode(LossyDecodingArray<ProductListItem>.self, forKey: .products).values)
            ?? []
        total = (try? container.decode(Int.self, forKey: .total)) ?? products.count
        limit = (try? container.decode(Int.self, forKey: .limit)) ?? products.count
        offset = (try? container.decode(Int.self, forKey: .offset)) ?? 0
    }
}

struct ProductListItem: Decodable, Identifiable {
    let id: String
    let name: String
    let brand: String?
    let type: String
    let description: String?
    let applicationRate: String?
    let crops: [String]?

    private enum CodingKeys: String, CodingKey {
        case id
        case name
        case brand
        case type
        case description
        case applicationRate
        case applicationRateSnake = "application_rate"
        case crops
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = (try? container.decode(String.self, forKey: .id)) ?? UUID().uuidString
        name = (try? container.decode(String.self, forKey: .name)) ?? "Product"
        brand = try? container.decode(String.self, forKey: .brand)
        type = (try? container.decode(String.self, forKey: .type)) ?? "UNKNOWN"
        description = try? container.decode(String.self, forKey: .description)
        applicationRate =
            (try? container.decode(String.self, forKey: .applicationRate))
            ?? (try? container.decode(String.self, forKey: .applicationRateSnake))
        crops = try? container.decode([String].self, forKey: .crops)
    }
}

struct ProductDetailResponse: Decodable, Identifiable {
    let id: String
    let name: String
    let brand: String?
    let type: String
    let description: String?
    let applicationRate: String?
    let crops: [String]
    let usedInRecommendations: Int
    let relatedProducts: [RelatedProductSummary]
    let recommendations: [ProductRecommendationReference]

    enum CodingKeys: String, CodingKey {
        case id
        case name
        case brand
        case type
        case description
        case applicationRate
        case crops
        case usedInRecommendations
        case relatedProducts
        case recommendations
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        name = try container.decode(String.self, forKey: .name)
        brand = try container.decodeIfPresent(String.self, forKey: .brand)
        type = try container.decodeIfPresent(String.self, forKey: .type) ?? "unknown"
        description = try container.decodeIfPresent(String.self, forKey: .description)
        applicationRate = try container.decodeIfPresent(String.self, forKey: .applicationRate)
        crops = try container.decodeIfPresent([String].self, forKey: .crops) ?? []
        usedInRecommendations = try container.decodeIfPresent(Int.self, forKey: .usedInRecommendations) ?? 0
        relatedProducts =
            try container.decodeIfPresent([RelatedProductSummary].self, forKey: .relatedProducts) ?? []
        recommendations =
            try container.decodeIfPresent([ProductRecommendationReference].self, forKey: .recommendations) ?? []
    }
}

struct RelatedProductSummary: Decodable, Identifiable {
    let id: String
    let name: String
    let brand: String?
    let type: String
}

struct ProductRecommendationReference: Decodable, Identifiable {
    var id: String { recommendationId }
    let recommendationId: String
    let condition: String
    let crop: String?
    let createdAt: String
}

struct BatchPricingResponse: Decodable {
    let pricing: [ProductPricingEntry]
}

struct ProductPricingEntry: Decodable, Identifiable {
    var id: String { productId }
    let productId: String
    let productName: String
    let brand: String?
    let pricing: ProductPricingSnapshot
}

struct ProductPricingSnapshot: Decodable {
    let currency: String
    let retailPrice: Double?
    let wholesalePrice: Double?
    let unit: String?
    let availability: String?
    let lastUpdated: String?
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

struct FeedbackRecord: Decodable {
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

    private enum CodingKeys: String, CodingKey {
        case id
        case recommendationId
        case recommendationIdSnake = "recommendation_id"
        case userId
        case userIdSnake = "user_id"
        case helpful
        case rating
        case accuracy
        case comments
        case issues
        case detailedCompletedAt
        case detailedCompletedAtSnake = "detailed_completed_at"
        case outcomeApplied
        case outcomeAppliedSnake = "outcome_applied"
        case outcomeSuccess
        case outcomeSuccessSnake = "outcome_success"
        case outcomeNotes
        case outcomeNotesSnake = "outcome_notes"
        case outcomeReported
        case outcomeReportedSnake = "outcome_reported"
        case createdAt
        case createdAtSnake = "created_at"
        case updatedAt
        case updatedAtSnake = "updated_at"
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decodeIfPresent(String.self, forKey: .id) ?? UUID().uuidString
        recommendationId =
            try container.decodeIfPresent(String.self, forKey: .recommendationId)
            ?? (try container.decodeIfPresent(String.self, forKey: .recommendationIdSnake))
            ?? ""
        userId =
            try container.decodeIfPresent(String.self, forKey: .userId)
            ?? (try container.decodeIfPresent(String.self, forKey: .userIdSnake))
            ?? ""
        helpful = try container.decodeIfPresent(Bool.self, forKey: .helpful)
        rating = try container.decodeIfPresent(Int.self, forKey: .rating)
        accuracy = try container.decodeIfPresent(Int.self, forKey: .accuracy)
        comments = try container.decodeIfPresent(String.self, forKey: .comments)
        issues = try container.decodeIfPresent([String].self, forKey: .issues) ?? []
        detailedCompletedAt =
            try container.decodeIfPresent(String.self, forKey: .detailedCompletedAt)
            ?? (try container.decodeIfPresent(String.self, forKey: .detailedCompletedAtSnake))
        outcomeApplied =
            try container.decodeIfPresent(Bool.self, forKey: .outcomeApplied)
            ?? (try container.decodeIfPresent(Bool.self, forKey: .outcomeAppliedSnake))
        outcomeSuccess =
            try container.decodeIfPresent(Bool.self, forKey: .outcomeSuccess)
            ?? (try container.decodeIfPresent(Bool.self, forKey: .outcomeSuccessSnake))
        outcomeNotes =
            try container.decodeIfPresent(String.self, forKey: .outcomeNotes)
            ?? (try container.decodeIfPresent(String.self, forKey: .outcomeNotesSnake))
        outcomeReported =
            try container.decodeIfPresent(Bool.self, forKey: .outcomeReported)
            ?? (try container.decodeIfPresent(Bool.self, forKey: .outcomeReportedSnake))
            ?? (outcomeSuccess != nil)
        createdAt =
            try container.decodeIfPresent(String.self, forKey: .createdAt)
            ?? (try container.decodeIfPresent(String.self, forKey: .createdAtSnake))
            ?? ""
        updatedAt =
            try container.decodeIfPresent(String.self, forKey: .updatedAt)
            ?? (try container.decodeIfPresent(String.self, forKey: .updatedAtSnake))
            ?? ""
    }
}

struct FeedbackGetResponse: Decodable {
    let feedback: FeedbackRecord?

    private enum CodingKeys: String, CodingKey {
        case feedback
        case data
    }

    private struct DataEnvelope: Decodable {
        let feedback: FeedbackRecord?
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        if let direct = try container.decodeIfPresent(FeedbackRecord.self, forKey: .feedback) {
            feedback = direct
            return
        }

        let envelope = try container.decodeIfPresent(DataEnvelope.self, forKey: .data)
        feedback = envelope?.feedback
    }
}

struct FeedbackSubmitResponse: Decodable {
    let success: Bool
    let feedback: FeedbackRecord

    private enum CodingKeys: String, CodingKey {
        case success
        case feedback
        case data
    }

    private struct DataEnvelope: Decodable {
        let success: Bool?
        let feedback: FeedbackRecord
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        if let direct = try container.decodeIfPresent(FeedbackRecord.self, forKey: .feedback) {
            feedback = direct
            success = try container.decodeIfPresent(Bool.self, forKey: .success) ?? true
            return
        }

        let envelope = try container.decode(DataEnvelope.self, forKey: .data)
        feedback = envelope.feedback
        success = envelope.success ?? true
    }
}

// MARK: - Error Response
struct APIErrorResponse: Codable {
    let error: String
    let details: String?
}
