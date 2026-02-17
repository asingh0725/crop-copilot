//
//  LabReportViewModel.swift
//  CropCopilot
//
//  Created by Claude Code on Phase 2
//

import Foundation

@MainActor
class LabReportViewModel: ObservableObject {
    // Basic info
    @Published var crop = ""
    @Published var location = ""
    @Published var sampleDate = ""

    // pH & OM
    @Published var pH = ""
    @Published var organicMatter = ""

    // Primary Nutrients
    @Published var nitrogen = ""
    @Published var phosphorus = ""
    @Published var potassium = ""

    // Secondary Nutrients
    @Published var calcium = ""
    @Published var magnesium = ""
    @Published var sulfur = ""

    // Micronutrients
    @Published var iron = ""
    @Published var manganese = ""
    @Published var zinc = ""
    @Published var copper = ""
    @Published var boron = ""

    // Soil Properties
    @Published var cec = ""
    @Published var baseSaturation = ""
    @Published var soilTexture = ""

    // State
    @Published var isSubmitting = false
    @Published var submissionStatus = "Submitting..."
    @Published var errorMessage: String?
    @Published var showResult = false
    @Published var resultRecommendationId: String?

    let cropOptions = AppConstants.cropOptions

    private let apiClient = APIClient.shared

    func submitLabReport() async {
        isSubmitting = true
        errorMessage = nil
        submissionStatus = "Submitting lab data..."
        defer { isSubmitting = false }

        // Build lab data dictionary
        var labData: [String: AnyCodable] = [:]

        if let val = Double(pH) { labData["ph"] = AnyCodable(val) }
        if let val = Double(organicMatter) { labData["organicMatter"] = AnyCodable(val) }
        if let val = Double(nitrogen) { labData["nitrogen"] = AnyCodable(val) }
        if let val = Double(phosphorus) { labData["phosphorus"] = AnyCodable(val) }
        if let val = Double(potassium) { labData["potassium"] = AnyCodable(val) }
        if let val = Double(calcium) { labData["calcium"] = AnyCodable(val) }
        if let val = Double(magnesium) { labData["magnesium"] = AnyCodable(val) }
        if let val = Double(sulfur) { labData["sulfur"] = AnyCodable(val) }
        if let val = Double(iron) { labData["iron"] = AnyCodable(val) }
        if let val = Double(manganese) { labData["manganese"] = AnyCodable(val) }
        if let val = Double(zinc) { labData["zinc"] = AnyCodable(val) }
        if let val = Double(copper) { labData["copper"] = AnyCodable(val) }
        if let val = Double(boron) { labData["boron"] = AnyCodable(val) }
        if let val = Double(cec) { labData["cec"] = AnyCodable(val) }
        if let val = Double(baseSaturation) { labData["baseSaturation"] = AnyCodable(val) }
        if !soilTexture.isEmpty { labData["soilTexture"] = AnyCodable(soilTexture) }

        do {
            struct CreateLabInputBody: Encodable {
                let idempotencyKey: String
                let type: String
                let labData: [String: AnyCodable]
                let crop: String?
                let location: String?
                let season: String?
            }

            let body = CreateLabInputBody(
                idempotencyKey: "ios-lab-\(UUID().uuidString)",
                type: "LAB_REPORT",
                labData: labData,
                crop: crop.isEmpty ? nil : AppConstants.cropValue(from: crop),
                location: location.isEmpty ? nil : AppConstants.locationWithCountry(location),
                season: sampleDate.isEmpty ? nil : sampleDate
            )

            submissionStatus = "Analyzing..."
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
