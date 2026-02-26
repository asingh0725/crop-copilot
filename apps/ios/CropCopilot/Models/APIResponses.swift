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
    let premium: PremiumRecommendationDetail

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
        case premium
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
        premium =
            (try? container.decode(PremiumRecommendationDetail.self, forKey: .premium))
            ?? PremiumRecommendationDetail.defaultValue
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

struct PremiumRecommendationCheck: Decodable, Identifiable {
    let id: String
    let title: String
    let result: String
    let message: String
}

struct PremiumCostSummary: Decodable {
    let perAcreTotalUsd: Double?
    let wholeFieldTotalUsd: Double?
}

struct PremiumSprayWindow: Decodable, Identifiable {
    var id: String { startsAt + endsAt }
    let startsAt: String
    let endsAt: String
    let score: Int
    let summary: String
    let source: String
}

struct PremiumReport: Decodable {
    let html: String?
    let htmlUrl: String?
    let pdfUrl: String?
    let generatedAt: String?
}

struct PremiumRecommendationDetail: Decodable {
    let status: String
    let riskReview: String?
    let checks: [PremiumRecommendationCheck]
    let costAnalysis: PremiumCostSummary?
    let sprayWindows: [PremiumSprayWindow]
    let report: PremiumReport?
    let advisoryNotice: String?
    let failureReason: String?

    var complianceDecision: String? { riskReview }

    private enum CodingKeys: String, CodingKey {
        case status
        case riskReview
        case complianceDecision
        case checks
        case costAnalysis
        case sprayWindows
        case report
        case advisoryNotice
        case failureReason
    }

    init(
        status: String,
        riskReview: String?,
        checks: [PremiumRecommendationCheck],
        costAnalysis: PremiumCostSummary?,
        sprayWindows: [PremiumSprayWindow],
        report: PremiumReport?,
        advisoryNotice: String?,
        failureReason: String?
    ) {
        self.status = status
        self.riskReview = riskReview
        self.checks = checks
        self.costAnalysis = costAnalysis
        self.sprayWindows = sprayWindows
        self.report = report
        self.advisoryNotice = advisoryNotice
        self.failureReason = failureReason
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        status = try container.decodeIfPresent(String.self, forKey: .status) ?? "not_available"
        riskReview =
            try container.decodeIfPresent(String.self, forKey: .riskReview)
            ?? container.decodeIfPresent(String.self, forKey: .complianceDecision)
        checks = try container.decodeIfPresent([PremiumRecommendationCheck].self, forKey: .checks) ?? []
        costAnalysis = try container.decodeIfPresent(PremiumCostSummary.self, forKey: .costAnalysis)
        sprayWindows = try container.decodeIfPresent([PremiumSprayWindow].self, forKey: .sprayWindows) ?? []
        report = try container.decodeIfPresent(PremiumReport.self, forKey: .report)
        advisoryNotice = try container.decodeIfPresent(String.self, forKey: .advisoryNotice)
        failureReason = try container.decodeIfPresent(String.self, forKey: .failureReason)
    }

