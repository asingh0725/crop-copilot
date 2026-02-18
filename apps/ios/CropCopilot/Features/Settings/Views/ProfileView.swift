//
//  ProfileView.swift
//  CropCopilot
//
//  Created by Claude Code on Phase 2
//

import SwiftUI

struct ProfileView: View {
    @StateObject private var viewModel = ProfileViewModel()

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
                            }
                        }

                        GlassSection(title: "Crops of Interest") {
                            TagGridSelector(
                                options: viewModel.availableCrops,
                                selectedTags: $viewModel.selectedCrops
                            )
                        }

                        GlassSection(title: "Experience Level") {
                            LabeledContent("Experience") {
                                Picker("Experience", selection: $viewModel.experienceLevel) {
                                    Text("Select...").tag(Optional<ExperienceLevel>.none)
                                    ForEach(ExperienceLevel.allCases, id: \.self) { level in
                                        Text(level.displayName).tag(Optional(level))
                                    }
                                }
                                .pickerStyle(.menu)
                                .tint(.primary)
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
