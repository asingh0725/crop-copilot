//
//  AntigravityStyles.swift
//  CropCopilot
//

import SwiftUI

// MARK: - Glass Modifier

struct AntigravityGlassModifier: ViewModifier {
    let cornerRadius: CGFloat

    func body(content: Content) -> some View {
        content
            .background(
                LinearGradient(
                    colors: [
                        Color.appCardBackground,
                        Color.appCardBackground.opacity(0.98),
                    ],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
            .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .strokeBorder(.black.opacity(0.06), lineWidth: 0.8)
            )
            .shadow(color: .black.opacity(0.06), radius: 14, x: 0, y: 7)
    }
}

// MARK: - Hero Card Modifier

/// Dark earth-gradient card — matches the web hero sections exactly.
/// Lime hairline accent at top, subtle primary glow shadow.
struct HeroCardModifier: ViewModifier {
    func body(content: Content) -> some View {
        content
            .background(
                LinearGradient(
                    stops: [
                        .init(color: Color.appEarth950, location: 0.00),
                        .init(color: Color.appEarth900, location: 0.50),
                        .init(color: Color.appEarth950, location: 1.00),
                    ],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
            .clipShape(RoundedRectangle(cornerRadius: CornerRadius.xl, style: .continuous))
            // Lime hairline at top — matches web `border-top: gradient lime`
            .overlay(alignment: .top) {
                LinearGradient(
                    colors: [.clear, Color.appPrimary.opacity(0.55), .clear],
                    startPoint: .leading,
                    endPoint: .trailing
                )
                .frame(height: 1.5)
                .padding(.horizontal, CornerRadius.xl)
            }
            .overlay(
                RoundedRectangle(cornerRadius: CornerRadius.xl, style: .continuous)
                    .stroke(Color.appPrimary.opacity(0.10), lineWidth: 1)
            )
            .shadow(color: Color.appPrimary.opacity(0.14), radius: 24, x: 0, y: 8)
            .shadow(color: .black.opacity(0.22), radius: 14, x: 0, y: 6)
    }
}

// MARK: - Accent-bordered Card Modifier

/// White card with a lime accent border — for interactive/highlighted cards.
struct AccentBorderedCardModifier: ViewModifier {
    let cornerRadius: CGFloat

    func body(content: Content) -> some View {
        content
            .background(Color.appCardBackground)
            .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .stroke(Color.appPrimary.opacity(0.45), lineWidth: 1.2)
            )
            .shadow(color: Color.appPrimary.opacity(0.12), radius: 10, x: 0, y: 4)
    }
}

// MARK: - Float Modifier (stub — Phase 2 animates this)

struct AntigravityFloatModifier: ViewModifier {
    let amplitude: CGFloat
    let parallaxScale: CGFloat

    func body(content: Content) -> some View {
        content
    }
}

// MARK: - Button Styles

struct GlowSkeuomorphicButtonStyle: ButtonStyle {
    func makeBody(configuration: Self.Configuration) -> some View {
        configuration.label
            .padding(.horizontal, 18)
            .padding(.vertical, 12)
            .background(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(Color.appPrimary)
                    .overlay(
                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .fill(
                                LinearGradient(
                                    colors: [
                                        .white.opacity(configuration.isPressed ? 0.08 : 0.18),
                                        .clear,
                                    ],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                )
                            )
                    )
                    .shadow(
                        color: Color.appPrimary.opacity(configuration.isPressed ? 0.18 : 0.38),
                        radius: configuration.isPressed ? 8 : 16,
                        x: 0,
                        y: configuration.isPressed ? 3 : 6
                    )
            )
            .overlay(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .stroke(.white.opacity(0.25), lineWidth: 0.7)
            )
            .scaleEffect(configuration.isPressed ? 0.98 : 1.0)
            .animation(
                .spring(response: 0.4, dampingFraction: 0.7, blendDuration: 0),
                value: configuration.isPressed
            )
    }
}

struct AntigravityScaleButtonStyle: ButtonStyle {
    func makeBody(configuration: Self.Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .animation(
                .spring(response: 0.4, dampingFraction: 0.7, blendDuration: 0),
                value: configuration.isPressed
            )
    }
}

// MARK: - Product Type Badge

/// Semantic color-coded capsule badge for product types.
/// Matches the web pill badge pattern with per-type color coding.
struct ProductTypeBadge: View {
    let type: String

    private var prettyType: String {
        type.replacingOccurrences(of: "_", with: " ").capitalized
    }

    private var color: Color { .forProductType(type) }

    var body: some View {
        Text(prettyType)
            .font(.caption.weight(.semibold))
            .foregroundStyle(color)
            .padding(.horizontal, 9)
            .padding(.vertical, 5)
            .background(color.opacity(0.12))
            .clipShape(Capsule())
            .overlay(
                Capsule()
                    .stroke(color.opacity(0.28), lineWidth: 0.8)
            )
    }
}

// MARK: - Section Header

/// Section title with a lime accent underline — matches the web design language.
struct SectionHeader<Trailing: View>: View {
    let title: String
    @ViewBuilder let trailing: () -> Trailing

