//
//  CameraView.swift
//  CropCopilot
//
//  Created by Claude Code on Phase 2
//

import SwiftUI

struct CameraView: View {
    @StateObject private var cameraManager = CameraManager()
    @State private var zoomFactor: CGFloat = 1.0
    @State private var showPhotoReview = false
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ZStack {
            if cameraManager.isAuthorized {
                cameraContent
            } else {
                permissionDeniedView
            }
        }
        .navigationBarBackButtonHidden(true)
        .toolbar {
            ToolbarItem(placement: .navigationBarLeading) {
                Button {
                    dismiss()
                } label: {
                    Image(systemName: "xmark")
                        .foregroundColor(.white)
                        .padding(8)
                        .background(Color.black.opacity(0.5))
                        .clipShape(Circle())
                }
            }
        }
        .onAppear {
            cameraManager.startSession()
        }
        .onDisappear {
            cameraManager.stopSession()
        }
        .fullScreenCover(isPresented: $showPhotoReview) {
            if let image = cameraManager.capturedImage {
                PhotoReviewView(image: image, onRetake: {
                    cameraManager.capturedImage = nil
                    showPhotoReview = false
                    cameraManager.startSession()
                })
            }
        }
        .onChange(of: cameraManager.capturedImage) { newValue in
            if newValue != nil {
                cameraManager.stopSession()
                showPhotoReview = true
            }
        }
    }

    private var cameraContent: some View {
        ZStack {
            // Camera preview
            CameraPreviewView(session: cameraManager.session)
                .ignoresSafeArea()
                .gesture(
                    MagnificationGesture()
                        .onChanged { value in
                            zoomFactor = value
                            cameraManager.setZoom(value)
                        }
                )

            // Framing overlay
            VStack {
                Spacer()
                Text("Center the soil or crop in frame")
                    .font(.caption)
                    .foregroundColor(.white)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 8)
                    .background(Color.black.opacity(0.5))
                    .cornerRadius(20)
                    .padding(.bottom, 8)

                // Controls
                HStack(spacing: 40) {
                    // Flash toggle
                    Button {
                        cameraManager.toggleFlash()
                    } label: {
                        Image(systemName: cameraManager.isFlashOn ? "bolt.fill" : "bolt.slash.fill")
                            .font(.title2)
                            .foregroundColor(.white)
                            .frame(width: 50, height: 50)
                    }

                    // Shutter button
                    Button {
                        cameraManager.capturePhoto()
                    } label: {
                        Circle()
                            .fill(Color.white)
                            .frame(width: 70, height: 70)
                            .overlay(
                                Circle()
                                    .stroke(Color.white, lineWidth: 3)
                                    .frame(width: 80, height: 80)
                            )
                    }

                    // Switch camera
                    Button {
                        cameraManager.switchCamera()
                    } label: {
                        Image(systemName: "camera.rotate.fill")
                            .font(.title2)
                            .foregroundColor(.white)
                            .frame(width: 50, height: 50)
                    }
                }
                .padding(.bottom, 40)
            }
        }
    }

    private var permissionDeniedView: some View {
        VStack(spacing: 16) {
            Image(systemName: "camera.fill")
                .font(.system(size: 50))
                .foregroundColor(.secondary)
            Text("Camera Access Required")
                .font(.title3.bold())
            Text("Please enable camera access in Settings to take photos for diagnosis.")
                .font(.subheadline)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)
            Button("Open Settings") {
                if let url = URL(string: UIApplication.openSettingsURLString) {
                    UIApplication.shared.open(url)
                }
            }
            .buttonStyle(.borderedProminent)
        }
    }
}
