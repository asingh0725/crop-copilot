//
//  SettingsView.swift
//  CropCopilot
//

import SwiftUI

struct SettingsView: View {
    @EnvironmentObject var authViewModel: AuthViewModel

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
                            icon: "person.crop.circle.fill"
                        )
                    }
                    .buttonStyle(.plain)

                    settingsRow(
                        title: "Notifications",
                        subtitle: "Push preference controls are coming in a follow-up update",
                        icon: "bell.badge.fill"
                    )

                    settingsRow(
                        title: "Version",
                        subtitle: Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0",
                        icon: "info.circle.fill"
                    )

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
        }
    }

    private func settingsRow(title: String, subtitle: String, icon: String) -> some View {
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

            Image(systemName: "chevron.right")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .antigravityGlass(cornerRadius: 16)
    }
}
