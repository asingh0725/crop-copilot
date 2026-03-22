//
//  BillingSnapshots.swift
//  CropCopilot
//

import Foundation

enum SubscriptionTierId: String, Decodable {
    case growerFree = "grower_free"
    case grower = "grower"
    case growerPro = "grower_pro"
}

struct DiagnoseInputEntitlements {
    let canUsePlanningInputs: Bool
    let canUsePreciseLocation: Bool
}

extension SubscriptionTierId {
    var diagnoseInputEntitlements: DiagnoseInputEntitlements {
        switch self {
        case .growerFree:
            return DiagnoseInputEntitlements(
                canUsePlanningInputs: false,
                canUsePreciseLocation: false
            )
        case .grower:
            return DiagnoseInputEntitlements(
                canUsePlanningInputs: true,
                canUsePreciseLocation: false
            )
        case .growerPro:
            return DiagnoseInputEntitlements(
                canUsePlanningInputs: true,
                canUsePreciseLocation: true
            )
        }
    }
}

struct SubscriptionSnapshot: Decodable {
    let planId: SubscriptionTierId
    let planName: String
    let status: String
    let includedRecommendations: Int
    let priceUsd: Double
    let currentPeriodStart: String
    let currentPeriodEnd: String
    let cancelAtPeriodEnd: Bool

    var isPaidPlan: Bool {
        planId == .grower || planId == .growerPro
    }
}

struct UsageSnapshot: Decodable {
    let month: String
    let usedRecommendations: Int
    let includedRecommendations: Int
    let remainingRecommendations: Int
    let creditsBalanceUsd: Double
    let overagePriceUsd: Double

    var purchasedRecommendationCapacity: Int {
        guard overagePriceUsd > 0 else { return 0 }
        return Int((creditsBalanceUsd / overagePriceUsd).rounded(.down))
    }

    var totalRecommendationCapacityLeft: Int {
        max(0, remainingRecommendations + purchasedRecommendationCapacity)
    }
}

struct SubscriptionSnapshotResponse: Decodable {
    let subscription: SubscriptionSnapshot?
}

struct UsageSnapshotResponse: Decodable {
    let usage: UsageSnapshot?
}

struct AutoReloadConfig: Codable {
    var enabled: Bool
    var thresholdUsd: Double
    var monthlyLimitUsd: Double
    var reloadPackId: String
}

struct AutoReloadConfigResponse: Decodable {
    let config: AutoReloadConfig
}
