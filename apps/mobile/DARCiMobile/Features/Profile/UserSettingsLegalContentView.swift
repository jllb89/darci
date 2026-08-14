import SwiftUI

enum UserSettingsContentScreen: Equatable {
    case privacy
    case terms
    case faqs
}

private struct LegalSectionItem: Identifiable, Equatable {
    let id: String
    let number: String
    let title: String
    let body: String
}

private struct FAQItem: Identifiable, Equatable {
    let id: String
    let question: String
    let answer: String
}

struct UserSettingsLegalContentView: View {
    let screen: UserSettingsContentScreen
    let onBack: () -> Void
    let onContactSupport: () -> Void

    @State private var searchText = ""
    @State private var expandedFAQIDs: Set<String> = ["document-notarization"]

    private let accent = Color(red: 0.04, green: 1.0, blue: 0.29)
    private let secondaryText = Color(red: 0.66, green: 0.66, blue: 0.66)
    private let mutedText = Color(red: 0.47, green: 0.47, blue: 0.47)
    private let divider = Color(red: 0.18, green: 0.18, blue: 0.18)
    private let card = Color(red: 0.08, green: 0.08, blue: 0.08)
    private let input = Color(red: 0.11, green: 0.11, blue: 0.11)

    var body: some View {
        GeometryReader { proxy in
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 0) {
                    backButton
                        .padding(.top, 32)

                    switch screen {
                    case .privacy:
                        privacyContent
                    case .terms:
                        termsContent
                    case .faqs:
                        faqContent
                    }
                }
                .padding(.horizontal, 24)
                .padding(.bottom, 48 + proxy.safeAreaInsets.bottom)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .background(Color.black.ignoresSafeArea())
        .navigationTitle("")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.hidden, for: .navigationBar)
    }

    private var backButton: some View {
        Button(action: onBack) {
            DARCiArrowLeftIcon()
                .stroke(.white, style: StrokeStyle(lineWidth: 2.2, lineCap: .square, lineJoin: .miter))
                .frame(width: 24, height: 24)
                .frame(width: 34, height: 34, alignment: .leading)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Back to settings")
    }

    private var privacyContent: some View {
        VStack(alignment: .leading, spacing: 0) {
            titleBlock(title: "Privacy Policy", subtitle: "LAST UPDATED  AUG 11, 2026")
                .padding(.top, 42)

            HStack(spacing: 0) {
                accent
                    .frame(width: 3)
                    .clipShape(Capsule())

                VStack(alignment: .leading, spacing: 18) {
                    Text("Your data remains under your control.")
                        .font(DARCiFont.maisonNeue(.medium, size: 15))
                        .foregroundStyle(.white)
                        .lineSpacing(5)

                    Text("This summary explains what DARCI collects, why it is used, and the choices available to you.")
                        .font(DARCiFont.maisonNeue(.book, size: 12.5))
                        .foregroundStyle(secondaryText)
                        .lineSpacing(5.5)
                }
                .padding(.horizontal, 18)
                .padding(.vertical, 22)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(card)
            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            .padding(.top, 40)

            legalSections(privacySections)
                .padding(.top, 72)
        }
    }

    private var termsContent: some View {
        VStack(alignment: .leading, spacing: 0) {
            titleBlock(title: "Terms & Conditions", subtitle: "LAST UPDATED  AUG 11, 2026")
                .padding(.top, 42)

            Text("These terms describe the rules for using DARCI and its document services.")
                .font(DARCiFont.maisonNeue(.book, size: 13))
                .foregroundStyle(secondaryText)
                .lineSpacing(6)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 42)

            Rectangle()
                .fill(divider)
                .frame(height: 1)
                .padding(.top, 52)

            legalSections(termsSections, spacing: 64)
                .padding(.top, 42)

            Rectangle()
                .fill(divider)
                .frame(height: 1)
                .padding(.top, 68)

            Text("Interface copy for review. Final legal terms should be approved by qualified counsel.")
                .font(DARCiFont.maisonNeue(.book, size: 11.5))
                .foregroundStyle(mutedText)
                .lineSpacing(5.5)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 28)
        }
    }

    private var faqContent: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("FAQs")
                .font(DARCiFont.maisonNeue(.medium, size: 29))
                .foregroundStyle(.white)
                .padding(.top, 42)

            Text("Find quick answers about DARCI.")
                .font(DARCiFont.maisonNeue(.book, size: 13))
                .foregroundStyle(secondaryText)
                .lineSpacing(6)
                .padding(.top, 26)

            HStack(spacing: 14) {
                Image(systemName: "magnifyingglass")
                    .font(.system(size: 19, weight: .regular))
                    .foregroundStyle(secondaryText)

                TextField("Search questions", text: $searchText)
                    .font(DARCiFont.maisonNeue(.book, size: 13))
                    .foregroundStyle(.white)
                    .tint(accent)
                    .submitLabel(.search)
            }
            .padding(.horizontal, 17)
            .frame(height: 48)
            .background(input)
            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            .padding(.top, 39)

            VStack(spacing: 0) {
                Rectangle().fill(divider).frame(height: 1)
                ForEach(filteredFAQs) { item in
                    faqRow(item)
                }
            }
            .padding(.top, 48)

            supportCard
                .padding(.top, 88)
        }
    }

    private func titleBlock(title: String, subtitle: String) -> some View {
        VStack(alignment: .leading, spacing: 34) {
            Text(title)
                .font(DARCiFont.maisonNeue(.medium, size: 28))
                .foregroundStyle(.white)
                .lineLimit(2)
                .minimumScaleFactor(0.82)

            Text(subtitle)
                .font(DARCiFont.maisonNeue(.light, size: 10))
                .foregroundStyle(accent)
                .lineSpacing(4)
        }
    }

    private func legalSections(_ sections: [LegalSectionItem], spacing: CGFloat = 70) -> some View {
        VStack(alignment: .leading, spacing: spacing) {
            ForEach(sections) { section in
                HStack(alignment: .top, spacing: 34) {
                    Text(section.number)
                        .font(DARCiFont.maisonNeue(.light, size: 10))
                        .foregroundStyle(accent)
                        .frame(width: 32, alignment: .leading)
                        .padding(.top, 3)

                    VStack(alignment: .leading, spacing: 25) {
                        Text(section.title)
                            .font(DARCiFont.maisonNeue(.medium, size: 16))
                            .foregroundStyle(.white)
                            .lineSpacing(5)
                            .fixedSize(horizontal: false, vertical: true)

                        Text(section.body)
                            .font(DARCiFont.maisonNeue(.book, size: 12.5))
                            .foregroundStyle(secondaryText)
                            .lineSpacing(5.5)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
        }
    }

    private func faqRow(_ item: FAQItem) -> some View {
        let isExpanded = expandedFAQIDs.contains(item.id)

        return Button {
            if isExpanded {
                expandedFAQIDs.remove(item.id)
            } else {
                expandedFAQIDs.insert(item.id)
            }
        } label: {
            VStack(alignment: .leading, spacing: 0) {
                HStack(alignment: .center, spacing: 16) {
                    Text(item.question)
                        .font(DARCiFont.maisonNeue(.medium, size: 15))
                        .foregroundStyle(.white)
                        .lineSpacing(5)
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(maxWidth: .infinity, alignment: .leading)

                    Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                        .font(.system(size: 18, weight: .medium))
                        .foregroundStyle(.white)
                        .frame(width: 22, height: 22)
                }
                .padding(.vertical, 28)

                if isExpanded {
                    Text(item.answer)
                        .font(DARCiFont.maisonNeue(.book, size: 12.5))
                        .foregroundStyle(secondaryText)
                        .lineSpacing(5.5)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.bottom, 32)
                        .transition(.opacity)
                }

                Rectangle().fill(divider).frame(height: 1)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .animation(.easeInOut(duration: 0.18), value: isExpanded)
    }

    private var supportCard: some View {
        Button(action: onContactSupport) {
            HStack(alignment: .center, spacing: 16) {
                VStack(alignment: .leading, spacing: 18) {
                    Text("NEED MORE HELP?")
                        .font(DARCiFont.maisonNeue(.light, size: 10))
                        .foregroundStyle(accent)
                        .lineSpacing(4)

                    Text("Contact support")
                        .font(DARCiFont.maisonNeue(.medium, size: 14))
                        .foregroundStyle(.white)
                }

                Spacer(minLength: 12)

                Image(systemName: "chevron.right")
                    .font(.system(size: 19, weight: .medium))
                    .foregroundStyle(.white)
            }
            .padding(.horizontal, 28)
            .frame(height: 88)
            .background(card)
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("faqs-contact-support-button")
    }

    private var filteredFAQs: [FAQItem] {
        let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard query.isEmpty == false else { return faqs }
        return faqs.filter { item in
            item.question.lowercased().contains(query) || item.answer.lowercased().contains(query)
        }
    }
}

private let privacySections: [LegalSectionItem] = [
    LegalSectionItem(
        id: "privacy-data",
        number: "01",
        title: "Data we collect",
        body: "Account details, document activity, device information, and service interactions needed to operate DARCI."
    ),
    LegalSectionItem(
        id: "privacy-use",
        number: "02",
        title: "How we use data",
        body: "To provide the service, secure accounts, support requests, improve reliability, and meet legal obligations."
    ),
    LegalSectionItem(
        id: "privacy-documents",
        number: "03",
        title: "Documents and storage",
        body: "Access is limited by role and purpose. Retention and deletion follow service, security, and legal requirements."
    ),
    LegalSectionItem(
        id: "privacy-choices",
        number: "04",
        title: "Your choices",
        body: "You may review account details, manage permissions, request support, or ask about access and deletion."
    ),
]

private let termsSections: [LegalSectionItem] = [
    LegalSectionItem(
        id: "terms-acceptance",
        number: "01",
        title: "Acceptance of terms",
        body: "By creating an account or using DARCI, you agree to these terms and the policies referenced here."
    ),
    LegalSectionItem(
        id: "terms-services",
        number: "02",
        title: "DARCI services",
        body: "DARCI provides tools to prepare, manage, sign, and track document and notarization requests."
    ),
    LegalSectionItem(
        id: "terms-account",
        number: "03",
        title: "Account responsibilities",
        body: "Keep your account information accurate, protect your credentials, and review every document before submitting it."
    ),
    LegalSectionItem(
        id: "terms-payments",
        number: "04",
        title: "Documents and payments",
        body: "Service availability, fees, refunds, and completion depend on the request, participants, and applicable requirements."
    ),
]

private let faqs: [FAQItem] = [
    FAQItem(
        id: "what-is-darci",
        question: "What is DARCI?",
        answer: "DARCI is a secure document registration platform that protects, authenticates, and verifies important documents. Each registered document receives a unique DARCI Registration Number that can be used to verify its authenticity when needed."
    ),
    FAQItem(
        id: "document-registration",
        question: "How does document registration work?",
        answer: "Register your document with DARCI, where it is assigned a unique DARCI Registration Number and a secure registration record is created. Your document can then be authenticated through DARCI whenever verification is needed."
    ),
    FAQItem(
        id: "document-notarization",
        question: "How does document notarization work?",
        answer: "Choose a document, confirm the participants, and follow the guided steps. DARCI keeps the request status visible from start to completion."
    ),
    FAQItem(
        id: "attorney",
        question: "Do I need an attorney?",
        answer: "No. You do not need an attorney to register a document with DARCI. If you need legal advice or assistance preparing a document, you should consult a qualified attorney."
    ),
    FAQItem(
        id: "trust-registration",
        question: "Why should I register my trust?",
        answer: "Registering your trust helps protect your intentions. DARCI maintains a registration record for your trust, helping protect it from fraud, unauthorized changes, and confusion over which version is the most current."
    ),
    FAQItem(
        id: "trust-storage",
        question: "Does DARCI store my trust?",
        answer: "Yes. Your registered trust is securely stored within the DARCI platform. Your document is only accessible to authorized users and is not publicly available."
    ),
    FAQItem(
        id: "dynamic-poa",
        question: "What makes a Dynamic POA different?",
        answer: "A DARCI Dynamic POA can be verified through DARCI to help confirm that the document is authentic and current. It gives financial institutions and other third parties greater confidence when relying on a Power of Attorney."
    ),
    FAQItem(
        id: "bank-verification",
        question: "How do banks verify my POA?",
        answer: "Authorized parties can verify a registered Power of Attorney through DARCI using its unique verification information. Verification helps confirm the document's authenticity and registration status."
    ),
    FAQItem(
        id: "poa-revoke",
        question: "What happens if I revoke my POA?",
        answer: "If you revoke your registered Power of Attorney, you can create a new POA in DARCI. Future verifications will reflect the most current registration information."
    ),
    FAQItem(
        id: "poa-after-death",
        question: "Does a POA remain valid after death?",
        answer: "No. A Power of Attorney automatically ends when the principal dies. After death, authority is determined by the individual's estate plan and applicable law."
    ),
    FAQItem(
        id: "cancel-request",
        question: "Can I update or cancel a request?",
        answer: "Some request details may be updated while the request is still in progress. If a request is already assigned, signed, or completed, contact support so DARCI can help review the available options."
    ),
    FAQItem(
        id: "completed-documents",
        question: "Where can I download completed documents?",
        answer: "Completed documents are available from your DARCI document list and request details after signing, notarization, or registration is complete."
    ),
    FAQItem(
        id: "information-protected",
        question: "How is my information protected?",
        answer: "DARCI limits access by role and purpose, uses technical and administrative safeguards, and does not make your documents publicly available. Public verification is limited to registration and authenticity information."
    ),
    FAQItem(
        id: "document-access",
        question: "Who can see my documents?",
        answer: "Only you and the individuals you authorize can access your registered documents. Your documents are not available to the public."
    ),
    FAQItem(
        id: "identity-verification",
        question: "How is my identity verified?",
        answer: "DARCI uses identity verification measures during registration to help protect your account and the integrity of registered documents."
    ),
    FAQItem(
        id: "public-information",
        question: "What information is publicly visible?",
        answer: "Public verification is limited to confirming registration and authenticity. Your document and personal information are not publicly displayed."
    ),
    FAQItem(
        id: "registration-number",
        question: "What is a DARCI Registration Number?",
        answer: "A DARCI Registration Number is the unique identifier assigned to each registered document. It is used to support authentication and verification through the DARCI platform."
    ),
    FAQItem(
        id: "verify-document",
        question: "How does someone verify my document?",
        answer: "Authorized parties can verify a registered document through DARCI using its unique verification information. Verification confirms the document's registration and authenticity."
    ),
    FAQItem(
        id: "anyone-verify",
        question: "Can anyone verify a document?",
        answer: "Verification is available only to individuals with the appropriate verification information. Verification does not provide public access to your document."
    ),
    FAQItem(
        id: "pricing",
        question: "Where can I find your current pricing?",
        answer: "Current pricing is available on the Pricing page, where you can find the latest information on available services and plans."
    ),
    FAQItem(
        id: "supported-states",
        question: "Which states are currently supported?",
        answer: "State availability continues to expand. Visit the DARCI website for the most current list of supported states and available services."
    ),
    FAQItem(
        id: "paper-documents",
        question: "Do I still need paper?",
        answer: "Not always. Where permitted by law, documents can be electronically signed and electronically notarized without printing or scanning."
    ),
    FAQItem(
        id: "illuminotary",
        question: "What is an illuminotary?",
        answer: "An illuminotary is a commissioned notary who uses illuminote's platform to perform secure In-Person Electronic Notarizations, using electronic signatures and electronic notary seals where permitted by state law."
    ),
    FAQItem(
        id: "ipen",
        question: "What is IPEN?",
        answer: "IPEN stands for In-Person Electronic Notarization. It allows a document to be signed and notarized electronically while the signer and notary are physically together."
    ),
    FAQItem(
        id: "legal-advice",
        question: "Is this legal advice?",
        answer: "No. DARCI provides document registration and verification services, not legal advice. If you have legal questions, you should consult a qualified attorney."
    ),
    FAQItem(
        id: "registration-attorney",
        question: "Does registration replace an attorney?",
        answer: "No. Registering a document does not replace legal advice or document preparation by an attorney. DARCI helps protect and verify documents after they have been created."
    ),
    FAQItem(
        id: "law-changes",
        question: "What happens if state laws change?",
        answer: "DARCI continually monitors changes in applicable laws and updates the platform as needed to maintain compliance in supported jurisdictions."
    ),
]