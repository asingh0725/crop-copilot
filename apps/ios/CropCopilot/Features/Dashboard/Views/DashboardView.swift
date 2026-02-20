//
//  DashboardView.swift
//  CropCopilot
//

import SwiftUI

struct DashboardView: View {
    @StateObject private var viewModel = DashboardViewModel()
    @Binding var selectedTab: AppTab

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    heroCard
                    insightCards
                    quickActions
                    statusStrip
                    recentRecommendationsSection
                }
                .padding(16)
                .padding(.bottom, 28)
            }
            .navigationTitle("Dashboard")
            .refreshable {
                await viewModel.loadRecentRecommendations()
            }
            .task {
                await viewModel.loadIfNeeded()
            }
        }
    }

    private var heroCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 10) {
                CropCopilotLogoMark(size: 30, color: .appSecondary)
                Text("Crop Copilot")
                    .font(.title3.weight(.bold))
                Spacer()
            }

            Text("AI-backed agronomy recommendations with citations.")
                .font(.subheadline)
                .foregroundStyle(.secondary)

            Button {
                selectedTab = .recommendations
            } label: {
                Label("Open Recommendations", systemImage: "arrow.up.right")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.black)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .background(Color.appPrimary)
                    .clipShape(Capsule())
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(
            LinearGradient(
                colors: [Color.white, Color.appCanvas],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        )
        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .stroke(.black.opacity(0.08), lineWidth: 0.8)
        )
        .shadow(color: .black.opacity(0.05), radius: 14, x: 0, y: 6)
    }

    private var insightCards: some View {
        VStack(spacing: 10) {
            HStack(spacing: 10) {
                metricCard(
                    title: "Recent",
                    value: "\(viewModel.recentRecommendations.count)",
                    subtitle: "recommendations"
                )
                metricCard(
                    title: "Average",
                    value: averageConfidenceLabel,
                    subtitle: "confidence"
                )
            }

            HStack(spacing: 10) {
                metricCard(
                    title: "High",
                    value: highConfidenceCountLabel,
                    subtitle: ">= 80%"
                )
                metricCard(
                    title: "Low",
                    value: lowConfidenceCountLabel,
                    subtitle: "< 60%"
                )
            }
        }
    }

    private var lowConfidenceCountLabel: String {
        guard !viewModel.recentRecommendations.isEmpty else { return "0" }
        let lowCount = viewModel.recentRecommendations.filter { $0.confidence < 0.6 }.count
        return "\(lowCount)"
    }

    private var averageConfidenceLabel: String {
        guard !viewModel.recentRecommendations.isEmpty else { return "--" }
        let avg = viewModel.recentRecommendations.map(\.confidence).reduce(0, +)
            / Double(viewModel.recentRecommendations.count)
        return "\(Int((avg * 100).rounded()))%"
    }

    private var highConfidenceCountLabel: String {
        guard !viewModel.recentRecommendations.isEmpty else { return "0" }
        let highCount = viewModel.recentRecommendations.filter { $0.confidence >= 0.8 }.count
        return "\(highCount)"
    }

    private var quickActions: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Quick Actions")
                .font(.headline)
                .foregroundStyle(.primary)

            HStack(spacing: 10) {
                Button {
                    selectedTab = .diagnose
                } label: {
                    quickActionCard(icon: "camera.fill", title: "New Diagnosis", color: .appPrimary)
                }
                .buttonStyle(AntigravityScaleButtonStyle())

                Button {
                    selectedTab = .products
                } label: {
                    quickActionCard(icon: "shippingbox.fill", title: "Browse Products", color: .blue)
                }
                .buttonStyle(AntigravityScaleButtonStyle())
            }
        }
    }

    private func metricCard(title: String, value: String, subtitle: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title.uppercased())
                .font(.caption2.weight(.semibold))
                .foregroundStyle(.secondary)
            Text(value)
                .font(.title3.weight(.bold))
                .foregroundStyle(.primary)
                .monospacedDigit()
            Text(subtitle)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .antigravityGlass(cornerRadius: 16)
    }

    private var statusStrip: some View {
        HStack(spacing: 8) {
            Label("Research-backed", systemImage: "checkmark.seal.fill")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.primary)
                .padding(.horizontal, 10)
                .padding(.vertical, 8)
                .background(Color.appSecondaryBackground)
                .clipShape(Capsule())

            Spacer()

            Label("Outcome tracking", systemImage: "chart.line.uptrend.xyaxis")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.primary)
                .padding(.horizontal, 10)
                .padding(.vertical, 8)
                .background(Color.appSecondaryBackground)
                .clipShape(Capsule())
        }
    }

    private func quickActionCard(icon: String, title: String, color: Color) -> some View {
        HStack(spacing: 10) {
            Image(systemName: icon)
                .font(.headline)
                .foregroundStyle(color)
                .frame(width: 28, height: 28)
                .background(Color.appSecondaryBackground)
                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))

            Text(title)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.primary)
                .lineLimit(1)
            Spacer()
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 14)
        .padding(.horizontal, 12)
        .antigravityGlass(cornerRadius: 14)
        .contentShape(Rectangle())
    }

    private var recentRecommendationsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Recent Recommendations")
                    .font(.headline)
                    .foregroundStyle(.primary)
                Spacer()
                Button("See All") {
                    selectedTab = .recommendations
                }
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(Color.appSecondary)
            }

            if viewModel.isLoading {
                ProgressView().tint(Color.appPrimary)
            } else if viewModel.recentRecommendations.isEmpty {
                emptyState
            } else {
                VStack(spacing: 10) {
                    ForEach(viewModel.recentRecommendations.prefix(6)) { recommendation in
                        NavigationLink {
                            RecommendationDetailView(recommendationId: recommendation.id)
                        } label: {
                            RecommendationCard(recommendation: recommendation, style: .row)
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                }
            }

            if let error = viewModel.errorMessage {
                Text(error)
                    .font(.caption)
                    .foregroundStyle(.red)
            }
        }
    }

    private var emptyState: some View {
        VStack(spacing: 10) {
            Image(systemName: "leaf")
                .font(.title2)
                .foregroundStyle(.secondary)
            Text("No recommendations yet")
                .font(.subheadline.weight(.semibold))
            Text("Start a diagnosis to generate your first recommendation.")
                .font(.caption)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 20)
        .antigravityGlass(cornerRadius: 14)
    }
}