    static let defaultValue = PremiumRecommendationDetail(
        status: "not_available",
        riskReview: nil,
        checks: [],
        costAnalysis: nil,
        sprayWindows: [],
        report: nil,
        advisoryNotice: nil,
        failureReason: nil
    )
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
        case catalogProductId
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
        case product
    }

    private struct NestedProduct: Decodable {
        let id: String?
        let name: String?
        let brand: String?
        let type: String?
        let applicationRate: String?
        let applicationRateSnake: String?

        private enum CodingKeys: String, CodingKey {
            case id
            case name
            case brand
            case type
            case applicationRate
            case applicationRateSnake = "application_rate"
        }
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
        let nestedProduct = try? container.decodeIfPresent(NestedProduct.self, forKey: .product)
        let nestedProductName = try? container.decodeIfPresent(String.self, forKey: .product)
        let explicitCatalogId =
            RecommendationProductSummary.decodeString(
                from: container,
                primary: .catalogProductId,
                secondary: .productId
            )
            ?? RecommendationProductSummary.decodeString(
                from: container,
                primary: .productIdSnake
            )
            ?? nestedProduct?.id
        let explicitProductId =
            RecommendationProductSummary.decodeString(
                from: container,
                primary: .productId,
                secondary: .productIdSnake
            ) ?? nestedProduct?.id
        let decodedId = RecommendationProductSummary.decodeString(
            from: container,
            primary: .id
        ) ?? nestedProduct?.id
        id =
            decodedId
            ?? explicitProductId
            ?? UUID().uuidString
        let resolvedCatalogId = explicitCatalogId ?? explicitProductId ?? decodedId
        catalogProductId = RecommendationProductSummary.normalizeCatalogProductId(resolvedCatalogId)
        let decodedReason =
            try container.decodeIfPresent(String.self, forKey: .reason)
            ?? (try container.decodeIfPresent(String.self, forKey: .reasoning))
        let decodedApplicationRate =
            try container.decodeIfPresent(String.self, forKey: .applicationRate)
            ?? (try container.decodeIfPresent(String.self, forKey: .applicationRateSnake))
            ?? nestedProduct?.applicationRate
            ?? nestedProduct?.applicationRateSnake
        let decodedName =
            try container.decodeIfPresent(String.self, forKey: .name)
            ?? (try container.decodeIfPresent(String.self, forKey: .productName))
            ?? (try container.decodeIfPresent(String.self, forKey: .productNameSnake))
            ?? nestedProductName
            ?? nestedProduct?.name
        let inferredName = RecommendationProductSummary.inferNameFromContext(
            applicationRate: decodedApplicationRate,
            reason: decodedReason
        )
        name =
            RecommendationProductSummary.isGenericName(decodedName)
            ? (inferredName ?? "Suggested product")
            : (decodedName?.trimmingCharacters(in: .whitespacesAndNewlines) ?? "Suggested product")
        brand =
            try container.decodeIfPresent(String.self, forKey: .brand)
            ?? nestedProduct?.brand
        type =
            try container.decodeIfPresent(String.self, forKey: .type)
            ?? (try container.decodeIfPresent(String.self, forKey: .productType))
            ?? (try container.decodeIfPresent(String.self, forKey: .productTypeSnake))
            ?? nestedProduct?.type
            ?? "unknown"
        reason = decodedReason
        applicationRate = decodedApplicationRate
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

    private static func normalizeCatalogProductId(_ value: String?) -> String? {
        guard let value else {
            return nil
        }
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            return nil
        }
        if trimmed.lowercased() == "null" || trimmed.lowercased() == "undefined" {
            return nil
        }
        return trimmed
    }

    private static func isGenericName(_ value: String?) -> Bool {
        guard let value else {
            return true
        }
        let normalized = value
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
            .replacingOccurrences(of: "_", with: " ")
            .replacingOccurrences(of: "-", with: " ")
        return normalized.isEmpty || normalized == "suggested product" || normalized == "unspecified" || normalized == "product"
    }

    private static func inferNameFromContext(
        applicationRate: String?,
        reason: String?
    ) -> String? {
        let candidates = [applicationRate, reason]
            .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }

        func normalizeCandidate(_ raw: String) -> String? {
            let cleaned = raw
                .trimmingCharacters(in: CharacterSet(charactersIn: " ,;:.!?-"))
                .replacingOccurrences(of: "_", with: " ")
                .replacingOccurrences(of: "-", with: " ")
                .split(separator: " ")
                .map(String.init)
                .joined(separator: " ")
                .trimmingCharacters(in: .whitespacesAndNewlines)
            guard !cleaned.isEmpty else {
                return nil
            }
            if isGenericName(cleaned) {
                return nil
            }
            if cleaned.split(separator: " ").count > 8 {
                return nil
            }
            return cleaned
                .split(separator: " ")
                .map { $0.capitalized }
                .joined(separator: " ")
        }

        let quantityPattern =
            #"(?:\d+(?:\.\d+)?(?:\s*[-–]\s*\d+(?:\.\d+)?)?\s*(?:lbs?|lb|kg|g|oz|ml|l)\s+)([A-Za-z][A-Za-z0-9\s\/-]{2,70}?)(?:\s+per\b|\s+in\b|,|;|\.|$)"#
        let actionPattern =
            #"(?:apply|use|consider|recommend|suggest)\s+(?:a|an|the)?\s*([A-Za-z][A-Za-z0-9\s\/-]{2,70}?)(?:\s+(?:for|to|at|on|in)\b|,|;|\.|$)"#

        for text in candidates {
            if let range = text.range(of: quantityPattern, options: [.regularExpression, .caseInsensitive]) {
                let matched = String(text[range])
                let reduced = matched.replacingOccurrences(
                    of: #"^\d+(?:\.\d+)?(?:\s*[-–]\s*\d+(?:\.\d+)?)?\s*(?:lbs?|lb|kg|g|oz|ml|l)\s+"#,
                    with: "",
                    options: .regularExpression
                )
                let namePart = reduced.replacingOccurrences(
                    of: #"\s+per\b.*$|\s+in\b.*$"#,
                    with: "",
                    options: .regularExpression
                )
                if let normalized = normalizeCandidate(namePart) {
                    return normalized
                }
            }

            if let range = text.range(of: actionPattern, options: [.regularExpression, .caseInsensitive]) {
                let matched = String(text[range])
                let reduced = matched.replacingOccurrences(
                    of: #"^(?:apply|use|consider|recommend|suggest)\s+(?:a|an|the)?\s*"#,
                    with: "",
                    options: .regularExpression
                )
                let namePart = reduced.replacingOccurrences(
                    of: #"\s+(?:for|to|at|on|in)\b.*$"#,
                    with: "",
                    options: .regularExpression
                )
                if let normalized = normalizeCandidate(namePart) {
                    return normalized
                }
            }
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
    let fieldAcreage: Double?
    let plannedApplicationDate: String?
    let fieldLatitude: Double?
    let fieldLongitude: Double?
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
        case fieldAcreage
        case plannedApplicationDate
        case fieldLatitude
        case fieldLongitude
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
        fieldAcreage: nil,
        plannedApplicationDate: nil,
        fieldLatitude: nil,
        fieldLongitude: nil,
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
        fieldAcreage: Double?,
        plannedApplicationDate: String?,
        fieldLatitude: Double?,
        fieldLongitude: Double?,
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
        self.fieldAcreage = fieldAcreage
        self.plannedApplicationDate = plannedApplicationDate
        self.fieldLatitude = fieldLatitude
        self.fieldLongitude = fieldLongitude
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
        fieldAcreage = try container.decodeIfPresent(Double.self, forKey: .fieldAcreage)
        plannedApplicationDate = try container.decodeIfPresent(String.self, forKey: .plannedApplicationDate)
        fieldLatitude = try container.decodeIfPresent(Double.self, forKey: .fieldLatitude)
        fieldLongitude = try container.decodeIfPresent(Double.self, forKey: .fieldLongitude)
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
        case items
        case total
        case limit
        case offset
        case data
    }

    private struct DataEnvelope: Decodable {
        let products: LossyDecodingArray<ProductListItem>?
        let items: LossyDecodingArray<ProductListItem>?
        let total: Int?
        let limit: Int?
        let offset: Int?
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let dataEnvelope = try container.decodeIfPresent(DataEnvelope.self, forKey: .data)
        products =
            (try? container.decode(LossyDecodingArray<ProductListItem>.self, forKey: .products).values)
            ?? (try? container.decode(LossyDecodingArray<ProductListItem>.self, forKey: .items).values)
            ?? dataEnvelope?.products?.values
            ?? dataEnvelope?.items?.values
            ?? []
        total =
            (try? container.decode(Int.self, forKey: .total))
            ?? dataEnvelope?.total
            ?? products.count
        limit =
            (try? container.decode(Int.self, forKey: .limit))
            ?? dataEnvelope?.limit
            ?? products.count
        offset =
            (try? container.decode(Int.self, forKey: .offset))
            ?? dataEnvelope?.offset
            ?? 0
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
        if let stringId = try? container.decode(String.self, forKey: .id) {
            id = stringId
        } else if let intId = try? container.decode(Int.self, forKey: .id) {
            id = String(intId)
        } else {
            id = UUID().uuidString
        }
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
        case applicationRateSnake = "application_rate"
        case crops
        case usedInRecommendations
        case usedInRecommendationsSnake = "used_in_recommendations"
        case relatedProducts
        case relatedProductsSnake = "related_products"
        case recommendations
        case data
        case product
    }

    private struct DataEnvelope: Decodable {
        let id: String?
        let name: String?
        let brand: String?
        let type: String?
        let description: String?
        let applicationRate: String?
        let applicationRateSnake: String?
        let crops: [String]?
        let usedInRecommendations: Int?
        let usedInRecommendationsSnake: Int?
        let relatedProducts: [RelatedProductSummary]?
        let relatedProductsSnake: [RelatedProductSummary]?
        let recommendations: [ProductRecommendationReference]?

        private enum CodingKeys: String, CodingKey {
            case id
            case name
            case brand
            case type
            case description
            case applicationRate
            case applicationRateSnake = "application_rate"
            case crops
            case usedInRecommendations
            case usedInRecommendationsSnake = "used_in_recommendations"
            case relatedProducts
            case relatedProductsSnake = "related_products"
            case recommendations
        }
    }

    init(from decoder: Decoder) throws {
        let root = try decoder.container(keyedBy: CodingKeys.self)
        let envelope =
            try root.decodeIfPresent(DataEnvelope.self, forKey: .data)
            ?? root.decodeIfPresent(DataEnvelope.self, forKey: .product)

        id =
            (try? root.decode(String.self, forKey: .id))
            ?? envelope?.id
            ?? UUID().uuidString
        name =
            (try? root.decode(String.self, forKey: .name))
            ?? envelope?.name
            ?? "Product"
        brand =
            (try? root.decodeIfPresent(String.self, forKey: .brand))
            ?? envelope?.brand
        type =
            (try? root.decodeIfPresent(String.self, forKey: .type))
            ?? envelope?.type
            ?? "unknown"
        description =
            (try? root.decodeIfPresent(String.self, forKey: .description))
            ?? envelope?.description
        applicationRate =
            (try? root.decodeIfPresent(String.self, forKey: .applicationRate))
            ?? (try? root.decodeIfPresent(String.self, forKey: .applicationRateSnake))
            ?? envelope?.applicationRate
            ?? envelope?.applicationRateSnake
        crops =
            (try? root.decodeIfPresent([String].self, forKey: .crops))
            ?? envelope?.crops
            ?? []
        usedInRecommendations =
            (try? root.decodeIfPresent(Int.self, forKey: .usedInRecommendations))
            ?? (try? root.decodeIfPresent(Int.self, forKey: .usedInRecommendationsSnake))
            ?? envelope?.usedInRecommendations
            ?? envelope?.usedInRecommendationsSnake
            ?? 0
        relatedProducts =
            (try? root.decodeIfPresent([RelatedProductSummary].self, forKey: .relatedProducts))
            ?? (try? root.decodeIfPresent([RelatedProductSummary].self, forKey: .relatedProductsSnake))
            ?? envelope?.relatedProducts
            ?? envelope?.relatedProductsSnake
            ?? []
        recommendations =
            (try? root.decodeIfPresent([ProductRecommendationReference].self, forKey: .recommendations))
            ?? envelope?.recommendations
            ?? []
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
    let meta: BatchPricingMeta?

    private enum CodingKeys: String, CodingKey {
        case pricing
        case results
        case meta
    }

    private struct LegacyResultEntry: Decodable {
        let productId: String
        let productName: String
        let brand: String?
        let pricing: [ProductPricingOffer]
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)

        if let direct = try? container.decode([ProductPricingEntry].self, forKey: .pricing) {
            pricing = direct
            meta = try? container.decodeIfPresent(BatchPricingMeta.self, forKey: .meta)
            return
        }

        if let legacy = try? container.decode([LegacyResultEntry].self, forKey: .results) {
            pricing = legacy.map { item in
                let sorted = item.pricing
                    .filter { $0.price != nil }
                    .sorted { ($0.price ?? Double.greatestFiniteMagnitude) < ($1.price ?? Double.greatestFiniteMagnitude) }

                return ProductPricingEntry(
                    productId: item.productId,
                    productName: item.productName,
                    brand: item.brand,
                    pricing: ProductPricingSnapshot(
                        currency: "USD",
                        retailPrice: sorted.first?.price,
                        wholesalePrice: sorted.dropFirst().first?.price,
                        unit: sorted.first?.unit,
                        availability: sorted.isEmpty ? nil : "\(sorted.count) retailer offers",
                        lastUpdated: sorted.first?.lastUpdated
                    ),
                    offers: item.pricing
                )
            }
            meta = nil
            return
        }

        pricing = []
        meta = try? container.decodeIfPresent(BatchPricingMeta.self, forKey: .meta)
    }
}

