//
//  Animations.swift
//  CropCopilot
//
//  Phase 2 animation modifiers — float, pulse-glow, and shimmer loading.
//  All animations respect prefers-reduced-motion via accessibilityReduceMotion.
//

import SwiftUI

// MARK: - Float Animation

/// Gentle up/down sine-wave float — matches the web `@keyframes float` effect.
/// Use on hero icons, metric values, and featured cards.
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
                ) {
                    floatUp = true
                }
            }
    }
}

// MARK: - Pulse Glow Animation

/// Breathing shadow glow — matches the web `@keyframes pulse-glow` effect.
/// Use on confidence arcs, key metric values, and CTA elements.
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
                x: 0,
                y: 0
            )
            .onAppear {
                guard !reduceMotion else { return }
                withAnimation(
                    .easeInOut(duration: duration)
                    .repeatForever(autoreverses: true)
                ) {
                    isGlowing = true
                }
            }
    }
}

// MARK: - Shimmer Loading Modifier

/// Horizontal shimmer sweep for skeleton loading states.
/// Apply over a gray `RoundedRectangle` placeholder.
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

/// Single skeleton line placeholder — use to mimic loading text rows.
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

/// Card-shaped skeleton placeholder — use to mimic a loading card.
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

/// Floating organic particle field — subtle pollen/seed drift for hero backgrounds.
/// Draws 18 small white circles that drift upward with staggered phase offsets.
/// Uses `TimelineView(.animation)` + `Canvas` for GPU-accelerated drawing.
/// Entirely transparent when `accessibilityReduceMotion` is enabled.
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
                        // Distribute X positions using golden-angle spacing
                        let baseX = (fi * 137.508).truncatingRemainder(dividingBy: size.width * 0.86) + size.width * 0.07
                        let swayX = sin(t * 0.38 + fi * 0.85) * 14
                        let x = baseX + swayX

                        // Drift upward; wrap when past top
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

/// Floating leaf and pollen particle canvas — used as the animated background on the login screen.
/// Draws a mix of teardrop leaf shapes and small pollen circles drifting upward.
/// Entirely transparent when `accessibilityReduceMotion` is enabled.
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
                        let isLeaf = i % 3 != 0  // 2/3 leaves, 1/3 pollen dots

                        // X: golden-angle distribution with gentle lateral sway
                        let baseX = (fi * 137.508).truncatingRemainder(dividingBy: size.width * 0.88) + size.width * 0.06
                        let swayX = sin(t * 0.25 + fi * 1.05) * 20
                        let x = baseX + swayX

                        // Y: upward drift, wraps at top + a little padding
                        let speed = 10.0 + fi.truncatingRemainder(dividingBy: 5) * 5
                        let phase = fi * (size.height / Double(count))
                        let rawY = size.height - (t * speed + phase).truncatingRemainder(dividingBy: size.height + 50)
                        let y = rawY < -25 ? rawY + size.height + 50 : rawY

                        // Slowly rotating over time
                        let rotation = (t * 0.12 + fi * 0.55).truncatingRemainder(dividingBy: Double.pi * 2)

                        // Subtle opacity oscillation
                        let opacity = 0.05 + 0.06 * sin(t * 0.35 + fi * 0.8)
                        context.opacity = opacity

                        if isLeaf {
                            // Teardrop leaf: pointed tip at bottom, rounded at top
                            let leafW = 5.0 + fi.truncatingRemainder(dividingBy: 4) * 2.5
                            let leafH = leafW * 1.75

                            // Build and rotate the teardrop path around its center
                            var transform = CGAffineTransform(translationX: x, y: y)
                                .rotated(by: rotation)
                                .translatedBy(x: -leafW / 2, y: -leafH / 2)

                            var leaf = Path()
                            leaf.move(to: CGPoint(x: leafW / 2, y: leafH))        // bottom tip
                            leaf.addCurve(
                                to: CGPoint(x: 0, y: 0),                          // top left
                                control1: CGPoint(x: -leafW * 0.05, y: leafH * 0.55),
                                control2: CGPoint(x: 0, y: leafH * 0.12)
                            )
                            leaf.addCurve(
                                to: CGPoint(x: leafW / 2, y: leafH),              // back to tip
                                control1: CGPoint(x: leafW, y: leafH * 0.12),
                                control2: CGPoint(x: leafW * 1.05, y: leafH * 0.55)
                            )
                            leaf.closeSubpath()
                            leaf = leaf.applying(transform)
                            context.fill(leaf, with: .color(.white))
                        } else {
                            // Pollen dot
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

// MARK: - View Extensions

extension View {
    /// Gentle floating up/down animation — like `@keyframes float`.
    func floatAnimation(amplitude: CGFloat = 5, duration: Double = 5.5) -> some View {
        modifier(FloatAnimationModifier(amplitude: amplitude, duration: duration))
    }

    /// Breathing glow shadow — like `@keyframes pulse-glow`.
    func pulseGlow(color: Color = .appPrimary, radius: CGFloat = 14, duration: Double = 3.0) -> some View {
        modifier(PulseGlowModifier(color: color, radius: radius, duration: duration))
    }

    /// Horizontal shimmer sweep for loading states.
    func shimmer() -> some View {
        modifier(ShimmerModifier())
    }
}
