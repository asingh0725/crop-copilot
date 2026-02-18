//
//  RecommendationCard.swift
//  CropCopilot
//

import SwiftUI

struct RecommendationCard: View {
    enum LayoutStyle {
        case compact
        case row
    }

    let recommendation: RecommendationSummary
    var style: LayoutStyle = .row

    private var timestampLabel: String {
        guard let parsed = DateParsing.iso8601(recommendation.createdAt) else {
            return recommendation.createdAt
        }

        return parsed.formatted(date: .abbreviated, time: .shortened)
    }

    var body: some View {
        Group {
            switch style {
            case .compact:
                compactBody
            case .row:
                rowBody
            }
        }
    }

    private var rowBody: some View {
        HStack(spacing: 12) {
            RecommendationThumbnail(source: recommendation.input.imageUrl, size: 68)

            VStack(alignment: .leading, spacing: 6) {
                Text(AppConstants.cropLabel(for: recommendation.input.crop ?? "Unknown"))
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .textCase(.uppercase)

                Text(recommendation.condition)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(.primary)
                    .lineLimit(2)

                Text(timestampLabel)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }

            Spacer(minLength: 8)

            VStack(alignment: .trailing, spacing: 10) {
                CanvasConfidenceArc(confidence: recommendation.confidence, style: .compact)
                Image(systemName: "chevron.right")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(.secondary)
                    .frame(width: 22, height: 22)
                    .background(Color.appSecondaryBackground)
                    .clipShape(Circle())
            }
        }
        .padding(14)
        .antigravityGlass(cornerRadius: 16)
        .contentShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    private var compactBody: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top, spacing: 8) {
                RecommendationThumbnail(source: recommendation.input.imageUrl, size: 56)

                Spacer(minLength: 6)

                CanvasConfidenceArc(confidence: recommendation.confidence, style: .compact)
            }

            VStack(alignment: .leading, spacing: 6) {
                Text(AppConstants.cropLabel(for: recommendation.input.crop ?? "Unknown"))
                    .font(.custom("Times New Roman", size: 11).weight(.semibold))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .textCase(.uppercase)

                Text(recommendation.condition)
                    .font(.custom("Inter", size: 12).weight(.semibold))
                    .foregroundStyle(.primary)
                    .lineLimit(2)

                Text(timestampLabel)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
        }
        .padding(12)
        .antigravityGlass(cornerRadius: 18)
    }
}

private struct RecommendationThumbnail: View {
    let source: String?
    let size: CGFloat

    var body: some View {
        ZStack {
            SecureAsyncImage(source: source) { image in
                image
                    .resizable()
                    .scaledToFill()
            } placeholder: {
                ProgressView()
                    .tint(Color.appPrimary)
            } failure: {
                fallback
            }
        }
        .frame(width: size, height: size)
        .background(Color.appBackground)
        .clipped()
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .stroke(.black.opacity(0.10), lineWidth: 0.8)
        )
    }

    private var fallback: some View {
        ZStack {
            Color.appBackground
            Image(systemName: "photo")
                .font(.title3)
                .foregroundStyle(.secondary)
        }
    }
}

private enum DateParsing {
    static func iso8601(_ value: String) -> Date? {
        let withFractional = ISO8601DateFormatter()
        withFractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let parsed = withFractional.date(from: value) {
            return parsed
        }

        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.date(from: value)
    }
}