struct BatchPricingMeta: Decodable {
    let region: String?
    let fetchedAt: String?

    private enum CodingKeys: String, CodingKey {
        case region
        case fetchedAt
        case fetchedAtSnake = "fetched_at"
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        region = try container.decodeIfPresent(String.self, forKey: .region)
        fetchedAt =
            try container.decodeIfPresent(String.self, forKey: .fetchedAt)
            ?? (try container.decodeIfPresent(String.self, forKey: .fetchedAtSnake))
    }
}

struct ProductPricingEntry: Decodable, Identifiable {
    var id: String { productId }
    let productId: String
    let productName: String
    let brand: String?
    let pricing: ProductPricingSnapshot
    let offers: [ProductPricingOffer]

    private enum CodingKeys: String, CodingKey {
        case productId
        case productName
        case brand
        case pricing
        case offers
    }

    init(
        productId: String,
        productName: String,
        brand: String?,
        pricing: ProductPricingSnapshot,
        offers: [ProductPricingOffer] = []
    ) {
        self.productId = productId
        self.productName = productName
        self.brand = brand
        self.pricing = pricing
        self.offers = offers
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        productId = (try? container.decode(String.self, forKey: .productId)) ?? UUID().uuidString
        productName = (try? container.decode(String.self, forKey: .productName)) ?? "Product"
        brand = try? container.decodeIfPresent(String.self, forKey: .brand)

        let explicitOffers =
            (try? container.decode([ProductPricingOffer].self, forKey: .offers))
            ?? []

        if let structuredPricing = try? container.decode(ProductPricingSnapshot.self, forKey: .pricing) {
            pricing = structuredPricing
            offers = explicitOffers
            return
        }

        let pricingOffers =
            (try? container.decode([ProductPricingOffer].self, forKey: .pricing))
            ?? explicitOffers
        let sorted = pricingOffers
            .filter { $0.price != nil }
            .sorted { ($0.price ?? Double.greatestFiniteMagnitude) < ($1.price ?? Double.greatestFiniteMagnitude) }

        pricing = ProductPricingSnapshot(
            currency: "USD",
            retailPrice: sorted.first?.price,
            wholesalePrice: sorted.dropFirst().first?.price,
            unit: sorted.first?.unit,
            availability: sorted.isEmpty ? nil : "\(sorted.count) retailer offers",
            lastUpdated: sorted.first?.lastUpdated
        )
        offers = pricingOffers
    }
}

