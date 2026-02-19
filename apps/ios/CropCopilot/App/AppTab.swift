//
//  AppTab.swift
//  CropCopilot
//

import Foundation

enum AppTab: String, CaseIterable, Identifiable {
    case dashboard
    case diagnose
    case recommendations
    case products
    case settings

    var id: String { rawValue }

    var title: String {
        switch self {
        case .dashboard:
            return "Dashboard"
        case .diagnose:
            return "Diagnose"
        case .recommendations:
            return "Recommendations"
        case .products:
            return "Products"
        case .settings:
            return "Settings"
        }
    }

    var icon: String {
        switch self {
        case .dashboard:
            return "house.fill"
        case .diagnose:
            return "camera.fill"
        case .recommendations:
            return "list.bullet.rectangle.fill"
        case .products:
            return "leaf.fill"
        case .settings:
            return "gearshape.fill"
        }
    }
}
