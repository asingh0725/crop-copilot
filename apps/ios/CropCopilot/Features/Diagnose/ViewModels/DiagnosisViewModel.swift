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

    let cropOptions = AppConstants.cropLabels
    let growthStageOptions = AppConstants.growthStages

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
                let idempotencyKey: String
                let type: String
                let imageUrl: String
                let description: String?
                let crop: String?
                let location: String?
                let season: String?
            }

            let body = CreateInputBody(
                idempotencyKey: "ios-photo-\(UUID().uuidString)",
                type: "PHOTO",
                imageUrl: imageUrl,
                description: description.isEmpty ? nil : description,
                crop: selectedCrop.isEmpty ? nil : selectedCrop,
                location: location.isEmpty ? nil : location,
                season: growthStage.isEmpty ? nil : growthStage
            )

            let accepted: CreateInputAcceptedResponse = try await apiClient.request(
                .createInput,
                body: body
            )
            let job = try await apiClient.waitForRecommendation(jobId: accepted.jobId)
            resultRecommendationId = job.result?.recommendationId
            if resultRecommendationId == nil {
                throw NetworkError.unknown(
                    NSError(
                        domain: "RecommendationMissing",
                        code: -1,
                        userInfo: [NSLocalizedDescriptionKey: "Recommendation completed without an ID"]
                    )
                )
            }
            showResult = true
        } catch {
            errorMessage = error.localizedDescription
        }

        isSubmitting = false
    }
}
