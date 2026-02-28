//
//  Colors.swift
//  CropCopilot
//

import SwiftUI
import UIKit

extension Color {

    // MARK: - Brand Core

    /// Lime green — matches web primary CTA (#76C043)
    static let appPrimary = Color(red: 0x76/255, green: 0xC0/255, blue: 0x43/255)
    /// Earth green — matches web earth-700 (#2C5F2D)
    static let appSecondary = Color(red: 0x2C/255, green: 0x5F/255, blue: 0x2D/255)
    /// Amber warm — matches web accent (#F5A623)
    static let appAccent = Color(red: 0xF5/255, green: 0xA6/255, blue: 0x23/255)
    static let appCanvas = Color(red: 0.976, green: 0.982, blue: 0.972)
    static let appBackground = Color(UIColor.systemBackground)
    static let appCardBackground = Color(UIColor.secondarySystemBackground)
    static let appSecondaryBackground = Color(UIColor.tertiarySystemBackground)

    // MARK: - Earth Gradient Palette (for hero sections — matching web earth-950/900/800)

    /// Deep forest — web earth-950
    static let appEarth950 = Color(red: 0.020, green: 0.039, blue: 0.027)
    /// Dark forest — web earth-900
    static let appEarth900 = Color(red: 0.030, green: 0.063, blue: 0.039)
    /// Forest — web earth-800
    static let appEarth800 = Color(red: 0.055, green: 0.118, blue: 0.071)

    // MARK: - Semantic

    static let semanticSuccess = Color(red: 0.11, green: 0.47, blue: 0.16)
    static let semanticWarning = Color(red: 0.80, green: 0.46, blue: 0.00)
    static let semanticError   = Color(red: 0.82, green: 0.18, blue: 0.18)
    static let semanticInfo    = Color(red: 0.15, green: 0.42, blue: 0.89)

    // MARK: - Product Type Colors

    static let typeColorFertilizer    = Color(red: 0.11, green: 0.47, blue: 0.16)  // forest green
    static let typeColorPesticide     = Color(red: 0.82, green: 0.18, blue: 0.18)  // red
    static let typeColorHerbicide     = Color(red: 0.45, green: 0.20, blue: 0.85)  // purple
    static let typeColorFungicide     = Color(red: 0.15, green: 0.42, blue: 0.89)  // blue
    static let typeColorAmendment     = Color(red: 0.80, green: 0.46, blue: 0.00)  // amber
    static let typeColorBiological    = Color(red: 0.12, green: 0.60, blue: 0.50)  // teal
    static let typeColorInsecticide   = Color(red: 0.72, green: 0.28, blue: 0.12)  // burnt orange
    static let typeColorSeedTreatment = Color(red: 0.48, green: 0.32, blue: 0.12)  // brown
}

// MARK: - Type Color Helper

extension Color {
    /// Returns the semantic color for a product type string (e.g. "FERTILIZER").
    static func forProductType(_ raw: String) -> Color {
        switch raw.uppercased() {
        case "FERTILIZER":     return .typeColorFertilizer
        case "PESTICIDE":      return .typeColorPesticide
        case "HERBICIDE":      return .typeColorHerbicide
        case "FUNGICIDE":      return .typeColorFungicide
        case "AMENDMENT":      return .typeColorAmendment
        case "BIOLOGICAL":     return .typeColorBiological
        case "INSECTICIDE":    return .typeColorInsecticide
        case "SEED_TREATMENT": return .typeColorSeedTreatment
        default:               return .appSecondary
        }
    }
}