    var body: some View {
        HStack(alignment: .bottom) {
            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(.headline)
                    .foregroundStyle(.primary)
                Rectangle()
                    .fill(
                        LinearGradient(
                            colors: [Color.appPrimary, Color.appPrimary.opacity(0)],
                            startPoint: .leading,
                            endPoint: .trailing
                        )
                    )
                    .frame(width: 28, height: 2)
                    .clipShape(Capsule())
            }
            Spacer()
            trailing()
        }
    }
}

extension SectionHeader where Trailing == EmptyView {
    init(title: String) {
        self.title = title
        self.trailing = { EmptyView() }
    }
}

// MARK: - Icon Badge

/// Colored rounded-square icon badge used in action cards and list rows.
struct IconBadge: View {
    let icon: String
    let color: Color
    var size: CGFloat = 32
    var cornerRadius: CGFloat = 9

    var body: some View {
        Image(systemName: icon)
            .font(.system(size: size * 0.44, weight: .semibold))
            .foregroundStyle(.white)
            .frame(width: size, height: size)
            .background(color)
            .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
            .shadow(color: color.opacity(0.36), radius: 6, x: 0, y: 3)
    }
}

// MARK: - View Extensions

// MARK: - Float Animation Modifier

struct FloatAnimationModifier: ViewModifier {
    let amplitude: CGFloat
    let duration: Double
    @State private var floatUp = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func body(content: Content) -> some View {
        content
            .offset(y: (floatUp ? -amplitude : amplitude))
            .onAppear {
                guard !reduceMotion else { return }
                withAnimation(
                    .easeInOut(duration: duration)
                    .repeatForever(autoreverses: true)
                ) { floatUp = true }
            }
    }
}

// MARK: - Pulse Glow Modifier

struct PulseGlowModifier: ViewModifier {
    let color: Color
    let radius: CGFloat
    let duration: Double
    @State private var isGlowing = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func body(content: Content) -> some View {
        content
            .shadow(
                color: color.opacity(isGlowing ? 0.48 : 0.16),
                radius: isGlowing ? radius : radius * 0.4,
                x: 0, y: 0
            )
            .onAppear {
                guard !reduceMotion else { return }
                withAnimation(
                    .easeInOut(duration: duration)
                    .repeatForever(autoreverses: true)
                ) { isGlowing = true }
            }
    }
}

// MARK: - Shimmer Modifier

struct ShimmerModifier: ViewModifier {
    @State private var phase: CGFloat = -1.5
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func body(content: Content) -> some View {
        content
            .overlay {
                if !reduceMotion {
                    GeometryReader { geometry in
                        LinearGradient(
                            stops: [
                                .init(color: .clear, location: 0.0),
                                .init(color: .white.opacity(0.55), location: 0.45),
                                .init(color: .white.opacity(0.55), location: 0.55),
                                .init(color: .clear, location: 1.0),
                            ],
                            startPoint: .leading,
                            endPoint: .trailing
                        )
                        .frame(width: geometry.size.width * 2)
                        .offset(x: geometry.size.width * phase)
                    }
                    .clipped()
                    .onAppear {
                        withAnimation(.linear(duration: 1.4).repeatForever(autoreverses: false)) {
                            phase = 1.5
                        }
                    }
                }
            }
    }
}

// MARK: - Skeleton Shapes

struct SkeletonLine: View {
    var width: CGFloat? = nil
    var height: CGFloat = 13
    var cornerRadius: CGFloat = 6

    var body: some View {
        RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
            .fill(Color.appSecondaryBackground)
            .frame(minWidth: 0, maxWidth: width ?? .infinity)
            .frame(height: height)
            .shimmer()
    }
}

struct SkeletonCard: View {
    var height: CGFloat = 90
    var cornerRadius: CGFloat = 16

    var body: some View {
        RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
            .fill(Color.appSecondaryBackground)
            .frame(maxWidth: .infinity)
            .frame(height: height)
            .shimmer()
    }
}

// MARK: - Animated Particle Field

struct AnimatedParticleField: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        if reduceMotion {
            Color.clear
        } else {
            TimelineView(.animation(minimumInterval: 1.0 / 30.0)) { timeline in
                Canvas { context, size in
                    guard size.width > 0, size.height > 0 else { return }
                    let t = timeline.date.timeIntervalSinceReferenceDate
                    let count = 22
                    for i in 0..<count {
                        let fi = Double(i)
                        let baseX = (fi * 137.508).truncatingRemainder(dividingBy: size.width * 0.86) + size.width * 0.07
                        let swayX = sin(t * 0.38 + fi * 0.85) * 14
                        let x = baseX + swayX
                        let speed = 15 + fi.truncatingRemainder(dividingBy: 6) * 5
                        let phase = fi * (size.height / Double(count))
                        let rawY = size.height - (t * speed + phase).truncatingRemainder(dividingBy: size.height + 24)
                        let y = rawY < -8 ? rawY + size.height + 24 : rawY
                        let radius = 1.2 + (fi.truncatingRemainder(dividingBy: 3)) * 0.9
                        let opacity = 0.07 + 0.06 * sin(t * 0.55 + fi * 1.2)
                        let dot = CGRect(x: x - radius, y: y - radius, width: radius * 2, height: radius * 2)
                        context.opacity = opacity
                        context.fill(Path(ellipseIn: dot), with: .color(.white))
                    }
                }
            }
            .allowsHitTesting(false)
        }
    }
}

