//
//  BillingSnapshotStore.swift
//  CropCopilot
//

import Foundation

@MainActor
final class BillingSnapshotStore: ObservableObject {
    @Published private(set) var subscription: SubscriptionSnapshot?
    @Published private(set) var usage: UsageSnapshot?
    @Published private(set) var isLoading = false
    @Published private(set) var lastUpdatedAt: Date?

    private let apiClient = APIClient.shared
    private var hasLoaded = false

    var isPaidPlan: Bool {
        subscription?.isPaidPlan ?? false
    }

    var creditBalanceUsd: Double {
        usage?.creditsBalanceUsd ?? 0
    }

    var remainingRecommendations: Int {
        usage?.remainingRecommendations ?? 0
    }

    var purchasedRecommendationCapacity: Int {
        usage?.purchasedRecommendationCapacity ?? 0
    }

    var totalRecommendationCapacityLeft: Int {
        usage?.totalRecommendationCapacityLeft ?? 0
    }

    var planLabel: String {
        subscription?.planName ?? "Grower Free"
    }

    var currentPeriodEnd: String? {
        subscription?.currentPeriodEnd
    }

    func refreshIfNeeded() async {
        guard !hasLoaded else { return }
        await refresh(force: true)
    }

    func refresh(force: Bool = false) async {
        if isLoading && !force {
            return
        }

        isLoading = true
        defer { isLoading = false }

        do {
            async let subscriptionTask: SubscriptionSnapshotResponse = apiClient.request(.getSubscription)
            async let usageTask: UsageSnapshotResponse = apiClient.request(.getUsage)

            let (subscriptionResponse, usageResponse) = try await (subscriptionTask, usageTask)
            subscription = subscriptionResponse.subscription
            usage = usageResponse.usage
            hasLoaded = true
            lastUpdatedAt = Date()
        } catch {
            if !hasLoaded {
                subscription = nil
                usage = nil
            }
        }
    }
}
