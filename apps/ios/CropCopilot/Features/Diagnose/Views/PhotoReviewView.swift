//
//  PhotoReviewView.swift
//  CropCopilot
//
//  Created by Claude Code on Phase 2
//

import SwiftUI

struct PhotoReviewView: View {
    let image: UIImage
    let onRetake: () -> Void
    @State private var showDiagnosisForm = false
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // Image preview
                Image(uiImage: image)
                    .resizable()
                    .scaledToFit()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(Color.black)

                // Action buttons
                HStack(spacing: 40) {
                    Button {
                        dismiss()
                        onRetake()
                    } label: {
                        VStack(spacing: 4) {
                            Image(systemName: "arrow.counterclockwise")
                                .font(.title2)
                            Text("Retake")
                                .font(.caption)
                        }
                        .foregroundColor(.white)
                    }

                    NavigationLink {
                        DiagnosisFormView(capturedImage: image)
                    } label: {
                        VStack(spacing: 4) {
                            Image(systemName: "checkmark.circle.fill")
                                .font(.title2)
                            Text("Use Photo")
                                .font(.caption)
                        }
                        .foregroundColor(.appPrimary)
                    }
                }
                .padding(.vertical, 24)
                .frame(maxWidth: .infinity)
                .background(Color.black)
            }
            .background(Color.black)
            .navigationBarHidden(true)
        }
    }
}
