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
    @Published var fieldAcreage = ""
    @Published var plannedApplicationDate = ""
    @Published var fieldLatitude = ""
    @Published var fieldLongitude = ""

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

    private func parsePlanningInputs() -> (
        fieldAcreage: Double?,
        plannedApplicationDate: String?,
        fieldLatitude: Double?,
        fieldLongitude: Double?
    )? {
        let acreageText = fieldAcreage.trimmingCharacters(in: .whitespacesAndNewlines)
        let latitudeText = fieldLatitude.trimmingCharacters(in: .whitespacesAndNewlines)
        let longitudeText = fieldLongitude.trimmingCharacters(in: .whitespacesAndNewlines)
        let plannedDateText = plannedApplicationDate.trimmingCharacters(in: .whitespacesAndNewlines)

        var parsedAcreage: Double?
        if !acreageText.isEmpty {
            guard let value = Double(acreageText) else {
                errorMessage = "Field acreage must be a valid number."
                return nil
            }
            guard value > 0, value <= 100_000 else {
                errorMessage = "Field acreage must be greater than 0 and at most 100000."
                return nil
            }
            parsedAcreage = value
        }

        var parsedLatitude: Double?
        if !latitudeText.isEmpty {
            guard let value = Double(latitudeText) else {
                errorMessage = "Latitude must be a valid number."
                return nil
            }
            guard value >= -90, value <= 90 else {
                errorMessage = "Latitude must be between -90 and 90."
                return nil
            }
            parsedLatitude = value
        }

        var parsedLongitude: Double?
        if !longitudeText.isEmpty {
            guard let value = Double(longitudeText) else {
                errorMessage = "Longitude must be a valid number."
                return nil
            }
            guard value >= -180, value <= 180 else {
                errorMessage = "Longitude must be between -180 and 180."
                return nil
            }
            parsedLongitude = value
        }

        if !plannedDateText.isEmpty && !Self.isValidIsoDate(plannedDateText) {
            errorMessage = "Planned application date must use YYYY-MM-DD."
            return nil
        }

        return (
            fieldAcreage: parsedAcreage,
            plannedApplicationDate: plannedDateText.isEmpty ? nil : plannedDateText,
            fieldLatitude: parsedLatitude,
            fieldLongitude: parsedLongitude
        )
    }

    private static func isValidIsoDate(_ value: String) -> Bool {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.isLenient = false

        guard let parsed = formatter.date(from: value) else {
            return false
        }

        return formatter.string(from: parsed) == value
    }

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
            guard let planningInputs = parsePlanningInputs() else {
                return
            }

            struct CreateLabInputBody: Encodable {
                let idempotencyKey: String
                let type: String
                let labData: [String: AnyCodable]
                let crop: String?
                let location: String?
                let season: String?
                let fieldAcreage: Double?
                let plannedApplicationDate: String?
                let fieldLatitude: Double?
                let fieldLongitude: Double?
            }

            let body = CreateLabInputBody(
                idempotencyKey: "ios-lab-\(UUID().uuidString)",
                type: "LAB_REPORT",
                labData: labData,
                crop: crop.isEmpty ? nil : AppConstants.cropValue(from: crop),
                location: location.isEmpty ? nil : AppConstants.locationWithCountry(location),
                season: sampleDate.isEmpty ? nil : sampleDate,
                fieldAcreage: planningInputs.fieldAcreage,
                plannedApplicationDate: planningInputs.plannedApplicationDate,
                fieldLatitude: planningInputs.fieldLatitude,
                fieldLongitude: planningInputs.fieldLongitude
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
            CreditsEvents.postRefresh(.recommendationGenerated)
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
