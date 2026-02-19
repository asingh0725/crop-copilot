//
//  MotionManager.swift
//  CropCopilot
//
//  Created for Antigravity Revitalization
//

import SwiftUI
import CoreMotion

final class MotionManager: ObservableObject {
    private let manager = CMMotionManager()
    private var isUpdating = false
    
    @Published var pitch: Double = 0.0
    @Published var roll: Double = 0.0
    @Published var isEnabled = true
    
    init() {
        startMotionUpdates()
    }
    
    func startMotionUpdates() {
        guard isEnabled, manager.isDeviceMotionAvailable, !isUpdating else { return }
        
        manager.deviceMotionUpdateInterval = 1.0 / 60.0
        isUpdating = true
        manager.startDeviceMotionUpdates(to: .main) { [weak self] motion, error in
            guard let self, let motion else { return }
            guard error == nil else { return }
            
            withAnimation(.spring(response: 0.4, dampingFraction: 0.7, blendDuration: 0)) {
                self.pitch = motion.attitude.pitch
                self.roll = motion.attitude.roll
            }
        }
    }

    func setEnabled(_ value: Bool) {
        guard value != isEnabled else {
            return
        }

        isEnabled = value
        if value {
            startMotionUpdates()
        } else {
            stopMotionUpdates()
            withAnimation(.spring(response: 0.4, dampingFraction: 0.7, blendDuration: 0)) {
                pitch = 0
                roll = 0
            }
        }
    }

    private func stopMotionUpdates() {
        guard isUpdating else { return }
        manager.stopDeviceMotionUpdates()
        isUpdating = false
    }
    
    deinit {
        manager.stopDeviceMotionUpdates()
    }
}
