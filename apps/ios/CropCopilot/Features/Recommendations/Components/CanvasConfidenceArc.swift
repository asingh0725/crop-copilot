//
//  CanvasConfidenceArc.swift
//  CropCopilot
//

import SwiftUI

enum ConfidenceLevel: String {
    case low
    case medium
    case high

    static func from(_ confidence: Double) -> ConfidenceLevel {
        if confidence < 0.6 { return .low }
        if confidence < 0.8 { return .medium }
        return .high
    }

    var title: String {
        switch self {
        case .low: return "Low Confidence"
        case .medium: return "Medium Confidence"
        case .high: return "High Confidence"
        }
    }

    var icon: String {
        switch self {
        case .low: return "questionmark.circle.fill"
        case .medium: return "exclamationmark.circle.fill"
        case .high: return "checkmark.circle.fill"
        }
    }

    var foreground: Color {
        switch self {
        case .low: return Color(red: 0.80, green: 0.46, blue: 0.00)
        case .medium: return Color(red: 0.15, green: 0.42, blue: 0.89)
        case .high: return Color(red: 0.11, green: 0.47, blue: 0.16)
        }
    }

    var background: Color {
        switch self {
        case .low: return Color(red: 1.0, green: 0.96, blue: 0.88)
        case .medium: return Color(red: 0.92, green: 0.96, blue: 1.0)
        case .high: return Color(red: 0.92, green: 0.98, blue: 0.92)
        }
    }
}

struct CanvasConfidenceArc: View {
    enum Style {
        case compact
        case detailed
    }

    let confidence: Double
    var style: Style = .compact

    private var clampedConfidence: Double {
        min(max(confidence, 0), 1)
    }

    private var level: ConfidenceLevel {
        ConfidenceLevel.from(clampedConfidence)
    }

    private var percentText: String {
        "\(Int((clampedConfidence * 100).rounded()))%"
    }

    var body: some View {
        switch style {
        case .compact:
            HStack(spacing: 6) {
                Image(systemName: level.icon)
                    .font(.caption)
                Text(percentText)
                    .font(.subheadline.weight(.semibold))
            }
            .foregroundStyle(level.foreground)
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(level.background)
            .clipShape(Capsule())
        case .detailed:
            HStack(spacing: 6) {
                Image(systemName: level.icon)
                    .font(.footnote)
                Text(percentText)
                    .font(.footnote.weight(.semibold))
                Text(level.title)
                    .font(.footnote.weight(.medium))
                    .lineLimit(1)
            }
            .foregroundStyle(level.foreground)
            .padding(.horizontal, 12)
            .padding(.vertical, 7)
            .background(level.background)
            .clipShape(Capsule())
        }
    }
}
