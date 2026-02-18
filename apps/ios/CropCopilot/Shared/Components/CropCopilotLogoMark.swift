//
//  CropCopilotLogoMark.swift
//  CropCopilot
//

import SwiftUI

struct CropCopilotLogoMark: View {
    var size: CGFloat = 28
    var color: Color = .appSecondary

    var body: some View {
        ZStack {
            Path { path in
                path.move(to: CGPoint(x: 16, y: 25))
                path.addQuadCurve(to: CGPoint(x: 16, y: 13), control: CGPoint(x: 16, y: 19))
            }
            .stroke(color, style: StrokeStyle(lineWidth: 2, lineCap: .round))

            Path { path in
                path.move(to: CGPoint(x: 16, y: 17))
                path.addQuadCurve(to: CGPoint(x: 12, y: 12), control: CGPoint(x: 14, y: 14))
                path.addQuadCurve(to: CGPoint(x: 9, y: 10), control: CGPoint(x: 10.5, y: 11))
                path.addQuadCurve(to: CGPoint(x: 11, y: 14), control: CGPoint(x: 9.5, y: 12))
                path.addQuadCurve(to: CGPoint(x: 16, y: 17), control: CGPoint(x: 13, y: 16))
            }
            .fill(color.opacity(0.85))

            Path { path in
                path.move(to: CGPoint(x: 16, y: 14))
                path.addQuadCurve(to: CGPoint(x: 21, y: 9), control: CGPoint(x: 18.5, y: 11))
                path.addQuadCurve(to: CGPoint(x: 24, y: 7), control: CGPoint(x: 22.5, y: 8))
                path.addQuadCurve(to: CGPoint(x: 22, y: 12), control: CGPoint(x: 23.5, y: 10.5))
                path.addQuadCurve(to: CGPoint(x: 16, y: 14), control: CGPoint(x: 19.5, y: 13.5))
            }
            .fill(color)

            Circle()
                .fill(color)
                .frame(width: 3, height: 3)
                .offset(x: 8, y: -9)

            Circle()
                .stroke(color.opacity(0.4), lineWidth: 0.7)
                .frame(width: 6, height: 6)
                .offset(x: 8, y: -9)

            Path { path in
                path.move(to: CGPoint(x: 11, y: 25))
                path.addQuadCurve(to: CGPoint(x: 21, y: 25), control: CGPoint(x: 16, y: 24))
            }
            .stroke(color.opacity(0.3), style: StrokeStyle(lineWidth: 1, lineCap: .round))
        }
        .frame(width: 32, height: 32)
        .scaleEffect(size / 32)
        .frame(width: size, height: size)
        .drawingGroup()
    }
}
