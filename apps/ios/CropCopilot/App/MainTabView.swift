//
//  MainTabView.swift
//  CropCopilot
//
//  Created by Claude Code on Phase 2
//

import SwiftUI

struct MainTabView: View {
    @EnvironmentObject var authViewModel: AuthViewModel

    var body: some View {
        TabView {
            DashboardView()
                .tabItem {
                    Label("Dashboard", systemImage: "house.fill")
                }

            DiagnoseTabView()
                .tabItem {
                    Label("Diagnose", systemImage: "camera.fill")
                }

            RecommendationsListView()
                .tabItem {
                    Label("History", systemImage: "clock.fill")
                }

            Text("Products")
                .tabItem {
                    Label("Products", systemImage: "leaf.fill")
                }

            SettingsView()
                .tabItem {
                    Label("Settings", systemImage: "gearshape.fill")
                }
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
