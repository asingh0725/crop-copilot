//
//  BillingViewModel.swift
//  CropCopilot
//

import Foundation

private struct CheckoutResponse: Decodable {
    let checkoutUrl: String?
    let mode: String?
}

private struct PortalResponse: Decodable {
    let portalUrl: String?
    let mode: String?
}

@MainActor
final class BillingViewModel: ObservableObject {
    @Published private(set) var subscription: SubscriptionSnapshot?
    @Published private(set) var usage: UsageSnapshot?
    @Published private(set) var autoReloadConfig: AutoReloadConfig = AutoReloadConfig(
        enabled: false,
        thresholdUsd: 5.0,
        monthlyLimitUsd: 60.0,
        reloadPackId: "pack_10"
    )
    @Published private(set) var isLoading = false
    @Published var checkoutURL: URL?
    @Published private(set) var saveState: SaveState = .idle

    enum SaveState { case idle, saving, saved }

    private let apiClient = APIClient.shared

    // MARK: - Load

    func load() async {
        isLoading = true
        defer { isLoading = false }

        do {
            async let subTask: SubscriptionSnapshotResponse = apiClient.request(.getSubscription)
            async let usageTask: UsageSnapshotResponse = apiClient.request(.getUsage)
            async let configTask: AutoReloadConfigResponse = apiClient.request(.getAutoReloadConfig)

            let (subResp, usageResp, configResp) = try await (subTask, usageTask, configTask)
            subscription = subResp.subscription
            usage = usageResp.usage
            autoReloadConfig = configResp.config
        } catch {
            // Keep existing data if we had it; otherwise leave nil
        }
    }

    // MARK: - Checkout

    func startCheckout(tier: String) async {
        do {
            let body: [String: String] = ["tier": tier]
            let resp: CheckoutResponse = try await apiClient.request(
                .subscriptionCheckout,
                body: body
            )
            if resp.mode == "simulation" {
                await load()
                return
            }
            if let urlString = resp.checkoutUrl, let url = URL(string: urlString) {
                checkoutURL = url
            }
        } catch {}
    }

    func buyCredits() async {
        do {
            let body: [String: String] = ["packId": "pack_10"]
            let resp: CheckoutResponse = try await apiClient.request(
                .creditsCheckout,
                body: body
            )
            if resp.mode == "simulation" {
                await load()
                return
            }
            if let urlString = resp.checkoutUrl, let url = URL(string: urlString) {
                checkoutURL = url
            }
        } catch {}
    }

    func openBillingPortal() async {
        do {
            let resp: PortalResponse = try await apiClient.request(
                .subscriptionPortal,
                body: [String: String]()
            )
            if let urlString = resp.portalUrl, let url = URL(string: urlString) {
                if resp.mode == "simulation" {
                    await load()
                    return
                }
                checkoutURL = url
            }
        } catch {}
    }

    // MARK: - Auto-reload

    func saveAutoReloadConfig() async {
        saveState = .saving
        do {
            let updated: AutoReloadConfigResponse = try await apiClient.request(
                .updateAutoReloadConfig,
                body: autoReloadConfig
            )
            autoReloadConfig = updated.config
            saveState = .saved
            try? await Task.sleep(for: .seconds(2))
            if case .saved = saveState { saveState = .idle }
        } catch {
            saveState = .idle
        }
    }

    func setAutoReloadEnabled(_ enabled: Bool) {
        autoReloadConfig = AutoReloadConfig(
            enabled: enabled,
            thresholdUsd: autoReloadConfig.thresholdUsd,
            monthlyLimitUsd: autoReloadConfig.monthlyLimitUsd,
            reloadPackId: autoReloadConfig.reloadPackId
        )
    }

    func setThreshold(_ value: Double) {
        autoReloadConfig = AutoReloadConfig(
            enabled: autoReloadConfig.enabled,
            thresholdUsd: value,
            monthlyLimitUsd: autoReloadConfig.monthlyLimitUsd,
            reloadPackId: autoReloadConfig.reloadPackId
        )
    }

    func setMonthlyLimit(_ value: Double) {
        autoReloadConfig = AutoReloadConfig(
            enabled: autoReloadConfig.enabled,
            thresholdUsd: autoReloadConfig.thresholdUsd,
            monthlyLimitUsd: value,
            reloadPackId: autoReloadConfig.reloadPackId
        )
    }

    // MARK: - Post-checkout refresh

    func handleCheckoutReturn() {
        Task { await load() }
    }
}
