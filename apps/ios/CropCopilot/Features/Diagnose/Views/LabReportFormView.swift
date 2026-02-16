//
//  LabReportFormView.swift
//  CropCopilot
//
//  Created by Claude Code on Phase 2
//

import SwiftUI

struct LabReportFormView: View {
    @StateObject private var viewModel = LabReportViewModel()
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        Form {
            // Basic Info
            Section("Basic Information") {
                Picker("Crop", selection: $viewModel.crop) {
                    Text("Select crop...").tag("")
                    ForEach(viewModel.cropOptions, id: \.self) { crop in
                        Text(crop).tag(crop)
                    }
                }
                TextField("Location", text: $viewModel.location)
                TextField("Sample Date", text: $viewModel.sampleDate)
            }

            // pH & Organic Matter
            Section("pH & Organic Matter") {
                numericField("pH", value: $viewModel.pH, placeholder: "e.g. 6.5")
                numericField("Organic Matter (%)", value: $viewModel.organicMatter, placeholder: "e.g. 3.2")
            }

            // Primary Nutrients (NPK)
            Section("Primary Nutrients (ppm)") {
                numericField("Nitrogen (N)", value: $viewModel.nitrogen, placeholder: "ppm")
                numericField("Phosphorus (P)", value: $viewModel.phosphorus, placeholder: "ppm")
                numericField("Potassium (K)", value: $viewModel.potassium, placeholder: "ppm")
            }

            // Secondary Nutrients
            Section("Secondary Nutrients (ppm)") {
                numericField("Calcium (Ca)", value: $viewModel.calcium, placeholder: "ppm")
                numericField("Magnesium (Mg)", value: $viewModel.magnesium, placeholder: "ppm")
                numericField("Sulfur (S)", value: $viewModel.sulfur, placeholder: "ppm")
            }

            // Micronutrients
            Section("Micronutrients (ppm)") {
                numericField("Iron (Fe)", value: $viewModel.iron, placeholder: "ppm")
                numericField("Manganese (Mn)", value: $viewModel.manganese, placeholder: "ppm")
                numericField("Zinc (Zn)", value: $viewModel.zinc, placeholder: "ppm")
                numericField("Copper (Cu)", value: $viewModel.copper, placeholder: "ppm")
                numericField("Boron (B)", value: $viewModel.boron, placeholder: "ppm")
            }

            // Soil Properties
            Section("Soil Properties") {
                numericField("CEC (meq/100g)", value: $viewModel.cec, placeholder: "e.g. 15.0")
                numericField("Base Saturation (%)", value: $viewModel.baseSaturation, placeholder: "%")
                TextField("Soil Texture", text: $viewModel.soilTexture)
            }

            // Submit
            Section {
                Button {
                    Task { await viewModel.submitLabReport() }
                } label: {
                    if viewModel.isSubmitting {
                        HStack {
                            ProgressView()
                            Text(viewModel.submissionStatus)
                                .padding(.leading, 8)
                        }
                        .frame(maxWidth: .infinity)
                    } else {
                        Text("Submit Lab Report")
                            .frame(maxWidth: .infinity)
                            .bold()
                    }
                }
                .disabled(viewModel.isSubmitting || viewModel.crop.isEmpty)
            }

            if let error = viewModel.errorMessage {
                Section {
                    Text(error)
                        .foregroundColor(.red)
                        .font(.subheadline)
                }
            }
        }
        .navigationTitle("Lab Report")
        .navigationDestination(isPresented: $viewModel.showResult) {
            if let recId = viewModel.resultRecommendationId {
                DiagnosisResultView(recommendationId: recId)
            }
        }
    }

    private func numericField(_ label: String, value: Binding<String>, placeholder: String) -> some View {
        HStack {
            Text(label)
                .font(.subheadline)
            Spacer()
            TextField(placeholder, text: value)
                .keyboardType(.decimalPad)
                .multilineTextAlignment(.trailing)
                .frame(width: 100)
        }
    }
}
