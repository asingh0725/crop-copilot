//
//  MainTabView.swift
//  CropCopilot
//
//  Created by Claude Code on Phase 2
//

import SwiftUI

enum AppTab: Int {
    case dashboard, diagnose, recommendations, products, settings
}

struct MainTabView: View {
    @EnvironmentObject var authViewModel: AuthViewModel
    @State private var selectedTab: AppTab = .dashboard

    var body: some View {
        TabView(selection: $selectedTab) {
            DashboardView(selectedTab: $selectedTab)
                .tabItem {
                    Label("Dashboard", systemImage: "house.fill")
                }
                .tag(AppTab.dashboard)

            DiagnoseTabView()
                .tabItem {
                    Label("Diagnose", systemImage: "camera.fill")
                }
                .tag(AppTab.diagnose)

            RecommendationsListView()
                .tabItem {
                    Label("Recommendations", systemImage: "list.bullet.rectangle.fill")
                }
                .tag(AppTab.recommendations)

            Text("Products")
                .tabItem {
                    Label("Products", systemImage: "leaf.fill")
                }
                .tag(AppTab.products)

            SettingsView()
                .tabItem {
                    Label("Settings", systemImage: "gearshape.fill")
                }
                .tag(AppTab.settings)
        }
        .tint(.appPrimary)
    }
}

// MARK: - Diagnose Tab (choose photo or lab report)
struct DiagnoseTabView: View {
    var body: some View {
        NavigationStack {
            VStack(spacing: 24) {
                Spacer()

                Image(systemName: "leaf.circle.fill")
                    .font(.system(size: 80))
                    .foregroundColor(.appPrimary)

                Text("Start a Diagnosis")
                    .font(.title2.bold())

                Text("Choose how you'd like to submit your crop or soil data for analysis.")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)

                VStack(spacing: 16) {
                    NavigationLink {
                        CameraView()
                    } label: {
                        HStack {
                            Image(systemName: "camera.fill")
                                .font(.title3)
                            VStack(alignment: .leading) {
                                Text("Photo Diagnosis")
                                    .font(.headline)
                                Text("Take a photo of your crop or soil")
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                            }
                            Spacer()
                            Image(systemName: "chevron.right")
                        }
                        .padding()
                        .background(Color.appSecondaryBackground)
                        .cornerRadius(12)
                    }
                    .buttonStyle(.plain)

                    NavigationLink {
                        LabReportFormView()
                    } label: {
                        HStack {
                            Image(systemName: "doc.text.fill")
                                .font(.title3)
                            VStack(alignment: .leading) {
                                Text("Lab Report")
                                    .font(.headline)
                                Text("Enter soil test lab results")
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                            }
                            Spacer()
                            Image(systemName: "chevron.right")
                        }
                        .padding()
                        .background(Color.appSecondaryBackground)
                        .cornerRadius(12)
                    }
                    .buttonStyle(.plain)
                }
                .padding(.horizontal, 24)

                Spacer()
            }
            .navigationTitle("Diagnose")
        }
    }
}
