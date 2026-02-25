//
//  ProfileView.swift
//  CropCopilot
//
//  Created by Claude Code on Phase 2
//

import SwiftUI

struct ProfileView: View {
    @StateObject private var viewModel = ProfileViewModel()
    @State private var isCropsExpanded = false

    var body: some View {
        Group {
            if viewModel.isLoading && !viewModel.hasLoadedProfile {
                VStack {
                    Spacer()
                    ProgressView("Loading profile...")
                        .tint(.appPrimary)
                    Spacer()
                }
            } else {
                ScrollView {
                    VStack(spacing: 24) {
                        GlassSection(title: "Farm Details") {
                            VStack(spacing: 16) {
                                LabeledContent("Location") {
                                    Picker("Location", selection: $viewModel.location) {
                                        Text("Select location...").tag("")
                                        ForEach(AppConstants.allLocations, id: \.self) { loc in
                                            Text(loc).tag(loc)
                                        }
                                    }
                                    .pickerStyle(.menu)
                                    .tint(.primary)
                                }

                                Divider().background(.separator)

                                LabeledContent("Farm Size") {
                                    Picker("Farm Size", selection: $viewModel.farmSize) {
                                        Text("Select size...").tag("")
                                        ForEach(AppConstants.farmSizes, id: \.self) { size in
                                            Text(AppConstants.farmSizeLabels[size] ?? size).tag(size)
                                        }
                                    }
                                    .pickerStyle(.menu)
                                    .tint(.primary)
                                }

                                Divider().background(.separator)

                                LabeledContent("Expertise Level") {
                                    Picker("Expertise Level", selection: $viewModel.experienceLevel) {
                                        Text("Select level...").tag(Optional<ExperienceLevel>.none)
                                        ForEach(ExperienceLevel.allCases, id: \.self) { level in
                                            Text(level.displayName).tag(Optional(level))
                                        }
                                    }
                                    .pickerStyle(.menu)
                                    .tint(.primary)
                                }
                            }
                        }

                        // Collapsible Crops of Interest
                        VStack(alignment: .leading, spacing: 12) {
                            Button {
                                isCropsExpanded.toggle()
                            } label: {
                                HStack(spacing: 10) {
                                    Text("Crops of Interest")
                                        .font(.headline)
                                        .foregroundStyle(.primary)

                                    if !isCropsExpanded && !viewModel.selectedCrops.isEmpty {
                                        Text("\(viewModel.selectedCrops.count) selected")
                                            .font(.caption.weight(.semibold))
                                            .foregroundStyle(Color.appPrimary)
                                            .padding(.horizontal, 8)
                                            .padding(.vertical, 3)
                                            .background(Color.appPrimary.opacity(0.12))
                                            .clipShape(Capsule())
                                    }

                                    Spacer()

                                    Image(systemName: isCropsExpanded ? "chevron.up" : "chevron.down")
                                        .font(.caption.weight(.semibold))
                                        .foregroundStyle(.secondary)
                                }
                                .padding(.leading, 4)
                            }
                            .buttonStyle(.plain)

                            if isCropsExpanded {
                                VStack {
                                    TagGridSelector(
                                        options: viewModel.availableCrops,
                                        selectedTags: $viewModel.selectedCrops
                                    )
                                }
                                .padding()
                                .antigravityGlass(cornerRadius: 16)
                                // No transition — instant open/close per user preference
                            }
                        }

                        Button {
                            Task { await viewModel.saveProfile() }
                        } label: {
                            if viewModel.isSaving {
                                ProgressView()
                                    .tint(.black)
                                    .frame(maxWidth: .infinity)
                            } else {
                                Text("Save Profile")
                                    .font(.headline)
                                    .foregroundColor(.black)
                                    .frame(maxWidth: .infinity)
                            }
                        }
                        .buttonStyle(GlowSkeuomorphicButtonStyle())
                        .disabled(viewModel.isSaving)

                        if let message = viewModel.successMessage {
                            Text(message)
                                .foregroundColor(.appPrimary)
                                .font(.subheadline)
                        }

                        if let error = viewModel.errorMessage {
                            Text(error)
                                .foregroundColor(.red)
                                .font(.subheadline)
                        }
                        
                        Spacer().frame(height: 100)
                    }
                    .padding()
                }
            }
        }
        .navigationTitle("Profile")
        .task {
            await viewModel.loadProfile()
        }
    }
}

// MARK: - Glass Section Helper
struct GlassSection<Content: View>: View {
    let title: String
    let content: Content
    
    init(title: String, @ViewBuilder content: () -> Content) {
        self.title = title
        self.content = content()
    }
    
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(title)
                .font(.headline)
                .foregroundColor(.primary)
                .padding(.leading, 4)

            VStack {
                content
            }
            .padding()
            .antigravityGlass(cornerRadius: 16)
        }
    }
}
