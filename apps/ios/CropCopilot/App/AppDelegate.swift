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
        let tabAppearance = UITabBarAppearance()
        tabAppearance.configureWithOpaqueBackground()
        tabAppearance.backgroundColor = UIColor.white.withAlphaComponent(0.98)
        tabAppearance.shadowColor = UIColor.black.withAlphaComponent(0.08)

        UITabBar.appearance().standardAppearance = tabAppearance
        if #available(iOS 15.0, *) {
            UITabBar.appearance().scrollEdgeAppearance = tabAppearance
        }

        return true
    }

    // MARK: - Push Notifications (Phase 3)
    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        let token = deviceToken.map { String(format: "%02.2hhx", $0) }.joined()
        // TODO: Send token to backend for push notification registration
    }

    func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        _ = error // registration failure is silently ignored; push notifications are optional
    }

    // MARK: - Deep Links
    func application(
        _ app: UIApplication,
        open url: URL,
        options: [UIApplication.OpenURLOptionsKey: Any] = [:]
    ) -> Bool {
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
