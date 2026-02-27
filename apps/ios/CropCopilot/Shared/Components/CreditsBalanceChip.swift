//
//  CreditsBalanceChip.swift
//  CropCopilot
//

import SwiftUI

struct CreditsBalanceChip: View {
    @EnvironmentObject private var billingStore: BillingSnapshotStore
    @State private var isSheetOpen = false

    private static let currencyFormatter: NumberFormatter = {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = "USD"
        formatter.minimumFractionDigits = 2
        formatter.maximumFractionDigits = 2
        return formatter
    }()

    private var balanceLabel: String {
        Self.currencyFormatter.string(from: NSNumber(value: billingStore.creditBalanceUsd)) ?? "$0.00"
    }

    var body: some View {
        Group {
            if billingStore.isPaidPlan {
                Button {
                    isSheetOpen = true
                } label: {
                    HStack(spacing: 6) {
                        Text(balanceLabel)
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(Color.appPrimary)
                            .monospacedDigit()
                            .lineLimit(1)
                        Image(systemName: "dollarsign.circle.fill")
                            .font(.caption)
                            .foregroundStyle(Color.appPrimary.opacity(0.9))
                    }
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .fill(Color.appEarth900.opacity(0.92))
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .stroke(Color.appPrimary.opacity(0.35), lineWidth: 1)
                    )
                }
                .buttonStyle(.plain)
                .sheet(isPresented: $isSheetOpen) {
                    CreditsBalanceSheet()
                        .environmentObject(billingStore)
                }
            }
        }
        .task {
            await billingStore.refreshIfNeeded()
        }
        .onReceive(NotificationCenter.default.publisher(for: .creditsStateNeedsRefresh)) { _ in
            Task {
                await billingStore.refresh(force: true)
            }
        }
    }
}

private struct CreditsBalanceSheet: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var billingStore: BillingSnapshotStore

    private static let currencyFormatter: NumberFormatter = {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = "USD"
        formatter.minimumFractionDigits = 2
        formatter.maximumFractionDigits = 2
        return formatter
    }()

    private static let dateFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateStyle = .long
        return formatter
    }()

    private var balanceLabel: String {
        Self.currencyFormatter.string(from: NSNumber(value: billingStore.creditBalanceUsd)) ?? "$0.00"
    }

    private var nextResetLabel: String {
        guard
            let raw = billingStore.currentPeriodEnd,
            let date = ISO8601DateFormatter().date(from: raw)
        else {
            return "—"
        }
        return Self.dateFormatter.string(from: date)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: Spacing.md) {
                    VStack(alignment: .leading, spacing: Spacing.sm) {
                        Text("Credit balance")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(Color.appPrimary.opacity(0.9))
                        Text(balanceLabel)
                            .font(.system(size: 44, weight: .bold, design: .rounded))
                            .foregroundStyle(.white)
                            .monospacedDigit()
                        Text("Recommendations left this month: \(billingStore.remainingRecommendations)")
                            .font(.subheadline)
                            .foregroundStyle(.white.opacity(0.8))
                        Text("Total recommendation capacity left: \(billingStore.totalRecommendationCapacityLeft)")
                            .font(.caption)
                            .foregroundStyle(.white.opacity(0.68))
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(Spacing.xl)
                    .background(
                        LinearGradient(
                            colors: [Color.appEarth950, Color.appEarth900],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .clipShape(RoundedRectangle(cornerRadius: CornerRadius.xl, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: CornerRadius.xl, style: .continuous)
                            .stroke(Color.appPrimary.opacity(0.24), lineWidth: 1)
                    )

                    VStack(alignment: .leading, spacing: Spacing.sm) {
                        Text("Plan")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.secondary)
                        Text(billingStore.planLabel)
                            .font(.headline)
                            .foregroundStyle(.primary)

                        Divider()

                        HStack {
                            Text("Monthly included recommendations")
                                .foregroundStyle(.secondary)
                            Spacer()
                            Text("\(billingStore.usage?.includedRecommendations ?? 0)")
                                .fontWeight(.semibold)
                                .monospacedDigit()
                        }

                        HStack {
                            Text("Purchased recommendation capacity")
                                .foregroundStyle(.secondary)
                            Spacer()
                            Text("\(billingStore.purchasedRecommendationCapacity)")
                                .fontWeight(.semibold)
                                .monospacedDigit()
                        }

                        HStack {
                            Text("Next credits period reset")
                                .foregroundStyle(.secondary)
                            Spacer()
                            Text(nextResetLabel)
                                .fontWeight(.semibold)
                        }
                    }
                    .font(.subheadline)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(Spacing.lg)
                    .antigravityGlass(cornerRadius: CornerRadius.lg)
                }
                .padding(.horizontal, Spacing.lg)
                .padding(.top, Spacing.md)
                .padding(.bottom, Spacing.xxl)
            }
            .navigationTitle("Credits & Usage")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
            .task {
                await billingStore.refresh(force: true)
            }
        }
    }
}
