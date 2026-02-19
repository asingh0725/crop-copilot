//
//  AntigravityStyles.swift
//  CropCopilot
//

import SwiftUI

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

struct AntigravityFloatModifier: ViewModifier {
    let amplitude: CGFloat
    let parallaxScale: CGFloat

    func body(content: Content) -> some View {
        content
    }
}

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
                                        .clear
                                    ],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                )
                            )
                    )
                    .shadow(
                        color: Color.appPrimary.opacity(configuration.isPressed ? 0.18 : 0.36),
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
}
