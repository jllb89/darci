import SwiftUI

struct DocumentPhaseStatusCard: View {
    let document: DocumentReviewDocumentSummary?
    let output: DocumentReviewOutput?
    let principalName: String?
    @State private var segmentProgress: CGFloat = 0

    private var phase: DocumentPhaseStatus {
        DocumentPhaseStatus(document: document)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .firstTextBaseline) {
                Text(documentKindLabel)
                    .font(DARCiFont.maisonNeue(.book, size: 13))
                    .foregroundStyle(.white)
                    .lineLimit(1)
                    .minimumScaleFactor(0.72)

                Spacer(minLength: 12)

                Text(phase.label)
                    .font(DARCiFont.maisonNeue(.book, size: 9))
                    .foregroundStyle(.white)
                    .lineLimit(1)
            }

            HStack(spacing: 4) {
                ForEach(0..<5, id: \.self) { index in
                    GeometryReader { segmentProxy in
                        ZStack(alignment: .leading) {
                            Rectangle()
                                .fill(Color(red: 0.17, green: 0.17, blue: 0.17))

                            Rectangle()
                                .fill(DARCiTheme.onboardingGreen)
                                .frame(width: segmentProxy.size.width * segmentFillProgress(for: index))
                        }
                    }
                    .frame(height: 3)
                }
            }

            Text(documentMetaLabel)
                .font(DARCiFont.maisonNeue(.book, size: 9))
                .foregroundStyle(.white)
                .lineLimit(1)
                .minimumScaleFactor(0.74)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 14)
        .frame(maxWidth: .infinity, minHeight: 82, alignment: .leading)
        .background(Color.black)
        .clipShape(RoundedRectangle(cornerRadius: 13, style: .continuous))
        .onAppear(perform: animateSegments)
        .onChange(of: phase.completedSegmentCount) { _, _ in
            animateSegments()
        }
    }

    private func segmentFillProgress(for index: Int) -> CGFloat {
        guard phase.completedSegmentCount > 0 else {
            return 0
        }

        if index < phase.completedSegmentCount - 1 {
            return 1
        }

        if index == phase.completedSegmentCount - 1 {
            return segmentProgress
        }

        return 0
    }

    private func animateSegments() {
        segmentProgress = 0
        withAnimation(.timingCurve(0.12, 0.88, 0.25, 1.0, duration: 0.72)) {
            segmentProgress = 1
        }
    }

    private var documentKindLabel: String {
        let kind: String
        let key = [output?.outputKey, output?.outputLabel, document?.documentType]
            .compactMap { $0?.lowercased() }
            .joined(separator: " ")

        if key.contains("poa") || key.contains("power of attorney") {
            kind = "POA"
        } else if key.contains("trust") {
            kind = "TRUST"
        } else {
            kind = "DOCUMENT"
        }

        if let jurisdiction = document?.jurisdiction?.replacingOccurrences(of: "US-", with: "US/"), jurisdiction.isEmpty == false {
            return "\(kind) - \(jurisdiction)"
        }

        return kind
    }

    private var documentMetaLabel: String {
        let idLabel: String
        if let idn = document?.idn, idn.isEmpty == false {
            idLabel = idn
        } else if let id = document?.id, id.isEmpty == false {
            idLabel = "DOC-\(id.prefix(8).uppercased())"
        } else {
            idLabel = "DOC-PENDING"
        }

        if let principalName, principalName.isEmpty == false {
            return "\(idLabel) | PRINCIPAL: \(principalName.uppercased())"
        }

        return idLabel
    }
}

private struct DocumentPhaseStatus {
    let label: String
    let completedSegmentCount: Int

    init(document: DocumentReviewDocumentSummary?) {
        let status = document?.status?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let productFlowMode = document?.productFlowMode?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() ?? ""
        let documentType = document?.documentType?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() ?? ""
        let canContinueWithoutSignature = status == "pending_signature"
            && (productFlowMode == "notarize_document" || documentType == "notarize_document" || documentType == "uploaded_document")

        switch status {
        case "pending_signature":
            if canContinueWithoutSignature {
                label = "PENDING NOTARY SELECTION"
                completedSegmentCount = 3
            } else {
                label = "AWAITING SIGNATURES"
                completedSegmentCount = 2
            }
        case "pending_notary", "notary_review", "pending_notary_review":
            label = "AWAITING NOTARY REVIEW"
            completedSegmentCount = 3
        case let value where value?.contains("awaiting_in_person") == true || value?.contains("pending_in_person") == true:
            label = "AWAITING IN-PERSON SESSION"
            completedSegmentCount = 4
        case let value where value?.contains("in_person") == true:
            label = "IN-PERSON SESSION"
            completedSegmentCount = 1
        case "completed", "finalized", "complete":
            label = "DOCUMENT COMPLETED"
            completedSegmentCount = 5
        default:
            label = "DOCUMENT CREATED"
            completedSegmentCount = 1
        }
    }
}