struct ProductPricingSnapshot: Decodable {
    let currency: String
    let retailPrice: Double?
    let wholesalePrice: Double?
    let unit: String?
    let availability: String?
    let lastUpdated: String?
}

struct ProductPricingOffer: Decodable, Identifiable {
    var id: String {
        [retailer, unit, url ?? "", lastUpdated ?? ""].joined(separator: "::")
    }

    let price: Double?
    let unit: String
    let retailer: String
    let url: String?
    let region: String
    let lastUpdated: String?

    private enum CodingKeys: String, CodingKey {
        case price
        case unit
        case retailer
        case url
        case region
        case lastUpdated
    }

    init(
        price: Double?,
        unit: String,
        retailer: String,
        url: String?,
        region: String,
        lastUpdated: String?
    ) {
        self.price = price
        self.unit = unit
        self.retailer = retailer
        self.url = url
        self.region = region
        self.lastUpdated = lastUpdated
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        if let numeric = try? container.decodeIfPresent(Double.self, forKey: .price) {
            price = numeric
        } else if let raw = try? container.decodeIfPresent(String.self, forKey: .price) {
            let sanitized = raw.replacingOccurrences(of: "[^0-9.]", with: "", options: .regularExpression)
            price = Double(sanitized)
        } else {
            price = nil
        }

        unit = (try? container.decode(String.self, forKey: .unit)) ?? "unit"
        retailer = (try? container.decode(String.self, forKey: .retailer)) ?? "Retailer"
        url = try? container.decodeIfPresent(String.self, forKey: .url)
        region = (try? container.decode(String.self, forKey: .region)) ?? "United States"
        lastUpdated = try? container.decodeIfPresent(String.self, forKey: .lastUpdated)
    }
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
