//
//  ProfileViewModel.swift
//  CropCopilot
//
//  Created by Claude Code on Phase 2
//

import Foundation

@MainActor
class ProfileViewModel: ObservableObject {
    @Published var location = ""
    @Published var farmSize = ""
    @Published var selectedCrops: Set<String> = []
    @Published var experienceLevel: ExperienceLevel?
    @Published var isSaving = false
    @Published var isLoading = false
    @Published var errorMessage: String?
    @Published var successMessage: String?

    let availableCrops = ["Corn", "Soybeans", "Wheat", "Cotton", "Rice", "Alfalfa", "Barley", "Sorghum"]

    private let apiClient = APIClient.shared

    func toggleCrop(_ crop: String) {
        if selectedCrops.contains(crop) {
            selectedCrops.remove(crop)
        } else {
            selectedCrops.insert(crop)
        }
    }

    func loadProfile() async {
        isLoading = true
        errorMessage = nil

        do {
            let response: ProfileResponse = try await apiClient.request(.getProfile)
            let profile = response.profile

            location = profile.location ?? ""
            if let size = profile.farmSize {
                farmSize = String(format: "%.0f", size)
            }
            if let crops = profile.cropsOfInterest {
                selectedCrops = Set(crops)
            }
            if let level = profile.experienceLevel {
                experienceLevel = ExperienceLevel(rawValue: level)
            }
        } catch let error as NetworkError {
            if case .notFound = error {
                // No profile yet, that's fine
            } else {
                errorMessage = error.localizedDescription
            }
        } catch {
            errorMessage = error.localizedDescription
        }

        isLoading = false
    }

    func saveProfile() async {
        isSaving = true
        errorMessage = nil
        successMessage = nil

        do {
            struct ProfileUpdate: Encodable {
                let location: String?
                let farmSize: Double?
                let cropsOfInterest: [String]?
                let experienceLevel: String?
            }

            let update = ProfileUpdate(
                location: location.isEmpty ? nil : location,
                farmSize: Double(farmSize),
                cropsOfInterest: selectedCrops.isEmpty ? nil : Array(selectedCrops),
                experienceLevel: experienceLevel?.rawValue
            )

            let _: ProfileResponse = try await apiClient.request(.updateProfile, body: update)
            successMessage = "Profile saved successfully"
        } catch {
            errorMessage = error.localizedDescription
        }

        isSaving = false
    }
}
