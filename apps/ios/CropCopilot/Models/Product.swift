//
//  Product.swift
//  CropCopilot
//
//  Created by Claude Code on Phase 1
//

import Foundation

struct Product: Codable, Identifiable {
    let id: String
    let name: String
    let type: ProductType
    let description: String?
    let analysis: ProductAnalysis?
    let createdAt: Date

    enum CodingKeys: String, CodingKey {
        case id
        case name
        case type
        case description
        case analysis
        case createdAt = "created_at"
    }
}

// Matches Prisma ProductType enum exactly
enum ProductType: String, Codable, CaseIterable {
    case fertilizer = "FERTILIZER"
    case amendment = "AMENDMENT"
    case pesticide = "PESTICIDE"
    case herbicide = "HERBICIDE"
    case fungicide = "FUNGICIDE"
    case insecticide = "INSECTICIDE"
    case seedTreatment = "SEED_TREATMENT"
    case biological = "BIOLOGICAL"

    var displayName: String {
        switch self {
        case .fertilizer: return "Fertilizer"
        case .amendment: return "Amendment"
        case .pesticide: return "Pesticide"
        case .herbicide: return "Herbicide"
        case .fungicide: return "Fungicide"
        case .insecticide: return "Insecticide"
        case .seedTreatment: return "Seed Treatment"
        case .biological: return "Biological"
        }
    }
}

struct ProductAnalysis: Codable {
    let npkRatio: String?
    let activeIngredients: [String]?
    let guaranteedAnalysis: [String: AnyCodable]?
    let applicationRate: String?
    let crops: [String]?

    enum CodingKeys: String, CodingKey {
        case npkRatio = "npk_ratio"
        case activeIngredients = "active_ingredients"
        case guaranteedAnalysis = "guaranteed_analysis"
        case applicationRate = "application_rate"
        case crops
    }
}
