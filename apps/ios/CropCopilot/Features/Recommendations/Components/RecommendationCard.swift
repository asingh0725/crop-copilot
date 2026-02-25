//
//  RecommendationCard.swift
//  CropCopilot
//

import SwiftUI

struct RecommendationCard: View {
    enum LayoutStyle {
        case compact
        case row
        case grid
    }

    let recommendation: RecommendationSummary
    var style: LayoutStyle = .row

    private var timestampLabel: String {
        guard let parsed = DateParsing.iso8601(recommendation.createdAt) else {
            return recommendation.createdAt
        }
        return parsed.formatted(date: .abbreviated, time: .shortened)
    }

    private var level: ConfidenceLevel {
        ConfidenceLevel.from(recommendation.confidence)
    }

    private var hasPhoto: Bool {
        guard let url = recommendation.input.imageUrl else { return false }
        return !url.isEmpty
    }

    var body: some View {
        Group {
            switch style {
            case .compact:
                compactBody
            case .row:
                rowBody
            case .grid:
                gridBody
            }
        }
    }

    // MARK: - Row Style

    private var rowBody: some View {
        HStack(spacing: 0) {
            // Confidence accent bar — colored by confidence level
            RoundedRectangle(cornerRadius: 2, style: .continuous)
                .fill(level.foreground)
                .frame(width: 4)
                .padding(.vertical, Spacing.xs)
                .padding(.leading, Spacing.xs)

            HStack(spacing: Spacing.md) {
                RecommendationThumbnail(source: recommendation.input.imageUrl, size: 68)

                VStack(alignment: .leading, spacing: 6) {
                    Text(AppConstants.cropLabel(for: recommendation.input.crop ?? "Unknown"))
                        .font(.system(size: 11, weight: .semibold))
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

                Spacer(minLength: Spacing.sm)

                VStack(alignment: .trailing, spacing: Spacing.sm) {
                    CanvasConfidenceArc(confidence: recommendation.confidence, style: .compact)
                    Image(systemName: "chevron.right")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(.secondary)
                        .frame(width: 22, height: 22)
                        .background(Color.appSecondaryBackground)
                        .clipShape(Circle())
                }
            }
            .padding(Spacing.md)
        }
        .antigravityGlass(cornerRadius: CornerRadius.lg)
        .contentShape(RoundedRectangle(cornerRadius: CornerRadius.lg, style: .continuous))
    }

    // MARK: - Compact Style

    private var compactBody: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            HStack(alignment: .top, spacing: Spacing.sm) {
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
        .padding(Spacing.md)
        .antigravityGlass(cornerRadius: CornerRadius.xl)
    }

    // MARK: - Grid Style (image-first, full-bleed with gradient overlay)

    private var gridBody: some View {
        // GeometryReader is greedy — it always fills the exact frame proposed by its parent
        // (which is `.frame(width: w, height: h)` on the NavigationLink in the grid).
        // This lets us explicitly size `backgroundLayer` to those exact pixel dimensions,
        // so a scaledToFill() image can never push the ZStack larger than its cell.
        GeometryReader { proxy in
            let w = proxy.size.width
            let h = proxy.size.height

            ZStack(alignment: .bottomLeading) {
                // Explicitly frame the background so scaledToFill() is bounded
                backgroundLayer
                    .frame(width: w, height: h)
                    .clipped()

                // Gradient overlay — darkens from mid to bottom for legibility
                LinearGradient(
                    stops: [
                        .init(color: .clear, location: 0.0),
                        .init(color: .black.opacity(0.30), location: 0.40),
                        .init(color: .black.opacity(0.82), location: 1.0),
                    ],
                    startPoint: .top,
                    endPoint: .bottom
                )

                // Bottom text content — positioned at bottomLeading by ZStack alignment
                VStack(alignment: .leading, spacing: 5) {
                    Text(AppConstants.cropLabel(for: recommendation.input.crop ?? "Unknown"))
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundStyle(.white.opacity(0.72))
                        .textCase(.uppercase)
                        .lineLimit(1)

                    Text(recommendation.condition)
                        .font(.system(size: 13, weight: .bold))
                        .foregroundStyle(.white)
                        .lineLimit(2)
                        .lineSpacing(2)

                    Text(timestampLabel)
                        .font(.caption2)
                        .foregroundStyle(.white.opacity(0.60))
                        .lineLimit(1)
                }
                .padding(Spacing.md)
            }
            .clipShape(RoundedRectangle(cornerRadius: CornerRadius.lg, style: .continuous))
            // Confidence pill badge pinned to top-right
            .overlay(alignment: .topTrailing) {
                gridConfidenceBadge
                    .padding(Spacing.sm)
            }
            // Subtle top shimmer line tinted to confidence level
            .overlay(alignment: .top) {
                LinearGradient(
                    colors: [.clear, level.foreground.opacity(0.55), .clear],
                    startPoint: .leading,
                    endPoint: .trailing
                )
                .frame(height: 1.5)
                .padding(.horizontal, CornerRadius.lg)
            }
            .overlay(
                RoundedRectangle(cornerRadius: CornerRadius.lg, style: .continuous)
                    .stroke(.white.opacity(0.12), lineWidth: 0.8)
            )
            // No drop shadows — radius 12 + y:6 bleeds 18pt into the next row's cell
            // at Spacing.sm (8pt) row gap, making cards LOOK like they physically overlap.
        }
        .contentShape(RoundedRectangle(cornerRadius: CornerRadius.lg, style: .continuous))
    }

    /// Confidence pill with always-white text — readable over any photo.
    private var gridConfidenceBadge: some View {
        let pct = Int((min(max(recommendation.confidence, 0), 1) * 100).rounded())
        return Text("\(pct)%")
            .font(.system(size: 12, weight: .bold))
            .foregroundStyle(.white)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(level.foreground.opacity(0.82), in: Capsule())
            .overlay(Capsule().stroke(.white.opacity(0.20), lineWidth: 0.8))
    }

    /// Background layer: crop photo if available, otherwise lab-themed gradient with icon.
    @ViewBuilder
    private var backgroundLayer: some View {
        if hasPhoto {
            SecureAsyncImage(source: recommendation.input.imageUrl) { image in
                image
                    .resizable()
                    .scaledToFill()
            } placeholder: {
                // Shimmer while the photo loads — NOT the lab fallback
                Color.appEarth900.shimmer()
            } failure: {
                // Only show lab fallback when the image actually fails
                labFallbackBackground
            }
        } else {
            labFallbackBackground
        }
    }

    /// Earth-gradient background with a flask icon — shown for lab-report inputs.
    private var labFallbackBackground: some View {
        ZStack {
            LinearGradient(
                stops: [
                    .init(color: Color.appEarth800, location: 0),
                    .init(color: Color.appEarth950, location: 1),
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            VStack(spacing: 6) {
                Image(systemName: "flask.fill")
                    .font(.system(size: 26))
                    .foregroundStyle(Color.appPrimary.opacity(0.70))
                Text("Lab Report")
                    .font(.system(size: 9, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.40))
                    .textCase(.uppercase)
            }
        }
    }
}

// MARK: - Thumbnail

private struct RecommendationThumbnail: View {
    let source: String?
    let size: CGFloat

    private var isLabReport: Bool { source == nil || source?.isEmpty == true }

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
            if isLabReport {
                // Lab report — no photo by design
                LinearGradient(
                    stops: [
                        .init(color: Color.appEarth800, location: 0),
                        .init(color: Color.appEarth950, location: 1),
                    ],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
                Image(systemName: "flask.fill")
                    .font(.system(size: size * 0.30))
                    .foregroundStyle(Color.appPrimary.opacity(0.75))
            } else {
                // Photo failed to load
                Color.appSecondaryBackground
                Image(systemName: "photo")
                    .font(.title3)
                    .foregroundStyle(.secondary)
            }
        }
    }
}

// MARK: - Date Parsing

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
