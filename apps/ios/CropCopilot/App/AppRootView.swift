//
//  AppRootView.swift
//  CropCopilot
//

import SwiftUI

struct AppRootView: View {
    @State private var selectedTab: AppTab = .dashboard
    @StateObject private var billingStore = BillingSnapshotStore()

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [Color.appCanvas, Color.white],
                startPoint: .top,
                endPoint: .bottom
            )
            .ignoresSafeArea()

            RadialGradient(
                colors: [Color.appPrimary.opacity(0.08), .clear],
                center: .topTrailing,
                startRadius: 10,
                endRadius: 340
            )
            .ignoresSafeArea()

            // Subtle botanical particle field — drifts behind semi-transparent surfaces
            // (antigravityGlass cards, navigation bars) throughout every tab.
            AnimatedParticleField()
                .ignoresSafeArea()

            TabView(selection: $selectedTab) {
                DashboardView(selectedTab: $selectedTab)
                    .tabItem {
                        Label(AppTab.dashboard.title, systemImage: AppTab.dashboard.icon)
                    }
                    .tag(AppTab.dashboard)

                DiagnoseTabView()
                    .tabItem {
                        Label(AppTab.diagnose.title, systemImage: AppTab.diagnose.icon)
                    }
                    .tag(AppTab.diagnose)

                RecommendationsListView()
                    .tabItem {
                        Label(AppTab.recommendations.title, systemImage: AppTab.recommendations.icon)
                    }
                    .tag(AppTab.recommendations)

                ProductsListView()
                    .tabItem {
                        Label(AppTab.products.title, systemImage: AppTab.products.icon)
                    }
                    .tag(AppTab.products)

                SettingsView()
                    .tabItem {
                        Label(AppTab.settings.title, systemImage: AppTab.settings.icon)
                    }
                    .tag(AppTab.settings)
            }
            .environmentObject(billingStore)
        }
        .tint(.appPrimary)
        .task {
            await billingStore.refreshIfNeeded()
        }
    }
}
