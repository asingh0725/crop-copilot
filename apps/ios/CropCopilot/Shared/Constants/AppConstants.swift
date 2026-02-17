//
//  AppConstants.swift
//  CropCopilot
//
//  Shared constants matching the web app's options.
//

import Foundation

enum AppConstants {

    // MARK: - Crops (matching web lib/constants/profile.ts)

    struct CropOption: Identifiable {
        let value: String
        let label: String
        let category: String
        var id: String { value }
    }

    static let cropOptions: [CropOption] = [
        // Grains
        CropOption(value: "wheat", label: "Wheat", category: "Grains"),
        CropOption(value: "corn", label: "Corn", category: "Grains"),
        CropOption(value: "rice", label: "Rice", category: "Grains"),
        CropOption(value: "barley", label: "Barley", category: "Grains"),
        CropOption(value: "oats", label: "Oats", category: "Grains"),
        CropOption(value: "sorghum", label: "Sorghum", category: "Grains"),
        // Vegetables
        CropOption(value: "tomatoes", label: "Tomatoes", category: "Vegetables"),
        CropOption(value: "potatoes", label: "Potatoes", category: "Vegetables"),
        CropOption(value: "peppers", label: "Peppers", category: "Vegetables"),
        CropOption(value: "onions", label: "Onions", category: "Vegetables"),
        CropOption(value: "carrots", label: "Carrots", category: "Vegetables"),
        CropOption(value: "cabbage", label: "Cabbage", category: "Vegetables"),
        CropOption(value: "broccoli", label: "Broccoli", category: "Vegetables"),
        CropOption(value: "cauliflower", label: "Cauliflower", category: "Vegetables"),
        CropOption(value: "squash", label: "Squash", category: "Vegetables"),
        CropOption(value: "lettuce", label: "Lettuce", category: "Vegetables"),
        // Fruits
        CropOption(value: "apples", label: "Apples", category: "Fruits"),
        CropOption(value: "grapes", label: "Grapes", category: "Fruits"),
        CropOption(value: "strawberries", label: "Strawberries", category: "Fruits"),
        CropOption(value: "blueberries", label: "Blueberries", category: "Fruits"),
        CropOption(value: "peaches", label: "Peaches", category: "Fruits"),
        CropOption(value: "cherries", label: "Cherries", category: "Fruits"),
        // Legumes
        CropOption(value: "soybeans", label: "Soybeans", category: "Legumes"),
        CropOption(value: "peanuts", label: "Peanuts", category: "Legumes"),
        CropOption(value: "peas", label: "Peas", category: "Legumes"),
        CropOption(value: "beans", label: "Beans", category: "Legumes"),
        CropOption(value: "lentils", label: "Lentils", category: "Legumes"),
        // Other
        CropOption(value: "cotton", label: "Cotton", category: "Other"),
        CropOption(value: "canola", label: "Canola", category: "Other"),
        CropOption(value: "alfalfa", label: "Alfalfa", category: "Other"),
        CropOption(value: "sugar beets", label: "Sugar Beets", category: "Other"),
    ]

    // MARK: - Canonical crop helpers (align iOS payloads with web values)
    static func cropValue(from valueOrLabel: String) -> String {
        let trimmed = valueOrLabel.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return "" }

        if let exactValue = cropOptions.first(where: {
            $0.value.caseInsensitiveCompare(trimmed) == .orderedSame
        }) {
            return exactValue.value
        }

        if let byLabel = cropOptions.first(where: {
            $0.label.caseInsensitiveCompare(trimmed) == .orderedSame
        }) {
            return byLabel.value
        }

        return trimmed.lowercased()
    }

    static func cropLabel(for valueOrLabel: String) -> String {
        let trimmed = valueOrLabel.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return trimmed }

        if let exactValue = cropOptions.first(where: {
            $0.value.caseInsensitiveCompare(trimmed) == .orderedSame
        }) {
            return exactValue.label
        }

        if let byLabel = cropOptions.first(where: {
            $0.label.caseInsensitiveCompare(trimmed) == .orderedSame
        }) {
            return byLabel.label
        }

        return trimmed
    }

    static var cropCategories: [String] { Array(Set(cropOptions.map(\.category))).sorted() }

    static func crops(in category: String) -> [CropOption] {
        cropOptions.filter { $0.category == category }
    }

    /// Flat list of crop labels for simple pickers
    static let cropLabels: [String] = cropOptions.map(\.label)

    // MARK: - Growth Stages (matching web lib/validations/diagnose.ts)
    static let growthStages = [
        "Seedling",
        "Vegetative",
        "Flowering",
        "Fruiting",
        "Mature",
        "Harvest",
    ]

    // MARK: - Locations (matching web lib/constants/profile.ts)
    static let usStates = [
        "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut",
        "Delaware", "Florida", "Georgia", "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa",
        "Kansas", "Kentucky", "Louisiana", "Maine", "Maryland", "Massachusetts", "Michigan",
        "Minnesota", "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire",
        "New Jersey", "New Mexico", "New York", "North Carolina", "North Dakota", "Ohio",
        "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island", "South Carolina", "South Dakota",
        "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington", "West Virginia",
        "Wisconsin", "Wyoming",
    ]

    static let caProvinces = [
        "Alberta", "British Columbia", "Manitoba", "New Brunswick",
        "Newfoundland and Labrador", "Northwest Territories", "Nova Scotia",
        "Nunavut", "Ontario", "Prince Edward Island", "Quebec", "Saskatchewan", "Yukon",
    ]

    static let allLocations: [String] = usStates + caProvinces

    static func locationCountryCode(for location: String) -> String? {
        if usStates.contains(location) { return "US" }
        if caProvinces.contains(location) { return "CA" }
        return nil
    }

    static func locationWithCountry(_ location: String) -> String {
        let trimmed = location.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return "" }
        if let country = locationCountryCode(for: trimmed) {
            return "\(trimmed), \(country)"
        }
        return trimmed
    }

    // MARK: - Farm Sizes (matching web lib/constants/profile.ts)
    static let farmSizes = [
        "hobby",
        "small",
        "medium",
        "large",
        "commercial",
    ]

    static let farmSizeLabels: [String: String] = [
        "hobby": "Hobby (< 1 acre)",
        "small": "Small (1-10 acres)",
        "medium": "Medium (10-100 acres)",
        "large": "Large (100-1000 acres)",
        "commercial": "Commercial (> 1000 acres)",
    ]
}