// MARK: - Botanical Particle Field (Login Background)

struct BotanicalParticleField: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        if reduceMotion {
            Color.clear
        } else {
            TimelineView(.animation(minimumInterval: 1.0 / 30.0)) { timeline in
                Canvas { context, size in
                    guard size.width > 0, size.height > 0 else { return }
                    let t = timeline.date.timeIntervalSinceReferenceDate
                    let count = 32
                    for i in 0..<count {
                        let fi = Double(i)
                        let isLeaf = i % 3 != 0
                        let baseX = (fi * 137.508).truncatingRemainder(dividingBy: size.width * 0.88) + size.width * 0.06
                        let swayX = sin(t * 0.25 + fi * 1.05) * 20
                        let x = baseX + swayX
                        let speed = 10.0 + fi.truncatingRemainder(dividingBy: 5) * 5
                        let phase = fi * (size.height / Double(count))
                        let rawY = size.height - (t * speed + phase).truncatingRemainder(dividingBy: size.height + 50)
                        let y = rawY < -25 ? rawY + size.height + 50 : rawY
                        let rotation = (t * 0.12 + fi * 0.55).truncatingRemainder(dividingBy: Double.pi * 2)
                        let opacity = 0.05 + 0.06 * sin(t * 0.35 + fi * 0.8)
                        context.opacity = opacity
                        if isLeaf {
                            let leafW = 5.0 + fi.truncatingRemainder(dividingBy: 4) * 2.5
                            let leafH = leafW * 1.75
                            let transform = CGAffineTransform(translationX: x, y: y)
                                .rotated(by: rotation)
                                .translatedBy(x: -leafW / 2, y: -leafH / 2)
                            var leaf = Path()
                            leaf.move(to: CGPoint(x: leafW / 2, y: leafH))
                            leaf.addCurve(to: CGPoint(x: 0, y: 0),
                                control1: CGPoint(x: -leafW * 0.05, y: leafH * 0.55),
                                control2: CGPoint(x: 0, y: leafH * 0.12))
                            leaf.addCurve(to: CGPoint(x: leafW / 2, y: leafH),
                                control1: CGPoint(x: leafW, y: leafH * 0.12),
                                control2: CGPoint(x: leafW * 1.05, y: leafH * 0.55))
                            leaf.closeSubpath()
                            context.fill(leaf.applying(transform), with: .color(.white))
                        } else {
                            let radius = 1.8 + fi.truncatingRemainder(dividingBy: 3) * 0.9
                            let dot = CGRect(x: x - radius, y: y - radius, width: radius * 2, height: radius * 2)
                            context.fill(Path(ellipseIn: dot), with: .color(.white))
                        }
                    }
                }
            }
            .allowsHitTesting(false)
        }
    }
}

extension View {
    func antigravityGlass(cornerRadius: CGFloat = 20) -> some View {
        modifier(AntigravityGlassModifier(cornerRadius: cornerRadius))
    }

    func antigravityFloat(amplitude: CGFloat = 8, parallaxScale: CGFloat = 6) -> some View {
        modifier(
            AntigravityFloatModifier(
                amplitude: amplitude,
                parallaxScale: parallaxScale
            )
        )
    }

    func heroGradientCard() -> some View {
        modifier(HeroCardModifier())
    }

    func accentBorderedCard(cornerRadius: CGFloat = 16) -> some View {
        modifier(AccentBorderedCardModifier(cornerRadius: cornerRadius))
    }

    func floatAnimation(amplitude: CGFloat = 5, duration: Double = 5.5) -> some View {
        modifier(FloatAnimationModifier(amplitude: amplitude, duration: duration))
    }

    func pulseGlow(color: Color = .appPrimary, radius: CGFloat = 14, duration: Double = 3.0) -> some View {
        modifier(PulseGlowModifier(color: color, radius: radius, duration: duration))
    }

    func shimmer() -> some View {
        modifier(ShimmerModifier())
    }

    func limeShadow(radius: CGFloat = 8, opacity: Double = 0.12) -> some View {
        shadow(color: Color.appPrimary.opacity(opacity), radius: radius, x: 0, y: 4)
    }

    func coloredShadow(_ color: Color, radius: CGFloat = 8, opacity: Double = 0.12) -> some View {
        shadow(color: color.opacity(opacity), radius: radius, x: 0, y: 4)
    }
}
