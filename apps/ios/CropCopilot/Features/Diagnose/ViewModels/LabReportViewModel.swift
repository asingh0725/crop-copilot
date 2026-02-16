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

    let cropOptions = ["Corn", "Soybeans", "Wheat", "Cotton", "Rice", "Alfalfa", "Barley", "Sorghum", "Other"]

    private let apiClient = APIClient.shared

    func submitLabReport() async {
        isSubmitting = true
        errorMessage = nil
        submissionStatus = "Submitting lab data..."

        // Build lab data dictionary
        var labData: [String: AnyCodable] = [:]

        if let val = Double(pH) { labData["pH"] = AnyCodable(val) }
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
        if let val = Double(cec) { labData["CEC"] = AnyCodable(val) }
        if let val = Double(baseSaturation) { labData["baseSaturation"] = AnyCodable(val) }
        if !soilTexture.isEmpty { labData["soilTexture"] = AnyCodable(soilTexture) }

        do {
            struct CreateLabInputBody: Encodable {
                let type: String
                let labData: [String: AnyCodable]
                let crop: String?
                let location: String?
                let season: String?
            }

            let body = CreateLabInputBody(
                type: "LAB_REPORT",
                labData: labData,
                crop: crop.isEmpty ? nil : crop,
                location: location.isEmpty ? nil : location,
                season: sampleDate.isEmpty ? nil : sampleDate
            )

            submissionStatus = "Analyzing..."
            let response: CreateInputResponse = try await apiClient.request(.createInput, body: body)
            resultRecommendationId = response.recommendationId
            showResult = true
        } catch {
            errorMessage = error.localizedDescription
        }

        isSubmitting = false
    }
}
