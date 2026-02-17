//
//  RecommendationsListView.swift
//  CropCopilot
//
//  Created by Claude Code on Phase 2
//

import SwiftUI

struct RecommendationsListView: View {
    @StateObject private var viewModel = RecommendationsViewModel()

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                if !Configuration.isRuntimeApiConfigured {
                    Text("AWS runtime API is not configured on iOS. Set API_RUNTIME_BASE_URL to keep history/profile in sync with web.")
                        .font(.caption)
                        .foregroundColor(.orange)
                        .padding(.horizontal)
                        .padding(.top, 6)
                }

                // Search bar
                searchBar

                // Sort picker
                sortPicker

                // Content
                if viewModel.isLoading && viewModel.recommendations.isEmpty {
                    loadingView
                } else if viewModel.recommendations.isEmpty {
                    emptyView
                } else {
                    listContent
                }

                if let error = viewModel.errorMessage {
                    Text(error)
                        .font(.caption)
                        .foregroundColor(.red)
                        .padding()
                }
            }
            .navigationTitle("History")
            .onAppear {
                Task { await viewModel.loadRecommendations(reset: true) }
            }
        }
    }

    // MARK: - Search
    private var searchBar: some View {
        HStack {
            Image(systemName: "magnifyingglass")
                .foregroundColor(.secondary)
            TextField("Search by crop or condition...", text: $viewModel.searchText)
                .textFieldStyle(.plain)
                .onSubmit {
                    Task { await viewModel.loadRecommendations(reset: true) }
                }
            if !viewModel.searchText.isEmpty {
                Button {
                    viewModel.searchText = ""
                    Task { await viewModel.loadRecommendations(reset: true) }
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundColor(.secondary)
                }
            }
        }
        .padding(10)
        .background(Color.appSecondaryBackground)
        .cornerRadius(10)
        .padding(.horizontal)
        .padding(.top, 8)
    }

    // MARK: - Sort
    private var sortPicker: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(RecommendationsViewModel.SortOption.allCases, id: \.self) { option in
                    Button {
                        viewModel.selectedSort = option
                        Task { await viewModel.loadRecommendations(reset: true) }
                    } label: {
                        Text(option.displayName)
                            .font(.caption)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 6)
                            .background(viewModel.selectedSort == option ? Color.appPrimary : Color.appSecondaryBackground)
                            .foregroundColor(viewModel.selectedSort == option ? .white : .primary)
                            .cornerRadius(16)
                    }
                }
            }
            .padding(.horizontal)
            .padding(.vertical, 8)
        }
    }

    // MARK: - List
    private var listContent: some View {
        List {
            ForEach(viewModel.recommendations) { rec in
                NavigationLink {
                    RecommendationDetailView(recommendationId: rec.id)
                } label: {
                    recommendationRow(rec)
                }
            }
            .onDelete { indexSet in
                Task { await viewModel.deleteRecommendations(at: indexSet) }
            }

            // Load more
            if viewModel.hasMorePages {
                HStack {
                    Spacer()
                    if viewModel.isLoadingMore {
                        ProgressView()
                    } else {
                        Button("Load More") {
                            Task { await viewModel.loadNextPage() }
                        }
                    }
                    Spacer()
                }
                .listRowSeparator(.hidden)
            }
        }
        .listStyle(.plain)
        .refreshable {
            await viewModel.loadRecommendations(reset: true)
        }
    }

    private func recommendationRow(_ rec: RecommendationSummary) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(rec.condition)
                    .font(.subheadline.bold())
                    .lineLimit(1)
                Spacer()
                Text("\(Int(rec.confidence * 100))%")
                    .font(.caption.bold())
                    .foregroundColor(rec.confidence >= 0.7 ? .green : .orange)
            }
            HStack {
                if let crop = rec.input.crop {
                    Label(AppConstants.cropLabel(for: crop), systemImage: "leaf")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
                Spacer()
                Text(rec.createdAt.prefix(10))
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
            if let action = rec.firstAction {
                Text(action)
                    .font(.caption)
                    .foregroundColor(.appPrimary)
                    .lineLimit(1)
            }
        }
        .padding(.vertical, 4)
    }

    // MARK: - States
    private var loadingView: some View {
        VStack {
            Spacer()
            ProgressView("Loading recommendations...")
            Spacer()
        }
    }

    private var emptyView: some View {
        VStack(spacing: 16) {
            Spacer()
            Image(systemName: "doc.text.magnifyingglass")
                .font(.system(size: 50))
                .foregroundColor(.secondary)
            Text("No recommendations yet")
                .font(.headline)
            Text("Submit a photo or lab report to get started.")
                .font(.subheadline)
                .foregroundColor(.secondary)
            Spacer()
        }
    }
}
