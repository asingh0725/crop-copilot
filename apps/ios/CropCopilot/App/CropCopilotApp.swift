//
//  CropCopilotApp.swift
//  CropCopilot
//
//  Created by Claude Code on Phase 1
//

import SwiftUI
import Supabase

@main
struct CropCopilotApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    @StateObject private var authViewModel = AuthViewModel()

    // Supabase client
    let supabase = SupabaseClient(
        supabaseURL: URL(string: Configuration.supabaseURL)!,
        supabaseKey: Configuration.supabaseAnonKey
    )

    var body: some Scene {
        WindowGroup {
            AppLaunchGateView()
            .environmentObject(authViewModel)
            .environment(\.supabaseClient, supabase)
        }
    }
}

private struct AppLaunchGateView: View {
    @EnvironmentObject private var authViewModel: AuthViewModel
    @State private var showLaunchOverlay = true

    var body: some View {
        ZStack {
            Group {
                if authViewModel.isAuthenticated {
                    AppRootView()
                } else {
                    LoginView()
                }
            }

            if showLaunchOverlay {
                AppLaunchOverlayView()
                    .transition(.opacity)
                    .zIndex(1)
            }
        }
        .task {
            guard showLaunchOverlay else { return }
            try? await Task.sleep(nanoseconds: 1_200_000_000)
            withAnimation(.easeOut(duration: 0.25)) {
                showLaunchOverlay = false
            }
        }
    }
}

private struct AppLaunchOverlayView: View {
    @State private var animate = false

    var body: some View {
        ZStack {
            Color("Obsidian")
                .ignoresSafeArea()

            VStack(spacing: 14) {
                CropCopilotLogoMark(size: 78, color: .appPrimary)
                    .scaleEffect(animate ? 1.0 : 0.9)
                    .opacity(animate ? 1 : 0.65)

                Text("Crop Copilot")
                    .font(.system(size: 30, weight: .bold))
                    .foregroundStyle(.white)

                Text("Loading dashboard...")
                    .font(.subheadline)
                    .foregroundStyle(.white.opacity(0.72))
            }
        }
        .onAppear {
            withAnimation(.easeInOut(duration: 0.8)) {
                animate = true
            }
        }
    }
}

// MARK: - Configuration
struct Configuration {
    private static func isValidHttpUrl(_ value: String) -> Bool {
        guard let components = URLComponents(string: value),
              let scheme = components.scheme?.lowercased(),
              (scheme == "http" || scheme == "https"),
              components.host != nil else {
            return false
        }

        return true
    }

    private static func resolvedConfigValue(for key: String) -> String? {
        guard let raw = Bundle.main.infoDictionary?[key] as? String else {
            return nil
        }

        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty || trimmed.contains("$(") {
            return nil
        }

        return trimmed
    }

    static let supabaseURL: String = {
        resolvedConfigValue(for: "SUPABASE_URL") ?? "https://your-project.supabase.co"
    }()
    static let supabaseAnonKey: String = {
        resolvedConfigValue(for: "SUPABASE_ANON_KEY") ?? ""
    }()
    static let apiBaseURL: String = {
        resolvedConfigValue(for: "API_BASE_URL") ?? "http://localhost:3000/api/v1"
    }()
    static let apiRuntimeBaseURL: String? = {
        resolvedConfigValue(for: "API_RUNTIME_BASE_URL")
    }()
    static let isRuntimeApiConfigured: Bool = {
        guard let value = apiRuntimeBaseURL else { return false }
        return isValidHttpUrl(value)
    }()

    static var runtimeAPIHostURL: URL? {
        guard let base = apiRuntimeBaseURL, let url = URL(string: base) else {
            return nil
        }

        guard var components = URLComponents(url: url, resolvingAgainstBaseURL: false) else {
            return nil
        }

        components.path = ""
        components.query = nil
        components.fragment = nil
        return components.url
    }

    static func resolveMediaURL(_ rawValue: String?) -> URL? {
        guard let rawValue else {
            return nil
        }

        let trimmed = rawValue.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            return nil
        }

        if let absolute = URL(string: trimmed), absolute.scheme != nil {
            return absolute
        }

        guard trimmed.hasPrefix("/"), let host = runtimeAPIHostURL else {
            return nil
        }

        return URL(string: trimmed, relativeTo: host)?.absoluteURL
    }
}

// MARK: - Environment Key for Supabase Client
private struct SupabaseClientKey: EnvironmentKey {
    static let defaultValue: SupabaseClient? = nil
}

extension EnvironmentValues {
    var supabaseClient: SupabaseClient? {
        get { self[SupabaseClientKey.self] }
        set { self[SupabaseClientKey.self] = newValue }
    }
}
