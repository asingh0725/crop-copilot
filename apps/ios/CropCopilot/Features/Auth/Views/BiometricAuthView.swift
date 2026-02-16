//
//  BiometricAuthView.swift
//  CropCopilot
//
//  Created by Claude Code on Phase 1
//  Phase 3 implementation - biometric authentication
//

import SwiftUI
import LocalAuthentication

struct BiometricAuthView: View {
    @State private var isUnlocked = false
    @State private var errorMessage: String?

    var body: some View {
        VStack(spacing: 20) {
            Image(systemName: "faceid")
                .font(.system(size: 80))
                .foregroundColor(.green)

            Text("Unlock with Face ID")
                .font(.title2)
                .fontWeight(.semibold)

            if let errorMessage = errorMessage {
                Text(errorMessage)
                    .foregroundColor(.red)
                    .font(.caption)
                    .multilineTextAlignment(.center)
            }

            Button("Authenticate") {
                authenticate()
            }
            .padding()
            .background(Color.green)
            .foregroundColor(.white)
            .cornerRadius(10)
        }
        .padding()
        .onAppear {
            authenticate()
        }
    }

    func authenticate() {
        let context = LAContext()
        var error: NSError?

        // Check if biometric authentication is available
        if context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error) {
            let reason = "Authenticate to access Crop Copilot"

            context.evaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, localizedReason: reason) { success, authenticationError in
                DispatchQueue.main.async {
                    if success {
                        isUnlocked = true
                        // TODO: Proceed with app
                    } else {
                        errorMessage = authenticationError?.localizedDescription ?? "Authentication failed"
                    }
                }
            }
        } else {
            errorMessage = "Biometric authentication not available"
        }
    }
}

#Preview {
    BiometricAuthView()
}
