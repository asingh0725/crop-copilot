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
    @EnvironmentObject private var billingStore: BillingSnapshotStore
    @State private var isCurrentLocationLoading = false

    private var activeTier: SubscriptionTierId {
        billingStore.subscription?.planId ?? .growerFree
    }

    private var entitlements: DiagnoseInputEntitlements {
        activeTier.diagnoseInputEntitlements
    }

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
            }

            Section("Description") {
                TextEditor(text: $viewModel.description)
                    .frame(minHeight: 80)
            }

            if entitlements.canUsePlanningInputs {
                Section("Application Planning (Optional)") {
                    TextField("Field Acreage", text: $viewModel.fieldAcreage)
                        .keyboardType(.decimalPad)
                    TextField("Planned Application Date (YYYY-MM-DD)", text: $viewModel.plannedApplicationDate)
                }
            } else {
                Section {
                    Text("Upgrade to Grower to add field acreage and planned application date.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }

            if entitlements.canUsePreciseLocation {
                Section("Field Location (Grower Pro)") {
                    TextField("Address or landmark", text: $viewModel.locationLookupQuery)
                        .textInputAutocapitalization(.words)

                    Button(viewModel.isLocationLookupInFlight ? "Looking up..." : "Lookup Address") {
                        Task { await viewModel.lookupAddressCoordinates() }
                    }
                    .disabled(viewModel.isLocationLookupInFlight)

                    Button(isCurrentLocationLoading ? "Capturing Location..." : "Use Current Location") {
                        isCurrentLocationLoading = true
                        locationManager.requestCurrentCoordinate { result in
                            switch result {
                            case .success(let coordinate):
                                Task {
                                    await viewModel.applyCurrentCoordinates(
                                        latitude: coordinate.latitude,
                                        longitude: coordinate.longitude
                                    )
                                    isCurrentLocationLoading = false
                                }
                            case .failure(let error):
                                viewModel.errorMessage = error.localizedDescription
                                isCurrentLocationLoading = false
                            }
                        }
                    }
                    .disabled(isCurrentLocationLoading)

                    TextField("Latitude", text: $viewModel.fieldLatitude)
                        .keyboardType(.decimalPad)
                    TextField("Longitude", text: $viewModel.fieldLongitude)
                        .keyboardType(.decimalPad)
                }
            } else if entitlements.canUsePlanningInputs {
                Section {
                    Text("Grower Pro adds GPS/address location tools for spray-window guidance.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
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
        .onAppear {
            viewModel.applyTier(activeTier)
        }
        .onChange(of: activeTier) { newTier in
            viewModel.applyTier(newTier)
        }
    }
}

enum LocationHelperError: LocalizedError {
    case servicesDisabled
    case permissionDenied
    case noCoordinate

    var errorDescription: String? {
        switch self {
        case .servicesDisabled:
            return "Location services are disabled on this device."
        case .permissionDenied:
            return "Location permission is required to use current location."
        case .noCoordinate:
            return "Unable to read current location coordinates."
        }
    }
}

@MainActor
final class LocationHelper: NSObject, ObservableObject, @preconcurrency CLLocationManagerDelegate {
    private let manager = CLLocationManager()
    private var completion: ((Result<CLLocationCoordinate2D, Error>) -> Void)?

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyBest
    }

    func requestCurrentCoordinate(
        completion: @escaping (Result<CLLocationCoordinate2D, Error>) -> Void
    ) {
        guard CLLocationManager.locationServicesEnabled() else {
            completion(.failure(LocationHelperError.servicesDisabled))
            return
        }

        self.completion = completion
        let status = manager.authorizationStatus
        switch status {
        case .authorizedAlways, .authorizedWhenInUse:
            manager.requestLocation()
        case .notDetermined:
            manager.requestWhenInUseAuthorization()
        case .restricted, .denied:
            self.completion = nil
            completion(.failure(LocationHelperError.permissionDenied))
        @unknown default:
            self.completion = nil
            completion(.failure(LocationHelperError.permissionDenied))
        }
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        guard let completion else {
            return
        }

        switch manager.authorizationStatus {
        case .authorizedAlways, .authorizedWhenInUse:
            manager.requestLocation()
        case .restricted, .denied:
            self.completion = nil
            completion(.failure(LocationHelperError.permissionDenied))
        default:
            break
        }
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let completion else {
            return
        }

        self.completion = nil
        guard let location = locations.first?.coordinate else {
            completion(.failure(LocationHelperError.noCoordinate))
            return
        }
        completion(.success(location))
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        guard let completion else {
            return
        }
        self.completion = nil
        completion(.failure(error))
    }
}
