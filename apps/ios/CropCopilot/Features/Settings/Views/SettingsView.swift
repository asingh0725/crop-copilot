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
                VStack(spacing: Spacing.lg) {
                    accountHeader
                    settingsSection
                    dangerZone
                }
                .padding(.horizontal, Spacing.lg)
                .padding(.vertical, Spacing.md)
                .padding(.bottom, Spacing.xxl)
            }
            .navigationTitle("Settings")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    CreditsBalanceChip()
                }
            }
        }
    }

    // MARK: - Account Header

    private var accountHeader: some View {
        HStack(spacing: Spacing.lg) {
            // Avatar circle
            ZStack {
                Circle()
                    .fill(
                        LinearGradient(
                            colors: [Color.appEarth800, Color.appEarth900],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(width: 56, height: 56)
                    .overlay(
                        Circle()
                            .stroke(Color.appPrimary.opacity(0.40), lineWidth: 2)
                    )

                Image(systemName: "person.fill")
                    .font(.title2)
                    .foregroundStyle(.white.opacity(0.85))
            }

            VStack(alignment: .leading, spacing: 3) {
                Text("Account")
                    .font(.title3.weight(.bold))
                    .foregroundStyle(.white)
                Text("Manage your profile and preferences")
                    .font(.caption)
                    .foregroundStyle(.white.opacity(0.68))
            }

            Spacer()
        }
        .padding(Spacing.lg)
        .background(
            LinearGradient(
                stops: [
                    .init(color: Color.appEarth950, location: 0),
                    .init(color: Color.appEarth900, location: 1),
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        )
        .clipShape(RoundedRectangle(cornerRadius: CornerRadius.xl, style: .continuous))
        .overlay(alignment: .top) {
            LinearGradient(
                colors: [.clear, Color.appPrimary.opacity(0.45), .clear],
                startPoint: .leading,
                endPoint: .trailing
            )
            .frame(height: 1.5)
            .padding(.horizontal, CornerRadius.xl)
        }
        .overlay(
            RoundedRectangle(cornerRadius: CornerRadius.xl, style: .continuous)
                .stroke(Color.appPrimary.opacity(0.10), lineWidth: 1)
        )
        .shadow(color: Color.appPrimary.opacity(0.10), radius: 16, x: 0, y: 6)
        .shadow(color: .black.opacity(0.18), radius: 10, x: 0, y: 4)
    }

    // MARK: - Settings Section

    private var settingsSection: some View {
        VStack(spacing: Spacing.sm) {
            SectionHeader(title: "Preferences")
                .padding(.bottom, 2)

            NavigationLink {
                ProfileView()
            } label: {
                settingsRow(
                    title: "Profile",
                    subtitle: "Farm details and crops of interest",
                    icon: "person.crop.circle.fill",
                    color: .appPrimary
                )
            }
            .buttonStyle(.plain)

            settingsRow(
                title: "Notifications",
                subtitle: "Push preference controls coming soon",
                icon: "bell.badge.fill",
                color: .semanticWarning,
                showChevron: false
            )

            settingsRow(
                title: "Version",
                subtitle: Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0",
                icon: "info.circle.fill",
                color: .semanticInfo,
                showChevron: false
            )
        }
    }

    // MARK: - Danger Zone

    private var dangerZone: some View {
        VStack(spacing: Spacing.sm) {
            SectionHeader(title: "Account Actions")
                .padding(.bottom, 2)

            Button(role: .destructive) {
                Task { await authViewModel.signOut() }
            } label: {
                HStack(spacing: Spacing.md) {
                    IconBadge(
                        icon: "rectangle.portrait.and.arrow.right",
                        color: Color.semanticError,
                        size: 36,
                        cornerRadius: 10
                    )

                    VStack(alignment: .leading, spacing: 2) {
                        Text("Sign Out")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(Color.semanticError)
                        Text("You will be returned to the login screen")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }

                    Spacer()

                    Image(systemName: "chevron.right")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(Spacing.md)
                .antigravityGlass(cornerRadius: CornerRadius.lg)
                .overlay(
                    RoundedRectangle(cornerRadius: CornerRadius.lg, style: .continuous)
                        .stroke(Color.semanticError.opacity(0.18), lineWidth: 1)
                )
            }
            .buttonStyle(.plain)
        }
    }

    // MARK: - Row

    private func settingsRow(
        title: String,
        subtitle: String,
        icon: String,
        color: Color,
        showChevron: Bool = true
    ) -> some View {
        HStack(alignment: .center, spacing: Spacing.md) {
            IconBadge(icon: icon, color: color, size: 36, cornerRadius: 10)

            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.primary)
                Text(subtitle)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Spacer(minLength: Spacing.sm)

            if showChevron {
                Image(systemName: "chevron.right")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Spacing.md)
        .antigravityGlass(cornerRadius: CornerRadius.lg)
    }
}
