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
            Group {
                if authViewModel.isAuthenticated {
                    Text("Dashboard Placeholder")
                        .font(.title)
                } else {
                    LoginView()
                }
            }
            .environmentObject(authViewModel)
            .environment(\.supabaseClient, supabase)
        }
    }
}

// MARK: - Configuration
struct Configuration {
    static let supabaseURL: String = {
        Bundle.main.infoDictionary?["SUPABASE_URL"] as? String ?? "https://your-project.supabase.co"
    }()
    static let supabaseAnonKey: String = {
        Bundle.main.infoDictionary?["SUPABASE_ANON_KEY"] as? String ?? ""
    }()
    static let apiBaseURL: String = {
        Bundle.main.infoDictionary?["API_BASE_URL"] as? String ?? "http://localhost:3000/api/v1"
    }()

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
