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
                TextField("Location (e.g. Iowa)", text: $viewModel.location)
                TextField("Farm Size (acres)", text: $viewModel.farmSize)
                    .keyboardType(.decimalPad)
            }

            Section("Crops of Interest") {
                ForEach(viewModel.availableCrops, id: \.self) { crop in
                    Button {
                        viewModel.toggleCrop(crop)
                    } label: {
                        HStack {
                            Text(crop)
                                .foregroundColor(.primary)
                            Spacer()
                            if viewModel.selectedCrops.contains(crop) {
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
                        .foregroundColor(.green)
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
