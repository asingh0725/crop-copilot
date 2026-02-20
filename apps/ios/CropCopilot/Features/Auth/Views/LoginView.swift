//
//  LoginView.swift
//  CropCopilot
//

import SwiftUI

struct LoginView: View {
    @EnvironmentObject var authViewModel: AuthViewModel
    @Environment(\.supabaseClient) var supabase

    @State private var email = ""
    @State private var password = ""
    @State private var showingSignup = false

    var body: some View {
        NavigationStack {
            ZStack {
                // Full-bleed dark botanical gradient
                LinearGradient(
                    stops: [
                        .init(color: Color(red: 0.05, green: 0.12, blue: 0.05), location: 0),
                        .init(color: Color(red: 0.08, green: 0.18, blue: 0.07), location: 0.45),
                        .init(color: Color(red: 0.04, green: 0.10, blue: 0.04), location: 1),
                    ],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
                .ignoresSafeArea()

                // Animated botanical leaf & pollen field
                BotanicalParticleField()
                    .ignoresSafeArea()

                // Subtle radial highlight behind the logo
                RadialGradient(
                    colors: [Color.appPrimary.opacity(0.18), .clear],
                    center: .init(x: 0.5, y: 0.28),
                    startRadius: 0,
                    endRadius: 220
                )
                .ignoresSafeArea()

                VStack(spacing: 0) {
                    Spacer()

                    // MARK: - Branding
                    VStack(spacing: Spacing.md) {
                        CropCopilotLogoMark(size: 58, color: .white)
                            .pulseGlow(color: .appPrimary, radius: 28, duration: 4.0)
                            .floatAnimation(amplitude: 5, duration: 6.0)

                        Text("Crop Copilot")
                            .font(.largeTitle.weight(.bold))
                            .foregroundStyle(.white)

                        Text("AI-Powered Agronomy Assistant")
                            .font(.subheadline)
                            .foregroundStyle(.white.opacity(0.52))
                    }

                    Spacer()

                    // MARK: - Glass Form Card
                    VStack(spacing: Spacing.lg) {
                        VStack(spacing: Spacing.md) {
                            glassTextField(
                                placeholder: "Email",
                                text: $email,
                                keyboardType: .emailAddress,
                                contentType: .emailAddress
                            )

                            glassSecureField(
                                placeholder: "Password",
                                text: $password,
                                contentType: .password
                            )
                        }

                        if let errorMessage = authViewModel.errorMessage {
                            Text(errorMessage)
                                .font(.caption.weight(.medium))
                                .foregroundStyle(.red.opacity(0.90))
                                .multilineTextAlignment(.center)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }

                        Button {
                            Task {
                                await authViewModel.signIn(email: email, password: password)
                            }
                        } label: {
                            Group {
                                if authViewModel.isLoading {
                                    ProgressView().tint(.black)
                                } else {
                                    Text("Sign In")
                                        .font(.headline)
                                        .foregroundStyle(.black)
                                }
                            }
                            .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(GlowSkeuomorphicButtonStyle())
                        .disabled(authViewModel.isLoading || email.isEmpty || password.isEmpty)

                        Button("Forgot Password?") {
                            Task {
                                await authViewModel.resetPassword(email: email)
                            }
                        }
                        .font(.subheadline)
                        .foregroundStyle(.white.opacity(0.50))
                        .disabled(email.isEmpty)
                    }
                    .padding(Spacing.xl)
                    .background(.white.opacity(0.07), in: RoundedRectangle(cornerRadius: CornerRadius.xl, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: CornerRadius.xl, style: .continuous)
                            .stroke(.white.opacity(0.14), lineWidth: 1)
                    )
                    .padding(.horizontal, Spacing.lg)

                    // MARK: - Sign Up Link
                    HStack(spacing: 4) {
                        Text("Don't have an account?")
                            .font(.subheadline)
                            .foregroundStyle(.white.opacity(0.50))
                        Button("Sign Up") {
                            showingSignup = true
                        }
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Color.appPrimary)
                    }
                    .padding(.top, Spacing.lg)
                    .padding(.bottom, Spacing.xxl)
                }
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

    // MARK: - Field Builders

    private func glassTextField(
        placeholder: String,
        text: Binding<String>,
        keyboardType: UIKeyboardType = .default,
        contentType: UITextContentType? = nil
    ) -> some View {
        TextField(placeholder, text: text)
            .textContentType(contentType)
            .keyboardType(keyboardType)
            .autocapitalization(.none)
            .autocorrectionDisabled()
            .foregroundStyle(.white)
            .tint(Color.appPrimary)
            .placeholder(when: text.wrappedValue.isEmpty) {
                Text(placeholder).foregroundStyle(.white.opacity(0.38))
            }
            .padding(.horizontal, Spacing.md)
            .padding(.vertical, Spacing.sm + 4)
            .background(.white.opacity(0.09))
            .clipShape(RoundedRectangle(cornerRadius: CornerRadius.md, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: CornerRadius.md, style: .continuous)
                    .stroke(.white.opacity(0.18), lineWidth: 1)
            )
    }

    private func glassSecureField(
        placeholder: String,
        text: Binding<String>,
        contentType: UITextContentType? = nil
    ) -> some View {
        SecureField(placeholder, text: text)
            .textContentType(contentType)
            .foregroundStyle(.white)
            .tint(Color.appPrimary)
            .padding(.horizontal, Spacing.md)
            .padding(.vertical, Spacing.sm + 4)
            .background(.white.opacity(0.09))
            .clipShape(RoundedRectangle(cornerRadius: CornerRadius.md, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: CornerRadius.md, style: .continuous)
                    .stroke(.white.opacity(0.18), lineWidth: 1)
            )
    }
}

// MARK: - Placeholder helper

private extension View {
    func placeholder<Content: View>(
        when shouldShow: Bool,
        @ViewBuilder placeholder: () -> Content
    ) -> some View {
        ZStack(alignment: .leading) {
            if shouldShow { placeholder() }
            self
        }
    }
}

#Preview {
    LoginView()
        .environmentObject(AuthViewModel())
}
