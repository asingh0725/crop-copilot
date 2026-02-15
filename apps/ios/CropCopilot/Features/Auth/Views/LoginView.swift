//
//  LoginView.swift
//  CropCopilot
//
//  Created by Claude Code on Phase 1
//

import SwiftUI
import AuthenticationServices

struct LoginView: View {
    @EnvironmentObject var authViewModel: AuthViewModel
    @Environment(\.supabaseClient) var supabase

    @State private var email = ""
    @State private var password = ""
    @State private var showingSignup = false
    @State private var currentNonce: String?

    var body: some View {
        NavigationStack {
            VStack(spacing: 24) {
                // Logo/Header
                VStack(spacing: 8) {
                    Image(systemName: "leaf.fill")
                        .font(.system(size: 60))
                        .foregroundColor(.green)

                    Text("Crop Copilot")
                        .font(.largeTitle)
                        .fontWeight(.bold)

                    Text("AI-Powered Agronomy Assistant")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                }
                .padding(.top, 40)

                Spacer()

                // Login Form
                VStack(spacing: 16) {
                    TextField("Email", text: $email)
                        .textContentType(.emailAddress)
                        .keyboardType(.emailAddress)
                        .autocapitalization(.none)
                        .textFieldStyle(.roundedBorder)

                    SecureField("Password", text: $password)
                        .textContentType(.password)
                        .textFieldStyle(.roundedBorder)

                    if let errorMessage = authViewModel.errorMessage {
                        Text(errorMessage)
                            .foregroundColor(.red)
                            .font(.caption)
                            .multilineTextAlignment(.center)
                    }

                    Button {
                        Task {
                            await authViewModel.signIn(email: email, password: password)
                        }
                    } label: {
                        if authViewModel.isLoading {
                            ProgressView()
                                .tint(.white)
                        } else {
                            Text("Sign In")
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(Color.green)
                    .foregroundColor(.white)
                    .cornerRadius(10)
                    .disabled(authViewModel.isLoading || email.isEmpty || password.isEmpty)

                    // Forgot Password
                    Button("Forgot Password?") {
                        Task {
                            await authViewModel.resetPassword(email: email)
                        }
                    }
                    .font(.caption)
                    .foregroundColor(.blue)
                    .disabled(email.isEmpty)
                }
                .padding(.horizontal, 32)

                // Divider
                HStack {
                    Rectangle()
                        .frame(height: 1)
                        .foregroundColor(.gray.opacity(0.3))
                    Text("OR")
                        .font(.caption)
                        .foregroundColor(.secondary)
                    Rectangle()
                        .frame(height: 1)
                        .foregroundColor(.gray.opacity(0.3))
                }
                .padding(.horizontal, 32)

                // Sign in with Apple
                SignInWithAppleButton(.signIn) { request in
                    let nonce = AuthRepository.randomNonceString()
                    currentNonce = nonce
                    request.requestedScopes = [.fullName, .email]
                    request.nonce = AuthRepository.sha256(nonce)
                } onCompletion: { result in
                    switch result {
                    case .success(let authorization):
                        if let appleIDCredential = authorization.credential as? ASAuthorizationAppleIDCredential,
                           let identityToken = appleIDCredential.identityToken,
                           let tokenString = String(data: identityToken, encoding: .utf8),
                           let nonce = currentNonce {
                            Task {
                                await authViewModel.handleSignInWithAppleCompletion(
                                    idToken: tokenString,
                                    nonce: nonce
                                )
                            }
                        }
                    case .failure(let error):
                        authViewModel.errorMessage = error.localizedDescription
                    }
                }
                .frame(height: 50)
                .padding(.horizontal, 32)

                Spacer()

                // Sign Up Link
                HStack {
                    Text("Don't have an account?")
                        .foregroundColor(.secondary)
                    Button("Sign Up") {
                        showingSignup = true
                    }
                    .foregroundColor(.green)
                }
                .padding(.bottom, 20)
            }
            .navigationDestination(isPresented: $showingSignup) {
                SignupView()
            }
        }
        .onAppear {
            if let supabase = supabase {
                let repository = AuthRepository(supabase: supabase)
                authViewModel.setRepository(repository)
            }
        }
    }
}

#Preview {
    LoginView()
        .environmentObject(AuthViewModel())
}
