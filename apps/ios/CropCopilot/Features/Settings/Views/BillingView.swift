//
//  BillingView.swift
//  CropCopilot
//

import SafariServices
import SwiftUI

// MARK: - SafariView

private struct SafariView: UIViewControllerRepresentable {
    let url: URL

    func makeUIViewController(context: Context) -> SFSafariViewController {
        SFSafariViewController(url: url)
    }

    func updateUIViewController(_ uiViewController: SFSafariViewController, context: Context) {}
}

// MARK: - BillingView

struct BillingView: View {
    @StateObject private var viewModel = BillingViewModel()

    private static let currencyFormatter: NumberFormatter = {
        let f = NumberFormatter()
        f.numberStyle = .currency
        f.currencyCode = "USD"
        f.minimumFractionDigits = 2
        f.maximumFractionDigits = 2
        return f
    }()

    private static let dateFormatter: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateStyle = .long
        return f
    }()

    private func fmt(_ value: Double) -> String {
        Self.currencyFormatter.string(from: NSNumber(value: value)) ?? "$0.00"
    }

    private func fmtDate(_ iso: String) -> String {
        guard let date = ISO8601DateFormatter().date(from: iso) else { return "—" }
        return Self.dateFormatter.string(from: date)
    }

    var body: some View {
        ScrollView {
            VStack(spacing: Spacing.lg) {
                planCard
                usageCard
                autoReloadCard
                manageCard
            }
            .padding(.horizontal, Spacing.lg)
            .padding(.vertical, Spacing.md)
            .padding(.bottom, Spacing.xxl)
        }
        .navigationTitle("Billing & Credits")
        .task { await viewModel.load() }
        .sheet(item: $viewModel.checkoutURL) { url in
            SafariView(url: url)
                .ignoresSafeArea()
                .onDisappear { viewModel.handleCheckoutReturn() }
        }
    }

    // MARK: - Plan Card

    private var planCard: some View {
        VStack(alignment: .leading, spacing: Spacing.md) {
            sectionLabel(icon: "creditcard.fill", title: "Plan")

            if viewModel.isLoading && viewModel.subscription == nil {
                loadingRow
            } else if let sub = viewModel.subscription {
                VStack(alignment: .leading, spacing: Spacing.sm) {
                    HStack(alignment: .center, spacing: Spacing.sm) {
                        Text(sub.planName)
                            .font(.headline)
                            .foregroundStyle(.white)
                        statusBadge(sub.status)
                        if sub.cancelAtPeriodEnd {
                            badge("Cancels at period end", color: .semanticWarning)
                        }
                        Spacer()
                    }

                    Divider().overlay(Color.white.opacity(0.12))

                    infoRow("Price", value: "\(fmt(sub.priceUsd)) / month")
                    infoRow("Included recommendations", value: "\(sub.includedRecommendations) / month")
                    infoRow("Renews on", value: fmtDate(sub.currentPeriodEnd))
                }

                // Upgrade buttons
                if sub.planId == .growerFree {
                    VStack(spacing: Spacing.sm) {
                        billingButton("Upgrade to Grower ($29)", style: .primary) {
                            Task { await viewModel.startCheckout(tier: "grower") }
                        }
                        billingButton("Upgrade to Grower Pro ($45)", style: .secondary) {
                            Task { await viewModel.startCheckout(tier: "grower_pro") }
                        }
                    }
                } else if sub.planId == .grower {
                    billingButton("Upgrade to Grower Pro", style: .primary) {
                        Task { await viewModel.startCheckout(tier: "grower_pro") }
                    }
                }
            } else {
                Text("Subscription data unavailable.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(Spacing.lg)
        .antigravityGlass(cornerRadius: CornerRadius.xl)
    }

    // MARK: - Usage Card

    private var usageCard: some View {
        VStack(alignment: .leading, spacing: Spacing.md) {
            sectionLabel(icon: "gauge", title: "Usage & Credits")

            if viewModel.isLoading && viewModel.usage == nil {
                loadingRow
            } else if let u = viewModel.usage {
                // Low-balance warning
                if u.remainingRecommendations == 0 && u.creditsBalanceUsd < u.overagePriceUsd {
                    warningBanner(
                        "You're out of capacity — buy credits or upgrade your plan to continue.",
                        color: Color.semanticError
                    )
                }

                // Usage progress
                let pct = u.includedRecommendations > 0
                    ? min(1.0, Double(u.usedRecommendations) / Double(u.includedRecommendations))
                    : 0.0

                VStack(alignment: .leading, spacing: Spacing.xs) {
                    HStack {
                        Text("\(u.usedRecommendations) of \(u.includedRecommendations) used")
                            .font(.subheadline.weight(.medium))
                            .foregroundStyle(.white)
                        Spacer()
                        Text("\(u.remainingRecommendations) remaining")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    GeometryReader { geo in
                        ZStack(alignment: .leading) {
                            RoundedRectangle(cornerRadius: 4, style: .continuous)
                                .fill(Color.white.opacity(0.10))
                                .frame(height: 6)
                            RoundedRectangle(cornerRadius: 4, style: .continuous)
                                .fill(pct >= 1.0 ? Color.semanticError : Color.appPrimary)
                                .frame(width: geo.size.width * pct, height: 6)
                        }
                    }
                    .frame(height: 6)
                }

                Divider().overlay(Color.white.opacity(0.12))

                infoRow("Credit balance", value: fmt(u.creditsBalanceUsd))
                infoRow("Overage charge", value: "\(fmt(u.overagePriceUsd)) per recommendation")
                infoRow("Credit pack", value: "$12 for 10 recommendations")

                billingButton("Buy 10-credit pack ($12)", style: .outline) {
                    Task { await viewModel.buyCredits() }
                }
            } else {
                Text("Usage data unavailable.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(Spacing.lg)
        .antigravityGlass(cornerRadius: CornerRadius.xl)
    }

    // MARK: - Auto-Reload Card

    private var autoReloadCard: some View {
        VStack(alignment: .leading, spacing: Spacing.md) {
            HStack {
                sectionLabel(icon: "arrow.trianglehead.2.clockwise", title: "Auto-Reload")
                Spacer()
                saveIndicator
            }

            let isPaidPlan = viewModel.subscription?.isPaidPlan ?? false

            if !isPaidPlan {
                Text("Auto-reload requires a paid plan. Upgrade to enable.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            } else {
                Toggle(isOn: Binding(
                    get: { viewModel.autoReloadConfig.enabled },
                    set: { val in
                        viewModel.setAutoReloadEnabled(val)
                        Task { await viewModel.saveAutoReloadConfig() }
                    }
                )) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Auto-reload credits")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(.white)
                        Text("Automatically charge your saved card when balance is low.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                .tint(Color.appPrimary)
                .disabled(!isPaidPlan)

                if viewModel.autoReloadConfig.enabled {
                    Divider().overlay(Color.white.opacity(0.12))

                    // Threshold stepper
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Reload when balance below")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            Text(fmt(viewModel.autoReloadConfig.thresholdUsd))
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(.white)
                                .monospacedDigit()
                        }
                        Spacer()
                        Stepper(
                            "",
                            value: Binding(
                                get: { viewModel.autoReloadConfig.thresholdUsd },
                                set: { val in
                                    viewModel.setThreshold(val)
                                    Task { await viewModel.saveAutoReloadConfig() }
                                }
                            ),
                            in: 1...50,
                            step: 1
                        )
                        .labelsHidden()
                    }

                    // Monthly limit stepper
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Monthly auto-reload limit")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            Text(fmt(viewModel.autoReloadConfig.monthlyLimitUsd))
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(.white)
                                .monospacedDigit()
                        }
                        Spacer()
                        Stepper(
                            "",
                            value: Binding(
                                get: { viewModel.autoReloadConfig.monthlyLimitUsd },
                                set: { val in
                                    viewModel.setMonthlyLimit(val)
                                    Task { await viewModel.saveAutoReloadConfig() }
                                }
                            ),
                            in: 12...500,
                            step: 12
                        )
                        .labelsHidden()
                    }
                }
            }
        }
        .padding(Spacing.lg)
        .antigravityGlass(cornerRadius: CornerRadius.xl)
    }

    // MARK: - Manage Card

    private var manageCard: some View {
        VStack(alignment: .leading, spacing: Spacing.md) {
            sectionLabel(icon: "slider.horizontal.3", title: "Manage")

            billingButton("Manage Billing in Stripe", style: .outline) {
                Task { await viewModel.openBillingPortal() }
            }
        }
        .padding(Spacing.lg)
        .antigravityGlass(cornerRadius: CornerRadius.xl)
    }

    // MARK: - Helpers

    @ViewBuilder
    private func sectionLabel(icon: String, title: String) -> some View {
        HStack(spacing: Spacing.sm) {
            Image(systemName: icon)
                .font(.subheadline)
                .foregroundStyle(Color.appPrimary)
            Text(title)
                .font(.subheadline.weight(.bold))
                .foregroundStyle(Color.appPrimary)
        }
    }

    @ViewBuilder
    private func infoRow(_ label: String, value: String) -> some View {
        HStack {
            Text(label)
                .font(.caption)
                .foregroundStyle(.secondary)
            Spacer()
            Text(value)
                .font(.caption.weight(.semibold))
                .foregroundStyle(.white)
                .multilineTextAlignment(.trailing)
        }
    }

    @ViewBuilder
    private func warningBanner(_ message: String, color: Color) -> some View {
        HStack(alignment: .top, spacing: Spacing.sm) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.caption)
                .foregroundStyle(color)
            Text(message)
                .font(.caption)
                .foregroundStyle(color)
        }
        .padding(Spacing.sm)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(color.opacity(0.12))
        .clipShape(RoundedRectangle(cornerRadius: CornerRadius.sm, style: .continuous))
    }

    @ViewBuilder
    private func statusBadge(_ status: String) -> some View {
        let isActive = status == "active"
        Text(status.replacingOccurrences(of: "_", with: " ").capitalized)
            .font(.caption2.weight(.semibold))
            .foregroundStyle(isActive ? Color.appPrimary : .secondary)
            .padding(.horizontal, 6)
            .padding(.vertical, 3)
            .background(
                RoundedRectangle(cornerRadius: 6, style: .continuous)
                    .fill(isActive ? Color.appPrimary.opacity(0.15) : Color.white.opacity(0.08))
            )
    }

    @ViewBuilder
    private func badge(_ text: String, color: Color) -> some View {
        Text(text)
            .font(.caption2.weight(.semibold))
            .foregroundStyle(color)
            .padding(.horizontal, 6)
            .padding(.vertical, 3)
            .background(
                RoundedRectangle(cornerRadius: 6, style: .continuous)
                    .fill(color.opacity(0.15))
            )
    }

    private enum ButtonStyle { case primary, secondary, outline }

    @ViewBuilder
    private func billingButton(_ title: String, style: ButtonStyle, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(style == .outline ? Color.appPrimary : .black)
                .frame(maxWidth: .infinity)
                .padding(.vertical, Spacing.sm)
                .background(
                    RoundedRectangle(cornerRadius: CornerRadius.md, style: .continuous)
                        .fill(style == .primary ? Color.appPrimary
                              : style == .secondary ? Color.white.opacity(0.14)
                              : Color.clear)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: CornerRadius.md, style: .continuous)
                        .stroke(style == .outline ? Color.appPrimary.opacity(0.5) : Color.clear, lineWidth: 1)
                )
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder
    private var loadingRow: some View {
        Text("Loading…")
            .font(.caption)
            .foregroundStyle(.secondary)
    }

    @ViewBuilder
    private var saveIndicator: some View {
        switch viewModel.saveState {
        case .saving:
            Text("Saving…")
                .font(.caption)
                .foregroundStyle(.secondary)
        case .saved:
            Text("Saved ✓")
                .font(.caption)
                .foregroundStyle(Color.appPrimary)
        case .idle:
            EmptyView()
        }
    }
}

// MARK: - URL: Identifiable

extension URL: @retroactive Identifiable {
    public var id: String { absoluteString }
}
