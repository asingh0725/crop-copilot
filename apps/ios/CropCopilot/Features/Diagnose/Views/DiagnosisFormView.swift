//
//  DiagnosisFormView.swift
//  CropCopilot
//
//  Created by Claude Code on Phase 2
//

import SwiftUI
import CoreLocation

struct DiagnosisFormView: View {
    let capturedImage: UIImage
    @StateObject private var viewModel = DiagnosisViewModel()
    @StateObject private var locationManager = LocationHelper()
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        Form {
            Section {
                Image(uiImage: capturedImage)
                    .resizable()
                    .scaledToFit()
                    .frame(maxHeight: 200)
                    .cornerRadius(12)
                    .frame(maxWidth: .infinity)
            }

            Section("Crop Information") {
                Picker("Crop", selection: $viewModel.selectedCrop) {
                    Text("Select crop...").tag("")
                    ForEach(viewModel.cropOptions, id: \.value) { crop in
                        Text(crop.label).tag(crop.value)
                    }
                }

                Picker("Growth Stage", selection: $viewModel.growthStage) {
                    Text("Select stage (optional)").tag("")
                    ForEach(viewModel.growthStageOptions, id: \.self) { stage in
                        Text(stage).tag(stage)
                    }
                }
            }

            Section("Location") {
                Picker("Location", selection: $viewModel.location) {
                    Text("Select location...").tag("")
                    ForEach(AppConstants.allLocations, id: \.self) { loc in
                        Text(loc).tag(loc)
                    }
                }
                .onAppear {
                    if viewModel.location.isEmpty, let loc = locationManager.locationString,
                       AppConstants.allLocations.contains(loc) {
                        viewModel.location = loc
                    }
                }
            }

            Section("Description") {
                TextEditor(text: $viewModel.description)
                    .frame(minHeight: 80)
            }

            Section {
                Button {
                    Task {
                        await viewModel.submitPhotoDiagnosis(image: capturedImage)
                    }
                } label: {
                    if viewModel.isSubmitting {
                        HStack {
                            ProgressView()
                            Text(viewModel.submissionStatus)
                                .padding(.leading, 8)
                        }
                        .frame(maxWidth: .infinity)
                    } else {
                        Text("Submit for Analysis")
                            .frame(maxWidth: .infinity)
                            .bold()
                    }
                }
                .disabled(viewModel.isSubmitting || viewModel.selectedCrop.isEmpty)
            }

            if let error = viewModel.errorMessage {
                Section {
                    Text(error)
                        .foregroundColor(.red)
                        .font(.subheadline)
                }
            }
        }
        .navigationTitle("Diagnosis Details")
        .navigationDestination(isPresented: $viewModel.showResult) {
            if let recId = viewModel.resultRecommendationId {
                DiagnosisResultView(recommendationId: recId)
            }
        }
    }
}

// MARK: - Location Helper
class LocationHelper: NSObject, ObservableObject, CLLocationManagerDelegate {
    @Published var locationString: String?
    private let manager = CLLocationManager()

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyKilometer
        manager.requestWhenInUseAuthorization()
        manager.requestLocation()
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.first else { return }
        let geocoder = CLGeocoder()
        geocoder.reverseGeocodeLocation(location) { [weak self] placemarks, _ in
            if let placemark = placemarks?.first, let state = placemark.administrativeArea {
                DispatchQueue.main.async {
                    self?.locationString = state
                }
            }
        }
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        // Location not critical, silently fail
    }
}
