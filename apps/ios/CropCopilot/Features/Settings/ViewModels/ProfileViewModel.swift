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

    let availableCrops = AppConstants.cropOptions

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
        defer { isLoading = false }

        do {
            let response: ProfileResponse = try await apiClient.request(.getProfile)
            let profile = response.profile

            location = profile.location ?? ""
            farmSize = profile.farmSize ?? ""
            if let crops = profile.cropsOfInterest {
                selectedCrops = Set(crops.map(AppConstants.cropValue))
            }
            if let level = profile.experienceLevel {
                experienceLevel = ExperienceLevel(rawValue: level)
            }
        } catch let error as NetworkError {
            if case .cancelled = error {
                return
            }
            if case .notFound = error {
                // No profile yet, that's fine
            } else {
                errorMessage = error.localizedDescription
            }
        } catch is CancellationError {
            return
        } catch {
            errorMessage = error.localizedDescription
        }

    }

    func saveProfile() async {
        isSaving = true
        errorMessage = nil
        successMessage = nil
        defer { isSaving = false }

        do {
            struct ProfileUpdate: Encodable {
                let location: String?
                let farmSize: String?
                let cropsOfInterest: [String]?
                let experienceLevel: String?
            }

            let update = ProfileUpdate(
                location: location.isEmpty ? nil : location,
                farmSize: farmSize.isEmpty ? nil : farmSize,
                cropsOfInterest: selectedCrops.isEmpty ? nil : Array(selectedCrops),
                experienceLevel: experienceLevel?.rawValue
            )

            let _: ProfileResponse = try await apiClient.request(.updateProfile, body: update)
            successMessage = "Profile saved successfully"
        } catch let error as NetworkError {
            if case .cancelled = error {
                return
            }
            errorMessage = error.localizedDescription
        } catch is CancellationError {
            return
        } catch {
            errorMessage = error.localizedDescription
        }

    }
}
