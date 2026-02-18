//
//  AppRootView.swift
//  CropCopilot
//

import SwiftUI

struct AppRootView: View {
    @State private var selectedTab: AppTab = .dashboard

    var body: some View {
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

            ProductsPlaceholderView()
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
        .tint(.appPrimary)
    }
}

private struct ProductsPlaceholderView: View {
    var body: some View {
        NavigationStack {
            VStack(spacing: 16) {
                Image(systemName: "shippingbox.fill")
                    .font(.system(size: 48))
                    .foregroundStyle(Color.appPrimary)
                Text("Products")
                    .font(.title3.bold())
                Text("Product catalog is being aligned with the AWS runtime.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 24)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Color.appBackground)
            .navigationTitle("Products")
        }
    }
}
