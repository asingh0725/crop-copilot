//
//  DiagnosisViewModel.swift
//  CropCopilot
//
//  Created by Claude Code on Phase 2
//

import UIKit

@MainActor
class DiagnosisViewModel: ObservableObject {
    @Published var selectedCrop = ""
    @Published var growthStage = ""
    @Published var location = ""
    @Published var description = ""
    @Published var isSubmitting = false
    @Published var submissionStatus = "Uploading..."
    @Published var errorMessage: String?
    @Published var showResult = false
    @Published var resultRecommendationId: String?

    let cropOptions = ["Corn", "Soybeans", "Wheat", "Cotton", "Rice", "Alfalfa", "Barley", "Sorghum", "Other"]

    private let apiClient = APIClient.shared
    private let cameraManager = CameraManager()

    func submitPhotoDiagnosis(image: UIImage) async {
        isSubmitting = true
        errorMessage = nil
        submissionStatus = "Uploading image..."

        do {
            // 1. Compress and upload image
            guard let imageData = cameraManager.compressImage(image) else {
                errorMessage = "Failed to compress image"
                isSubmitting = false
                return
            }

            let fileName = "diagnosis_\(UUID().uuidString).jpg"
            let imageUrl = try await apiClient.uploadImage(imageData: imageData, fileName: fileName)

            // 2. Submit input
            submissionStatus = "Analyzing..."

            struct CreateInputBody: Encodable {
                let type: String
                let imageUrl: String
                let description: String?
                let crop: String?
                let location: String?
                let season: String?
            }

            let body = CreateInputBody(
                type: "PHOTO",
                imageUrl: imageUrl,
                description: description.isEmpty ? nil : description,
                crop: selectedCrop.isEmpty ? nil : selectedCrop,
                location: location.isEmpty ? nil : location,
                season: growthStage.isEmpty ? nil : growthStage
            )

            let response: CreateInputResponse = try await apiClient.request(.createInput, body: body)
            resultRecommendationId = response.recommendationId
            showResult = true
        } catch {
            errorMessage = error.localizedDescription
        }

        isSubmitting = false
    }
}
