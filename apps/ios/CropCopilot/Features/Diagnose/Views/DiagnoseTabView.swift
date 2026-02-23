//
//  DiagnoseTabView.swift
//  CropCopilot
//

import SwiftUI

struct DiagnoseTabView: View {
    var body: some View {
        NavigationStack {
            VStack(spacing: 30) {
                Spacer()

                Image(systemName: "leaf.circle.fill")
                    .font(.system(size: 96))
                    .foregroundStyle(Color.appPrimary)
                    .shadow(color: Color.appPrimary.opacity(0.35), radius: 16, x: 0, y: 6)

                VStack(spacing: 8) {
                    Text("Start a Diagnosis")
                        .font(.title2.bold())
                        .foregroundStyle(.primary)

                    Text("Choose how you'd like to submit crop or soil data for analysis.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 32)
                }

                VStack(spacing: 14) {
                    NavigationLink {
                        CameraView()
                    } label: {
                        DiagnoseOptionCard(
                            icon: "camera.fill",
                            title: "Photo Diagnosis",
                            subtitle: "Take a field photo"
                        )
                    }
                    .buttonStyle(AntigravityScaleButtonStyle())

                    NavigationLink {
                        LabReportFormView()
                    } label: {
                        DiagnoseOptionCard(
                            icon: "doc.text.fill",
                            title: "Lab Report",
                            subtitle: "Enter test values"
                        )
                    }
                    .buttonStyle(AntigravityScaleButtonStyle())
                }
                .padding(.horizontal, 24)

                Spacer()
            }
            .navigationTitle("Diagnose")
        }
    }
}

private struct DiagnoseOptionCard: View {
    let icon: String
    let title: String
    let subtitle: String

    var body: some View {
        HStack(spacing: 16) {
            Image(systemName: icon)
                .font(.title3)
                .foregroundStyle(Color.appPrimary)
                .frame(width: 42, height: 42)
                .background(Color.appPrimary.opacity(0.16))
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))

            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(.headline)
                    .foregroundStyle(.primary)
                Text(subtitle)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Image(systemName: "chevron.right")
                .foregroundStyle(.secondary)
        }
        .padding()
        .antigravityGlass(cornerRadius: 16)
        .contentShape(Rectangle())
    }
}
