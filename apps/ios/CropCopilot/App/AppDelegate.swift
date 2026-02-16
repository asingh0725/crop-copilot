//
//  AppDelegate.swift
//  CropCopilot
//
//  Created by Claude Code on Phase 1
//

import UIKit
import UserNotifications

class AppDelegate: NSObject, UIApplicationDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        // Register for push notifications (will be implemented in Phase 3)
        // For now, just set up the foundation
        return true
    }

    // MARK: - Push Notifications (Phase 3)
    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        let token = deviceToken.map { String(format: "%02.2hhx", $0) }.joined()
        print("📱 Device token: \(token)")
        // TODO: Send token to backend in Phase 3
    }

    func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        print("❌ Failed to register for remote notifications: \(error)")
    }

    // MARK: - Deep Links
    func application(
        _ app: UIApplication,
        open url: URL,
        options: [UIApplication.OpenURLOptionsKey: Any] = [:]
    ) -> Bool {
        // Handle OAuth callbacks and deep links
        print("🔗 Opening URL: \(url)")

        // Supabase OAuth callback
        if url.scheme == "cropcopilot" && url.host == "auth" {
            // Will be handled by AuthViewModel
            NotificationCenter.default.post(name: .didReceiveAuthCallback, object: url)
            return true
        }

        return false
    }
}

// MARK: - Notification Names
extension Notification.Name {
    static let didReceiveAuthCallback = Notification.Name("didReceiveAuthCallback")
}
