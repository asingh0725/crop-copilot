//
//  RecommendationsListView.swift
//  CropCopilot
//

import SwiftUI

struct RecommendationsListView: View {
    @StateObject private var viewModel = RecommendationsViewModel()

    var body: some View {
        NavigationStack {
            VStack(spacing: 12) {
                if !Configuration.isRuntimeApiConfigured {
                    Text("Set API_RUNTIME_BASE_URL to keep iOS synced with AWS runtime.")
                        .font(.caption)
                        .foregroundStyle(.orange)
                        .padding(.horizontal)
                        .padding(.top, 6)
                }

                searchBar
                sortPicker

                if viewModel.isLoading && viewModel.recommendations.isEmpty {
                    loadingView
                } else if viewModel.recommendations.isEmpty {
                    emptyView
                } else {
                    recommendationsList
                }

                if let error = viewModel.errorMessage {
                    Text(error)
                        .font(.caption)
                        .foregroundStyle(.red)
                        .padding(.vertical, 8)
                }
            }
            .navigationTitle("Recommendations")
            .navigationDestination(for: String.self) { recommendationId in
                RecommendationDetailView(recommendationId: recommendationId)
            }
            .task {
                await viewModel.loadRecommendations(reset: true)
            }
        }
    }

    private var searchBar: some View {
        HStack {
            Image(systemName: "magnifyingglass")
                .foregroundStyle(.secondary)
            TextField("Search by crop or condition...", text: $viewModel.searchText)
                .textFieldStyle(.plain)
                .foregroundStyle(.primary)
                .onSubmit {
                    Task { await viewModel.loadRecommendations(reset: true) }
                }

            if !viewModel.searchText.isEmpty {
                Button {
                    viewModel.searchText = ""
                    Task { await viewModel.loadRecommendations(reset: true) }
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .antigravityGlass(cornerRadius: 14)
        .padding(.horizontal, 16)
        .padding(.top, 8)
    }

    private var sortPicker: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(RecommendationsViewModel.SortOption.allCases, id: \.self) { option in
                    Button {
                        viewModel.selectedSort = option
                        Task { await viewModel.loadRecommendations(reset: true) }
                    } label: {
                        Text(option.displayName)
                            .font(.caption.weight(.semibold))
                            .padding(.horizontal, 12)
                            .padding(.vertical, 8)
                            .background(
                                Capsule()
                                    .fill(
                                        viewModel.selectedSort == option
                                            ? Color.appPrimary.opacity(0.22)
                                            : Color.appSecondaryBackground
                                    )
                            )
                            .overlay(
                                Capsule()
                                    .strokeBorder(
                                        viewModel.selectedSort == option ? Color.appPrimary : Color.black.opacity(0.08),
                                        lineWidth: viewModel.selectedSort == option ? 1.0 : 0.8
                                    )
                            )
                            .foregroundStyle(Color.primary)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
        }
    }

    private var recommendationsList: some View {
        ScrollView {
            LazyVStack(spacing: 10) {
                ForEach(viewModel.recommendations) { recommendation in
                    NavigationLink(value: recommendation.id) {
                        RecommendationCard(recommendation: recommendation, style: .row)
                    }
                    .buttonStyle(.plain)
                }

                if viewModel.hasMorePages {
                    loadMoreButton
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 24)
        }
        .refreshable {
            await viewModel.loadRecommendations(reset: true)
        }
    }

    private var loadMoreButton: some View {
        Button {
            Task { await viewModel.loadNextPage() }
        } label: {
            HStack(spacing: 10) {
                if viewModel.isLoadingMore {
                    ProgressView()
                        .tint(Color.appPrimary)
                } else {
                    Image(systemName: "arrow.right.circle.fill")
                        .font(.system(size: 22))
                        .foregroundStyle(Color.appPrimary)
                    Text("Load More")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.primary)
                }
            }
            .frame(maxWidth: .infinity, alignment: .center)
            .padding(.vertical, 12)
            .antigravityGlass(cornerRadius: 14)
        }
        .buttonStyle(.plain)
    }

    private var loadingView: some View {
        VStack(spacing: 16) {
            Spacer()
            ProgressView("Loading recommendations...")
                .tint(Color.appPrimary)
                .foregroundStyle(.primary)
            Spacer()
        }
    }

    private var emptyView: some View {
        VStack(spacing: 14) {
            Spacer()
            Image(systemName: "doc.text.magnifyingglass")
                .font(.system(size: 50))
                .foregroundStyle(.secondary)
            Text("No recommendations yet")
                .font(.headline)
                .foregroundStyle(.primary)
            Text("Submit a photo or lab report to get started.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
            Spacer()
        }
    }
}
