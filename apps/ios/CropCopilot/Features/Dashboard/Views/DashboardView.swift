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
                VStack(alignment: .leading, spacing: Spacing.lg) {
                    heroCard
                    insightCards
                    quickActions
                    statusStrip
                    recentRecommendationsSection
                }
                .padding(.horizontal, Spacing.lg)
                .padding(.top, Spacing.sm)
                .padding(.bottom, Spacing.xxxl)
            }
            .navigationTitle("Dashboard")
            .refreshable {
                await viewModel.loadRecentRecommendations()
            }
            .task {
                await viewModel.loadIfNeeded()
            }
            .onAppear {
                Task {
                    await viewModel.loadRecentRecommendations()
                }
            }
        }
    }

    // MARK: - Hero Card

    private var heroCard: some View {
        ZStack(alignment: .topLeading) {
            // Animated particle field — subtle botanical pollen drift
            AnimatedParticleField()

            VStack(alignment: .leading, spacing: Spacing.lg) {
                HStack(spacing: Spacing.sm) {
                    CropCopilotLogoMark(size: 32, color: .white)
                        .pulseGlow(color: .appPrimary, radius: 10, duration: 4.0)
                    Text("Crop Copilot")
                        .font(.title3.weight(.bold))
                        .foregroundStyle(.white)
                    Spacer()
                }

                Text("AI-backed agronomy\nrecommendations with citations.")
                    .font(.subheadline)
                    .foregroundStyle(.white.opacity(0.70))
                    .lineSpacing(3)

                Button {
                    selectedTab = .diagnose
                } label: {
                    Label("Start New Diagnosis", systemImage: "arrow.up.right")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.black)
                }
                .buttonStyle(GlowSkeuomorphicButtonStyle())
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(Spacing.xl)
        }
        .heroGradientCard()
    }

    // MARK: - Insight Cards

    private var insightCards: some View {
        HStack(spacing: Spacing.sm) {
            metricCard(
                title: "Recent",
                value: "\(viewModel.recentRecommendations.count)",
                subtitle: "recommendations",
                icon: "list.bullet.rectangle.fill",
                color: .appPrimary
            )
            metricCard(
                title: "Average",
                value: averageConfidenceLabel,
                subtitle: "confidence",
                icon: "chart.bar.fill",
                color: Color.semanticInfo
            )
            metricCard(
                title: "High",
                value: highConfidenceCountLabel,
                subtitle: "≥ 80%",
                icon: "checkmark.seal.fill",
                color: Color.semanticSuccess
            )
        }
    }

    private var averageConfidenceLabel: String {
        guard !viewModel.recentRecommendations.isEmpty else { return "--" }
        let avg = viewModel.recentRecommendations.map(\.confidence).reduce(0, +)
            / Double(viewModel.recentRecommendations.count)
        return "\(Int((avg * 100).rounded()))%"
    }

    private var highConfidenceCountLabel: String {
        guard !viewModel.recentRecommendations.isEmpty else { return "0" }
        return "\(viewModel.recentRecommendations.filter { $0.confidence >= 0.8 }.count)"
    }

    private func metricCard(
        title: String,
        value: String,
        subtitle: String,
        icon: String,
        color: Color
    ) -> some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            Image(systemName: icon)
                .font(.caption.weight(.semibold))
                .foregroundStyle(color)
                .frame(width: 26, height: 26)
                .background(color.opacity(0.12))
                .clipShape(RoundedRectangle(cornerRadius: 7, style: .continuous))
                .floatAnimation(amplitude: 3, duration: 5.5)

            Text(value)
                .font(.title3.weight(.bold))
                .foregroundStyle(color)
                .monospacedDigit()

            VStack(alignment: .leading, spacing: 2) {
                Text(title.uppercased())
                    .font(.appMicro)
                    .foregroundStyle(.secondary)
                Text(subtitle)
                    .font(.appMicro)
                    .foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Spacing.md)
        .antigravityGlass(cornerRadius: CornerRadius.lg)
        .limeShadow(radius: 6, opacity: 0.10)
    }

    // MARK: - Quick Actions

    private var quickActions: some View {
        VStack(alignment: .leading, spacing: Spacing.md) {
            SectionHeader(title: "Quick Actions")

            HStack(spacing: Spacing.sm) {
                Button {
                    selectedTab = .diagnose
                } label: {
                    quickActionCard(
                        icon: "camera.fill",
                        title: "Photo Diagnosis",
                        color: .appPrimary
                    )
                }
                .buttonStyle(AntigravityScaleButtonStyle())

                Button {
                    selectedTab = .diagnose
                } label: {
                    quickActionCard(
                        icon: "doc.text.fill",
                        title: "Lab Report",
                        color: .semanticInfo
                    )
                }
                .buttonStyle(AntigravityScaleButtonStyle())
            }
        }
    }

    private func quickActionCard(icon: String, title: String, color: Color) -> some View {
        HStack(spacing: Spacing.sm) {
            IconBadge(icon: icon, color: color, size: 34, cornerRadius: 10)

            Text(title)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.primary)
                .lineLimit(2)
                .fixedSize(horizontal: false, vertical: true)

            Spacer()

            Image(systemName: "arrow.right")
                .font(.caption2.weight(.bold))
                .foregroundStyle(color)
                .frame(width: 22, height: 22)
                .background(color.opacity(0.10))
                .clipShape(Circle())
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, Spacing.md)
        .padding(.horizontal, Spacing.md)
        .antigravityGlass(cornerRadius: CornerRadius.lg)
        .overlay(
            RoundedRectangle(cornerRadius: CornerRadius.lg, style: .continuous)
                .stroke(color.opacity(0.18), lineWidth: 1)
        )
    }

    // MARK: - Status Strip

    private var statusStrip: some View {
        HStack(spacing: Spacing.sm) {
            statusChip(icon: "checkmark.seal.fill", label: "Research-backed", color: .appPrimary)
            Spacer()
            statusChip(icon: "chart.line.uptrend.xyaxis", label: "Outcome tracking", color: .appSecondary)
        }
    }

    private func statusChip(icon: String, label: String, color: Color) -> some View {
        Label(label, systemImage: icon)
            .font(.caption.weight(.semibold))
            .foregroundStyle(color)
            .padding(.horizontal, Spacing.sm + 2)
            .padding(.vertical, Spacing.sm)
            .background(color.opacity(0.10))
            .clipShape(Capsule())
            .overlay(
                Capsule()
                    .stroke(color.opacity(0.22), lineWidth: 1)
            )
    }

    // MARK: - Recent Recommendations

    private var recentRecommendationsSection: some View {
        VStack(alignment: .leading, spacing: Spacing.md) {
            SectionHeader(title: "Recent Recommendations") {
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
                VStack(spacing: Spacing.sm) {
                    ForEach(viewModel.recentRecommendations.prefix(6)) { recommendation in
                        NavigationLink {
                            RecommendationDetailView(recommendationId: recommendation.id)
                        } label: {
                            RecommendationCard(recommendation: recommendation, style: .row)
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
        VStack(spacing: Spacing.md) {
            IconBadge(icon: "leaf.fill", color: .appPrimary, size: 44, cornerRadius: 14)
                .floatAnimation(amplitude: 4, duration: 5.5)

            VStack(spacing: 4) {
                Text("No recommendations yet")
                    .font(.subheadline.weight(.semibold))
                Text("Start a diagnosis to generate your first AI-backed recommendation.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, Spacing.xxl)
        .antigravityGlass(cornerRadius: CornerRadius.lg)
    }
}
