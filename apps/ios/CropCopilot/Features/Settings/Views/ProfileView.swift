//
//  ProfileView.swift
//  CropCopilot
//
//  Created by Claude Code on Phase 2
//

import SwiftUI

struct ProfileView: View {
    @StateObject private var viewModel = ProfileViewModel()
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        Form {
            Section("Farm Details") {
                Picker("Location", selection: $viewModel.location) {
                    Text("Select location...").tag("")
                    ForEach(AppConstants.allLocations, id: \.self) { loc in
                        Text(loc).tag(loc)
                    }
                }
                Picker("Farm Size", selection: $viewModel.farmSize) {
                    Text("Select size...").tag("")
                    ForEach(AppConstants.farmSizes, id: \.self) { size in
                        Text(AppConstants.farmSizeLabels[size] ?? size).tag(size)
                    }
                }
            }

            Section("Crops of Interest") {
                ForEach(viewModel.availableCrops, id: \.value) { crop in
                    Button {
                        viewModel.toggleCrop(crop.value)
                    } label: {
                        HStack {
                            Text(crop.label)
                                .foregroundColor(.primary)
                            Spacer()
                            if viewModel.selectedCrops.contains(crop.value) {
                                Image(systemName: "checkmark")
                                    .foregroundColor(.appPrimary)
                            }
                        }
                    }
                }
            }

            Section("Experience Level") {
                Picker("Experience", selection: $viewModel.experienceLevel) {
                    Text("Select...").tag(Optional<ExperienceLevel>.none)
                    ForEach(ExperienceLevel.allCases, id: \.self) { level in
                        Text(level.displayName).tag(Optional(level))
                    }
                }
            }

            Section {
                Button {
                    Task { await viewModel.saveProfile() }
                } label: {
                    if viewModel.isSaving {
                        ProgressView()
                            .frame(maxWidth: .infinity)
                    } else {
                        Text("Save Profile")
                            .frame(maxWidth: .infinity)
                    }
                }
                .disabled(viewModel.isSaving)
            }

            if let message = viewModel.successMessage {
                Section {
                    Text(message)
                        .foregroundColor(.appPrimary)
                        .font(.subheadline)
                }
            }

            if let error = viewModel.errorMessage {
                Section {
                    Text(error)
                        .foregroundColor(.red)
                        .font(.subheadline)
                }
            }
        }
        .navigationTitle("Profile")
        .task {
            await viewModel.loadProfile()
        }
    }
}
