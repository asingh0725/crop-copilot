//
//  DashboardView.swift
//  CropCopilot
//
//  Created by Claude Code on Phase 2
//

import SwiftUI

struct DashboardView: View {
    @StateObject private var viewModel = DashboardViewModel()
    @EnvironmentObject var authViewModel: AuthViewModel
    @Binding var selectedTab: AppTab

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    // Welcome banner
                    welcomeBanner

                    // Quick actions
                    quickActions

                    // Recent recommendations
                    recentRecommendationsSection
                }
                .padding()
            }
            .navigationTitle("Dashboard")
            .refreshable {
                await viewModel.loadRecentRecommendations()
            }
            .task {
                await viewModel.loadRecentRecommendations()
            }
        }
    }

    // MARK: - Welcome Banner
    private var welcomeBanner: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Welcome back!")
                .font(.title2.bold())
            Text("Ready to analyze your crops?")
                .font(.subheadline)
                .foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(
            LinearGradient(
                colors: [Color.appPrimary.opacity(0.15), Color.appPrimary.opacity(0.05)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        )
        .cornerRadius(16)
    }

    // MARK: - Quick Actions
    private var quickActions: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Quick Actions")
                .font(.headline)

            HStack(spacing: 12) {
                Button {
                    selectedTab = .diagnose
                } label: {
                    quickActionCard(icon: "camera.fill", title: "Photo", color: .appPrimary)
                }
                .buttonStyle(.plain)

                Button {
                    selectedTab = .diagnose
                } label: {
                    quickActionCard(icon: "doc.text.fill", title: "Lab Report", color: .appAccent)
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func quickActionCard(icon: String, title: String, color: Color) -> some View {
        VStack(spacing: 8) {
            Image(systemName: icon)
                .font(.title2)
                .foregroundColor(color)
            Text(title)
                .font(.caption)
                .foregroundColor(.primary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 16)
        .background(Color.appSecondaryBackground)
        .cornerRadius(12)
    }

    // MARK: - Recent Recommendations
    private var recentRecommendationsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Recent Recommendations")
                    .font(.headline)
                Spacer()
                Button("See All") {
                    selectedTab = .recommendations
                }
                .font(.subheadline)
                .foregroundColor(.appPrimary)
            }

            if viewModel.isLoading {
                ForEach(0..<3, id: \.self) { _ in
                    recommendationSkeletonRow
                }
            } else if viewModel.recentRecommendations.isEmpty {
                emptyState
            } else {
                ForEach(viewModel.recentRecommendations) { rec in
                    NavigationLink {
                        RecommendationDetailView(recommendationId: rec.id)
                    } label: {
                        recommendationRow(rec)
                    }
                    .buttonStyle(.plain)
                }
            }

            if let error = viewModel.errorMessage {
                Text(error)
                    .font(.caption)
                    .foregroundColor(.red)
            }
        }
    }

    private func recommendationRow(_ rec: RecommendationSummary) -> some View {
        HStack(spacing: 12) {
            Image(systemName: rec.input.type == "PHOTO" ? "camera.fill" : "doc.text.fill")
                .foregroundColor(.appPrimary)
                .frame(width: 40, height: 40)
                .background(Color.appPrimary.opacity(0.1))
                .cornerRadius(8)

            VStack(alignment: .leading, spacing: 4) {
                Text(rec.condition)
                    .font(.subheadline.bold())
                    .lineLimit(1)
                HStack {
                    if let crop = rec.input.crop {
                        Text(AppConstants.cropLabel(for: crop))
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                    Text(rec.createdAt.prefix(10))
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }

            Spacer()

            confidenceBadge(rec.confidence)
        }
        .padding()
        .background(Color.appSecondaryBackground)
        .cornerRadius(12)
    }

    private func confidenceBadge(_ confidence: Double) -> some View {
        Text("\(Int(confidence * 100))%")
            .font(.caption.bold())
            .foregroundColor(confidence >= 0.7 ? .green : confidence >= 0.4 ? .orange : .red)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(
                (confidence >= 0.7 ? Color.green : confidence >= 0.4 ? Color.orange : Color.red)
                    .opacity(0.1)
            )
            .cornerRadius(8)
    }

    private var emptyState: some View {
        VStack(spacing: 12) {
            Image(systemName: "leaf")
                .font(.largeTitle)
                .foregroundColor(.secondary)
            Text("No recommendations yet")
                .font(.subheadline)
                .foregroundColor(.secondary)
            Text("Start a diagnosis to get your first recommendation!")
                .font(.caption)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 32)
    }

    private var recommendationSkeletonRow: some View {
        HStack(spacing: 12) {
            RoundedRectangle(cornerRadius: 8)
                .fill(Color.gray.opacity(0.2))
                .frame(width: 40, height: 40)
            VStack(alignment: .leading, spacing: 6) {
                RoundedRectangle(cornerRadius: 4)
                    .fill(Color.gray.opacity(0.2))
                    .frame(width: 150, height: 14)
                RoundedRectangle(cornerRadius: 4)
                    .fill(Color.gray.opacity(0.2))
                    .frame(width: 100, height: 10)
            }
            Spacer()
        }
        .padding()
        .background(Color.appSecondaryBackground)
        .cornerRadius(12)
    }
}
