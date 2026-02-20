//
//  SettingsView.swift
//  CropCopilot
//

import SwiftUI
import UIKit

struct SettingsView: View {
    @EnvironmentObject var authViewModel: AuthViewModel
    @State private var showVersionSheet = false
    @State private var settingsActionError: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 14) {
                    NavigationLink {
                        ProfileView()
                    } label: {
                        settingsRow(
                            title: "Profile",
                            subtitle: "Farm details and crops of interest",
                            icon: "person.crop.circle.fill",
                            showsChevron: true
                        )
                    }
                    .buttonStyle(.plain)

                    Button {
                        if !openSystemSettings() {
                            settingsActionError = "Could not open iOS Settings on this device."
                        }
                    } label: {
                        settingsRow(
                            title: "Notifications",
                            subtitle: "Open iOS Settings to manage notification permissions",
                            icon: "bell.badge.fill",
                            showsChevron: true
                        )
                    }
                    .buttonStyle(.plain)

                    Button {
                        showVersionSheet = true
                    } label: {
                        settingsRow(
                            title: "Version",
                            subtitle: Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0",
                            icon: "info.circle.fill",
                            showsChevron: true
                        )
                    }
                    .buttonStyle(.plain)

                    Button(role: .destructive) {
                        Task {
                            await authViewModel.signOut()
                        }
                    } label: {
                        HStack(spacing: 10) {
                            Image(systemName: "rectangle.portrait.and.arrow.right")
                                .font(.headline)
                            Text("Sign Out")
                                .font(.headline.weight(.semibold))
                            Spacer()
                        }
                        .foregroundStyle(.red)
                        .padding(14)
                        .antigravityGlass(cornerRadius: 16)
                    }
                    .buttonStyle(.plain)
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .padding(.bottom, 22)
            }
            .navigationTitle("Settings")
            .sheet(isPresented: $showVersionSheet) {
                versionSheet
                    .presentationDetents([.fraction(0.32), .medium])
            }
            .alert("Action unavailable", isPresented: Binding(
                get: { settingsActionError != nil },
                set: { if !$0 { settingsActionError = nil } }
            )) {
                Button("OK", role: .cancel) {
                    settingsActionError = nil
                }
            } message: {
                Text(settingsActionError ?? "Please try again.")
            }
        }
    }

    private func settingsRow(
        title: String,
        subtitle: String,
        icon: String,
        showsChevron: Bool
    ) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: icon)
                .font(.headline)
                .foregroundStyle(Color.appPrimary)
                .frame(width: 36, height: 36)
                .background(Color.appPrimary.opacity(0.14))
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))

            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.primary)

                Text(subtitle)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Spacer(minLength: 8)

            if showsChevron {
                Image(systemName: "chevron.right")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .antigravityGlass(cornerRadius: 16)
        .contentShape(Rectangle())
    }

    @ViewBuilder
    private var versionSheet: some View {
        let version = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0"
        let build = Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "1"

        VStack(alignment: .leading, spacing: 12) {
            Capsule()
                .fill(Color.secondary.opacity(0.35))
                .frame(width: 36, height: 5)
                .frame(maxWidth: .infinity, alignment: .center)
                .padding(.top, 8)

            Text("App Version")
                .font(.title3.weight(.semibold))
                .foregroundStyle(.primary)

            VStack(alignment: .leading, spacing: 8) {
                infoRow(label: "Version", value: version)
                infoRow(label: "Build", value: build)
            }
            .padding(12)
            .antigravityGlass(cornerRadius: 14)

            Spacer()
        }
        .padding(16)
    }

    private func infoRow(label: String, value: String) -> some View {
        HStack {
            Text(label)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.secondary)
            Spacer(minLength: 12)
            Text(value)
                .font(.subheadline)
                .foregroundStyle(.primary)
        }
    }

    private func openSystemSettings() -> Bool {
        guard let url = URL(string: UIApplication.openSettingsURLString) else {
            return false
        }
        guard UIApplication.shared.canOpenURL(url) else {
            return false
        }
        UIApplication.shared.open(url)
        return true
    }
}
