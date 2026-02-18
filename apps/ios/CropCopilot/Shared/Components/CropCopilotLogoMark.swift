//
//  CropCopilotLogoMark.swift
//  CropCopilot
//

import SwiftUI

struct CropCopilotLogoMark: View {
    var size: CGFloat = 28
    var color: Color = .appSecondary

    var body: some View {
        GeometryReader { proxy in
            let w = proxy.size.width
            let h = proxy.size.height

            ZStack {
                Path { path in
                    path.move(to: CGPoint(x: w * 0.5, y: h * 0.78))
                    path.addQuadCurve(
                        to: CGPoint(x: w * 0.5, y: h * 0.36),
                        control: CGPoint(x: w * 0.5, y: h * 0.56)
                    )
                }
                .stroke(color, style: StrokeStyle(lineWidth: max(1.4, w * 0.075), lineCap: .round))

                Path { path in
                    path.move(to: CGPoint(x: w * 0.5, y: h * 0.52))
                    path.addQuadCurve(
                        to: CGPoint(x: w * 0.28, y: h * 0.32),
                        control: CGPoint(x: w * 0.38, y: h * 0.37)
                    )
                    path.addQuadCurve(
                        to: CGPoint(x: w * 0.5, y: h * 0.52),
                        control: CGPoint(x: w * 0.34, y: h * 0.48)
                    )
                }
                .fill(color.opacity(0.82))

                Path { path in
                    path.move(to: CGPoint(x: w * 0.5, y: h * 0.44))
                    path.addQuadCurve(
                        to: CGPoint(x: w * 0.76, y: h * 0.22),
                        control: CGPoint(x: w * 0.62, y: h * 0.29)
                    )
                    path.addQuadCurve(
                        to: CGPoint(x: w * 0.5, y: h * 0.44),
                        control: CGPoint(x: w * 0.7, y: h * 0.39)
                    )
                }
                .fill(color)

                Circle()
                    .fill(color)
                    .frame(width: w * 0.11, height: w * 0.11)
                    .position(x: w * 0.76, y: h * 0.22)

                Circle()
                    .stroke(color.opacity(0.4), lineWidth: max(0.8, w * 0.03))
                    .frame(width: w * 0.2, height: w * 0.2)
                    .position(x: w * 0.76, y: h * 0.22)

                Path { path in
                    path.move(to: CGPoint(x: w * 0.33, y: h * 0.78))
                    path.addQuadCurve(
                        to: CGPoint(x: w * 0.67, y: h * 0.78),
                        control: CGPoint(x: w * 0.5, y: h * 0.73)
                    )
                }
                .stroke(color.opacity(0.3), style: StrokeStyle(lineWidth: max(1, w * 0.045), lineCap: .round))
            }
        }
        .frame(width: size, height: size)
    }
}
