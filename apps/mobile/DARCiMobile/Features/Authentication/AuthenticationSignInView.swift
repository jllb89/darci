import SwiftUI

#if canImport(UIKit)
import UIKit
#endif

struct AuthenticationSignInContent: Equatable {
    let brand: String
    let headline: String
    let supportingText: String
    let countryCode: String
    let phonePlaceholder: String
    let emailPlaceholder: String
    let continueTitle: String
    let verifyCodeTitle: String
    let completeInfoTitle: String
    let nameTitle: String
    let lastNameTitle: String
    let emailFieldTitle: String
    let phoneNumberTitle: String
    let successTitle: String
    let emailTitle: String
    let phoneTitle: String
    let browseTitle: String

    var accessibilityHeadline: String {
        headline.replacingOccurrences(of: "\n", with: " ")
    }

    var accessibilitySupportingText: String {
        supportingText.replacingOccurrences(of: "\n", with: " ")
    }

    static let signIn = AuthenticationSignInContent(
        brand: "DARCi",
        headline: "Welcome\nSign in",
        supportingText: "To access the app,\ncontinue below.",
        countryCode: "+1",
        phonePlaceholder: "Enter your phone number.",
        emailPlaceholder: "Enter your email here",
        continueTitle: "Continue",
        verifyCodeTitle: "Verify code",
        completeInfoTitle: "Please complete the following information:",
        nameTitle: "Name",
        lastNameTitle: "Last name",
        emailFieldTitle: "Email",
        phoneNumberTitle: "Phone number",
        successTitle: "Welcome to DARCi!",
        emailTitle: "Use email instead.",
        phoneTitle: "Use phone number instead.",
        browseTitle: "I just want to browse the app."
    )
}

struct PhoneCountryPickerSheet: View {
    let countries: [PhoneCountry]
    let selectedCountry: PhoneCountry
    let onSelect: (PhoneCountry) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var searchText = ""

    private var filteredCountries: [PhoneCountry] {
        let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard query.isEmpty == false else { return countries }

        return countries.filter { country in
            country.name.lowercased().contains(query)
                || country.id.lowercased().contains(query)
                || country.dialCode.contains(query)
        }
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                TextField("Search country or code", text: $searchText)
                    .font(DARCiFont.maisonNeue(.book, size: 17))
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .padding(.horizontal, 16)
                    .frame(height: 52)
                    .background(Color(red: 0.94, green: 0.94, blue: 0.94))
                    .padding(.horizontal, 20)
                    .padding(.top, 12)

                ScrollView {
                    LazyVStack(spacing: 0) {
                        ForEach(filteredCountries) { country in
                            Button {
                                onSelect(country)
                                dismiss()
                            } label: {
                                HStack(spacing: 14) {
                                    VStack(alignment: .leading, spacing: 4) {
                                        Text(country.name)
                                            .font(DARCiFont.maisonNeue(.book, size: 17))
                                            .foregroundStyle(.black)

                                        Text(country.id)
                                            .font(DARCiFont.maisonNeue(.book, size: 11))
                                            .foregroundStyle(.black.opacity(0.52))
                                    }

                                    Spacer(minLength: 12)

                                    Text(country.dialCode)
                                        .font(DARCiFont.maisonNeue(.book, size: 16))
                                        .foregroundStyle(.black)

                                    if country.id == selectedCountry.id {
                                        Image(systemName: "checkmark")
                                            .font(.system(size: 14, weight: .semibold))
                                            .foregroundStyle(.black)
                                    }
                                }
                                .padding(.horizontal, 20)
                                .frame(minHeight: 62)
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)

                            Divider()
                                .padding(.leading, 20)
                        }
                    }
                    .padding(.top, 12)
                }
            }
            .background(.white)
            .navigationTitle("Country code")
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}

struct AuthenticationSignInView: View {
    private let designSize = CGSize(width: 440, height: 956)
    private let bottomGroupLift: CGFloat = 24

    private enum Field {
        case phone
        case email
        case otp
        case profileName
        case profileLastName
        case profileEmail
        case profilePhone
    }

    private enum InputMode {
        case phone
        case email
    }

    private enum AuthenticationStep {
        case entry
        case otp
        case completeInfo
        case success
    }

    let content: AuthenticationSignInContent
    var onBrowse: () -> Void = {}

    @StateObject private var viewModel: AuthenticationViewModel

    init(
        content: AuthenticationSignInContent,
        viewModel: AuthenticationViewModel = AuthenticationViewModel(),
        onBrowse: @escaping () -> Void = {}
    ) {
        self.content = content
        self.onBrowse = onBrowse
        _viewModel = StateObject(wrappedValue: viewModel)
    }

    private let otpBoxLayout: [(x: CGFloat, width: CGFloat)] = [
        (-174.5, 45),
        (-124.5, 43),
        (-75, 44),
        (-25.5, 43),
        (23.5, 43),
        (73, 44),
        (122.5, 43),
        (172.5, 45)
    ]

    @State private var phoneNumber = ""
    @State private var selectedPhoneCountry = PhoneNumberFormatting.defaultCountry
    @State private var emailAddress = ""
    @State private var otpCode = ""
    @State private var profileName = ""
    @State private var profileLastName = ""
    @State private var profileEmail = ""
    @State private var profilePhone = ""
    @State private var isPhoneCountryPickerPresented = false
    @State private var visibleItemCount = 0
    @State private var activeInputMode: InputMode?
    @State private var authenticationStep: AuthenticationStep = .entry
    @State private var isEmailPlaceholderVisible = false
    @State private var isEntryFadingForOTP = false
    @State private var isHeadlineCollapsed = false
    @FocusState private var focusedField: Field?

    var body: some View {
        ZStack {
            (authenticationStep == .entry ? DARCiTheme.onboardingGreen : Color.black)
                .ignoresSafeArea()

            GeometryReader { proxy in
                if authenticationStep == .otp {
                    otpView(in: proxy)
                        .transition(.opacity)
                } else if authenticationStep == .completeInfo {
                    completeInfoView(in: proxy)
                        .transition(.opacity)
                } else if authenticationStep == .success {
                    successView(in: proxy)
                        .transition(.opacity)
                } else {
                    ZStack {
                    Text(content.brand)
                        .font(DARCiFont.maisonNeue(.medium, size: scaled(24, in: proxy)))
                        .tracking(0.24)
                        .lineSpacing(scaled(4.8, in: proxy))
                        .foregroundStyle(.black)
                        .position(x: proxy.size.width / 2 + scaled(-160, in: proxy), y: proxy.size.height / 2 + scaled(-363.5, in: proxy))
                        .revealOrder(0, visibleItemCount: visibleItemCount, scale: scale(in: proxy))

                        if isCompactInputActive {
                            Button(action: resetInputLayout) {
                                DARCiArrowLeftIcon()
                                    .stroke(.black, style: StrokeStyle(lineWidth: scaled(2.0625, in: proxy), lineCap: .butt, lineJoin: .miter))
                                    .frame(width: scaled(21, in: proxy), height: scaled(21, in: proxy))
                            }
                            .buttonStyle(.plain)
                            .frame(width: scaled(44, in: proxy), height: scaled(44, in: proxy))
                            .contentShape(Rectangle())
                            .accessibilityLabel("Back")
                            .accessibilityIdentifier("auth-input-back-button")
                            .position(x: proxy.size.width / 2 + scaled(174, in: proxy), y: proxy.size.height / 2 + scaled(-363.5, in: proxy))
                            .transition(.opacity)
                        }

                    if !isHeadlineCollapsed {
                        (Text("Welcome\n")
                            .font(DARCiFont.maisonNeue(.light, size: scaled(64, in: proxy)))
                        + Text("Sign in")
                            .font(DARCiFont.maisonNeue(.book, size: scaled(64, in: proxy))))
                            .lineSpacing(scaled(6.4, in: proxy))
                            .foregroundStyle(.black)
                            .fixedSize(horizontal: false, vertical: true)
                            .accessibilityLabel(content.accessibilityHeadline)
                            .position(x: proxy.size.width / 2 + scaled(-59.5, in: proxy), y: proxy.size.height / 2 + scaled(-152, in: proxy))
                            .revealOrder(1, visibleItemCount: visibleItemCount, scale: scale(in: proxy))
                            .transition(.opacity)
                    }

                    Text(content.supportingText)
                        .font(DARCiFont.maisonNeue(.book, size: scaled(22, in: proxy)))
                        .lineSpacing(scaled(2.4, in: proxy))
                        .foregroundStyle(.black)
                        .frame(width: scaled(395, in: proxy), alignment: .leading)
                        .accessibilityLabel(content.accessibilitySupportingText)
                        .position(x: proxy.size.width / 2 + scaled(0.5, in: proxy), y: proxy.size.height / 2 + scaled(supportingTextY, in: proxy))
                        .revealOrder(2, visibleItemCount: visibleItemCount, scale: scale(in: proxy))

                    activeInput(in: proxy)
                        .position(x: proxy.size.width / 2 + scaled(0.5, in: proxy), y: proxy.size.height / 2 + scaled(inputY, in: proxy))
                        .revealOrder(3, visibleItemCount: visibleItemCount, scale: scale(in: proxy))

                    continueButton(in: proxy)
                        .position(x: proxy.size.width / 2 + scaled(0.5, in: proxy), y: proxy.size.height / 2 + scaled(continueButtonY, in: proxy))
                        .revealOrder(4, visibleItemCount: visibleItemCount, scale: scale(in: proxy))

                    if shouldShowSmsDisclosure {
                        smsConsentDisclosure(in: proxy)
                            .position(x: proxy.size.width / 2 + scaled(0.5, in: proxy), y: proxy.size.height / 2 + scaled(smsDisclosureY, in: proxy))
                            .revealOrder(5, visibleItemCount: visibleItemCount, scale: scale(in: proxy))
                            .transition(.opacity)
                    }

                    if let feedbackMessage = viewModel.feedbackMessage {
                        Text(feedbackMessage)
                            .font(DARCiFont.maisonNeue(.book, size: scaled(13, in: proxy)))
                            .lineSpacing(scaled(1.3, in: proxy))
                            .foregroundStyle(.black)
                            .frame(width: scaled(395, in: proxy), alignment: .leading)
                            .accessibilityIdentifier("auth-feedback-message")
                            .position(x: proxy.size.width / 2 + scaled(0.5, in: proxy), y: proxy.size.height / 2 + scaled(entryFeedbackY, in: proxy))
                            .transition(.opacity)
                    }

                    Button(action: toggleInputMode) {
                        Text(inputModeSwitchTitle)
                            .font(DARCiFont.maisonNeue(.book, size: scaled(14, in: proxy)))
                            .lineSpacing(scaled(1.4, in: proxy))
                            .underline()
                            .foregroundStyle(.black)
                    }
                    .buttonStyle(.plain)
                    .frame(width: scaled(395, in: proxy), alignment: .leading)
                    .position(x: proxy.size.width / 2 + scaled(0.5, in: proxy), y: proxy.size.height / 2 + scaled(emailLinkY, in: proxy))
                    .revealOrder(6, visibleItemCount: visibleItemCount, scale: scale(in: proxy))

                    if !isCompactInputActive {
                        Button(action: onBrowse) {
                            Text(content.browseTitle)
                                .font(DARCiFont.maisonNeue(.book, size: scaled(14, in: proxy)))
                                .lineSpacing(scaled(1.4, in: proxy))
                                .foregroundStyle(.black)
                        }
                        .buttonStyle(.plain)
                        .position(x: proxy.size.width / 2 + scaled(-101.5, in: proxy), y: proxy.size.height / 2 + scaled(browseButtonY, in: proxy))
                        .revealOrder(7, visibleItemCount: visibleItemCount, scale: scale(in: proxy))
                        .transition(.opacity)
                    }
                }
                .opacity(isEntryFadingForOTP ? 0 : 1)
                }
            }
            .ignoresSafeArea()
        }
        .preferredColorScheme(.light)
        .ignoresSafeArea(.keyboard)
        .accessibilityIdentifier("authentication-sign-in")
        .onAppear(perform: startIntroAnimation)
        .onChange(of: focusedField) { _, newField in
            if newField == .phone {
                activatePhoneInputLayout()
            } else if newField == .email {
                activateEmailInputLayout()
            }
        }
        .onChange(of: otpCode) { _, newValue in
            let sanitized = String(newValue.filter(\.isNumber).prefix(otpBoxLayout.count))

            if sanitized != newValue {
                otpCode = sanitized
            }
        }
        .sheet(isPresented: $isPhoneCountryPickerPresented) {
                PhoneCountryPickerSheet(
                    countries: PhoneNumberFormatting.countries,
                selectedCountry: selectedPhoneCountry
            ) { country in
                selectedPhoneCountry = country
                phoneNumber = PhoneNumberFormatting.formattedNationalNumber(phoneNumber, country: country)
                focusedField = .phone
                activatePhoneInputLayout()
            }
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
        }
    }

    private var isCompactInputActive: Bool {
        activeInputMode != nil
    }

    private var inputModeSwitchTitle: String {
        activeInputMode == .email ? content.phoneTitle : content.emailTitle
    }

    private var supportingTextY: CGFloat {
        isCompactInputActive ? -285 : 205 - bottomGroupLift
    }

    private var inputY: CGFloat {
        isCompactInputActive ? -220 : 270 - bottomGroupLift
    }

    private var continueButtonY: CGFloat {
        isCompactInputActive ? -155 : 335 - bottomGroupLift
    }

    private var shouldShowSmsDisclosure: Bool {
        activeInputMode != .email
    }

    private var smsDisclosureY: CGFloat {
        isCompactInputActive ? -56 : 407 - bottomGroupLift
    }

    private var emailLinkY: CGFloat {
        if shouldShowSmsDisclosure {
            return isCompactInputActive ? 14 : 462 - bottomGroupLift
        }

        return isCompactInputActive ? -102.5 : 387.5 - bottomGroupLift
    }

    private var browseButtonY: CGFloat {
        shouldShowSmsDisclosure ? 485 - bottomGroupLift : 432.5 - bottomGroupLift
    }

    private var entryFeedbackY: CGFloat {
        isCompactInputActive ? -121 : 371 - bottomGroupLift
    }

    private var isEmailVerified: Bool {
        viewModel.verifiedContactMethod == .email
    }

    private var isPhoneVerified: Bool {
        viewModel.verifiedContactMethod == .phone
    }

    private var resolvedProfileEmail: String {
        isEmailVerified ? viewModel.verifiedEmailAddress : profileEmail
    }

    private var resolvedProfilePhone: String {
        isPhoneVerified ? viewModel.verifiedPhoneNumber : profilePhone
    }

    private var currentInputMethod: AuthIdentifierMethod {
        activeInputMode == .email ? .email : .phone
    }

    private var currentRawIdentifier: String {
        activeInputMode == .email ? emailAddress : PhoneNumberFormatting.e164(phoneNumber, country: selectedPhoneCountry) ?? ""
    }

    private var isCompleteInfoReady: Bool {
        let hasName = profileName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false
        let hasLastName = profileLastName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false
        let hasRequiredContact = isEmailVerified
            ? profilePhone.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false
            : profileEmail.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false

        return hasName && hasLastName && hasRequiredContact
    }

    @ViewBuilder
    private func activeInput(in proxy: GeometryProxy) -> some View {
        if activeInputMode == .email {
            emailInput(in: proxy)
        } else {
            phoneInput(in: proxy)
        }
    }

    private func phoneInput(in proxy: GeometryProxy) -> some View {
        ZStack {
            VStack(spacing: scaled(46.5, in: proxy)) {
                separator(in: proxy)
                separator(in: proxy)
            }

            HStack(spacing: 0) {
                phoneCountrySelector(in: proxy)

                Spacer()
                    .frame(width: scaled(14, in: proxy))

                TextField("", text: $phoneNumber, prompt: Text(content.phonePlaceholder).foregroundStyle(Color.black.opacity(0.26)))
                    .font(DARCiFont.maisonNeue(.light, size: scaled(18, in: proxy)))
                    .foregroundStyle(.black)
                    .keyboardType(.phonePad)
                    .textContentType(.telephoneNumber)
                    .tint(.black)
                    .focused($focusedField, equals: .phone)
                    .accessibilityIdentifier("phone-number-field")
                    .simultaneousGesture(TapGesture().onEnded(activatePhoneInputLayout))
                    .onChange(of: phoneNumber) { _, newValue in
                        let formatted = PhoneNumberFormatting.formattedNationalNumber(newValue, country: selectedPhoneCountry)
                        if formatted != newValue {
                            phoneNumber = formatted
                        }
                    }

                Spacer(minLength: scaled(12, in: proxy))

                DARCiArrowRightIcon()
                    .stroke(.black, style: StrokeStyle(lineWidth: scaled(2.0625, in: proxy), lineCap: .butt, lineJoin: .miter))
                    .frame(width: scaled(21, in: proxy), height: scaled(21, in: proxy))
                    .accessibilityHidden(true)
            }
            .frame(width: scaled(395, in: proxy), height: scaled(47, in: proxy), alignment: .leading)

        }
        .frame(width: scaled(395, in: proxy), height: scaled(48, in: proxy))
        .contentShape(Rectangle())
        .onTapGesture {
            focusedField = .phone
            activatePhoneInputLayout()
        }
    }

    private func phoneCountrySelector(in proxy: GeometryProxy) -> some View {
        Button {
            isPhoneCountryPickerPresented = true
        } label: {
            HStack(spacing: scaled(7, in: proxy)) {
                Text(selectedPhoneCountry.dialCode)
                    .font(DARCiFont.maisonNeue(.book, size: scaled(16, in: proxy)))
                    .foregroundStyle(.black)

                Image(systemName: "chevron.down")
                    .font(.system(size: scaled(9, in: proxy), weight: .bold))
                    .foregroundStyle(.black.opacity(0.58))
            }
            .padding(.trailing, scaled(6, in: proxy))
            .frame(height: scaled(34, in: proxy))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Country code")
        .accessibilityValue("\(selectedPhoneCountry.name), \(selectedPhoneCountry.dialCode)")
        .accessibilityIdentifier("phone-country-selector")
    }

    private func emailInput(in proxy: GeometryProxy) -> some View {
        ZStack {
            VStack(spacing: scaled(46.5, in: proxy)) {
                separator(in: proxy)
                separator(in: proxy)
            }

            HStack(spacing: 0) {
                TextField("", text: $emailAddress, prompt: Text(content.emailPlaceholder).foregroundStyle(Color.black.opacity(isEmailPlaceholderVisible ? 0.26 : 0)))
                    .font(DARCiFont.maisonNeue(.light, size: scaled(18, in: proxy)))
                    .foregroundStyle(.black)
                    .keyboardType(.emailAddress)
                    .textContentType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .tint(.black)
                    .focused($focusedField, equals: .email)
                    .accessibilityIdentifier("email-address-field")

                Spacer(minLength: scaled(12, in: proxy))

                DARCiArrowRightIcon()
                    .stroke(.black, style: StrokeStyle(lineWidth: scaled(2.0625, in: proxy), lineCap: .butt, lineJoin: .miter))
                    .frame(width: scaled(21, in: proxy), height: scaled(21, in: proxy))
                    .accessibilityHidden(true)
            }
            .frame(width: scaled(395, in: proxy), height: scaled(47, in: proxy), alignment: .leading)
        }
        .frame(width: scaled(395, in: proxy), height: scaled(48, in: proxy))
        .contentShape(Rectangle())
        .onTapGesture {
            focusedField = .email
            activateEmailInputLayout()
        }
    }

    private func continueButton(in proxy: GeometryProxy) -> some View {
        Button(action: requestOTP) {
            HStack(spacing: scaled(8, in: proxy)) {
                Text(viewModel.isRequestingOTP ? "Sending" : content.continueTitle)
                    .font(DARCiFont.maisonNeue(.book, size: scaled(22, in: proxy)))
                    .lineSpacing(scaled(2.2, in: proxy))
                    .foregroundStyle(.white)

                DARCiArrowCornerIcon()
                    .stroke(.white, style: StrokeStyle(lineWidth: scaled(2.0625, in: proxy), lineCap: .butt, lineJoin: .miter))
                    .frame(width: scaled(16, in: proxy), height: scaled(16, in: proxy))
                    .accessibilityHidden(true)

                Spacer()
            }
            .padding(.leading, scaled(24, in: proxy))
            .padding(.trailing, scaled(24, in: proxy))
            .frame(width: scaled(395, in: proxy), height: scaled(54, in: proxy))
            .background(.black)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(viewModel.isBusy)
        .accessibilityIdentifier("auth-continue-button")
    }

    private func smsConsentDisclosure(in proxy: GeometryProxy) -> some View {
        Text("By requesting a code, you agree to DARCi Terms: https://darciregistry.com/terms and Privacy: https://app.staging.darciregistry.dev/privacy. DARCi sends SMS verification codes only. Message/data rates may apply; frequency varies. Reply STOP to opt out or HELP for help.")
            .font(DARCiFont.maisonNeue(.book, size: scaled(10, in: proxy)))
            .lineSpacing(scaled(1.6, in: proxy))
            .foregroundStyle(Color.black.opacity(0.68))
            .frame(width: scaled(395, in: proxy), alignment: .leading)
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityIdentifier("auth-sms-consent-disclosure")
    }

    private func otpView(in proxy: GeometryProxy) -> some View {
        ZStack {
            Button(action: returnFromOTP) {
                DARCiArrowLeftIcon()
                    .stroke(.white, style: StrokeStyle(lineWidth: scaled(2.0625, in: proxy), lineCap: .butt, lineJoin: .miter))
                    .frame(width: scaled(21, in: proxy), height: scaled(21, in: proxy))
            }
            .buttonStyle(.plain)
            .frame(width: scaled(44, in: proxy), height: scaled(44, in: proxy))
            .contentShape(Rectangle())
            .accessibilityLabel("Back")
            .accessibilityIdentifier("otp-back-button")
            .position(x: proxy.size.width / 2 + scaled(-174, in: proxy), y: proxy.size.height / 2 + scaled(-363.5, in: proxy))

            Text(content.supportingText)
                .font(DARCiFont.maisonNeue(.book, size: scaled(24, in: proxy)))
                .lineSpacing(scaled(2.4, in: proxy))
                .foregroundStyle(.white)
                .frame(width: scaled(395, in: proxy), alignment: .leading)
                .accessibilityLabel(content.accessibilitySupportingText)
                .position(x: proxy.size.width / 2 + scaled(0.5, in: proxy), y: proxy.size.height / 2 + scaled(-285, in: proxy))

            otpCodeBoxes(in: proxy)
                .position(x: proxy.size.width / 2 + scaled(0.5, in: proxy), y: proxy.size.height / 2 + scaled(-169.5, in: proxy))

            verifyCodeButton(in: proxy)
                .position(x: proxy.size.width / 2 + scaled(0.5, in: proxy), y: proxy.size.height / 2 + scaled(-82, in: proxy))

            if let feedbackMessage = viewModel.feedbackMessage {
                Text(feedbackMessage)
                    .font(DARCiFont.maisonNeue(.book, size: scaled(14, in: proxy)))
                    .lineSpacing(scaled(1.4, in: proxy))
                    .foregroundStyle(.white)
                    .frame(width: scaled(395, in: proxy), alignment: .leading)
                    .accessibilityIdentifier("auth-feedback-message")
                    .position(x: proxy.size.width / 2 + scaled(0.5, in: proxy), y: proxy.size.height / 2 + scaled(-42, in: proxy))
            }

            Button(action: toggleInputModeFromOTP) {
                Text(inputModeSwitchTitle)
                    .font(DARCiFont.maisonNeue(.book, size: scaled(14, in: proxy)))
                    .lineSpacing(scaled(1.4, in: proxy))
                    .underline()
                    .foregroundStyle(.white)
            }
            .buttonStyle(.plain)
            .frame(width: scaled(395, in: proxy), alignment: .leading)
            .position(x: proxy.size.width / 2 + scaled(0.5, in: proxy), y: proxy.size.height / 2 + scaled(-29.5, in: proxy))
        }
        .accessibilityIdentifier("authentication-otp")
    }

    private func otpCodeBoxes(in proxy: GeometryProxy) -> some View {
        ZStack {
            ForEach(otpBoxLayout.indices, id: \.self) { index in
                let box = otpBoxLayout[index]

                Rectangle()
                    .fill(Color(red: 0.10, green: 0.10, blue: 0.10))
                    .frame(width: scaled(box.width, in: proxy), height: scaled(65, in: proxy))
                    .position(x: scaled(220 + box.x, in: proxy), y: scaled(32.5, in: proxy))
                    .accessibilityHidden(true)

                Text(otpCharacter(at: index))
                    .font(DARCiFont.maisonNeue(.book, size: scaled(28, in: proxy)))
                    .foregroundStyle(.white)
                    .frame(width: scaled(box.width, in: proxy), height: scaled(65, in: proxy))
                    .position(x: scaled(220 + box.x, in: proxy), y: scaled(32.5, in: proxy))
                    .accessibilityHidden(true)
            }

            TextField("", text: $otpCode)
                .keyboardType(.numberPad)
                .textContentType(.oneTimeCode)
                .foregroundStyle(.clear)
                .tint(.clear)
                .focused($focusedField, equals: .otp)
                .frame(width: scaled(395, in: proxy), height: scaled(65, in: proxy))
                .accessibilityLabel("One-time code")
                .accessibilityIdentifier("otp-code-field")
        }
        .frame(width: scaled(440, in: proxy), height: scaled(65, in: proxy))
        .contentShape(Rectangle())
        .onTapGesture {
            focusedField = .otp
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("otp-code-boxes")
    }

    private func verifyCodeButton(in proxy: GeometryProxy) -> some View {
        Button(action: verifyOTP) {
            HStack(spacing: scaled(8, in: proxy)) {
                Text(viewModel.isVerifyingOTP ? "Verifying" : content.verifyCodeTitle)
                    .font(DARCiFont.maisonNeue(.book, size: scaled(22, in: proxy)))
                    .lineSpacing(scaled(2.2, in: proxy))
                    .foregroundStyle(.black)

                DARCiArrowCornerIcon()
                    .stroke(.black, style: StrokeStyle(lineWidth: scaled(2.0625, in: proxy), lineCap: .butt, lineJoin: .miter))
                    .frame(width: scaled(16, in: proxy), height: scaled(16, in: proxy))
                    .accessibilityHidden(true)

                Spacer()
            }
            .padding(.leading, scaled(24, in: proxy))
            .padding(.trailing, scaled(24, in: proxy))
            .frame(width: scaled(395, in: proxy), height: scaled(54, in: proxy))
            .background(.white)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(viewModel.isBusy)
    }

    private func completeInfoView(in proxy: GeometryProxy) -> some View {
        ZStack {
            Text(content.completeInfoTitle)
                .font(DARCiFont.maisonNeue(.book, size: scaled(24, in: proxy)))
                .lineSpacing(scaled(2.4, in: proxy))
                .foregroundStyle(.white)
                .frame(width: scaled(395, in: proxy), alignment: .leading)
                .position(x: proxy.size.width / 2 + scaled(0.5, in: proxy), y: proxy.size.height / 2 + scaled(-285, in: proxy))

            completeInfoTextField(
                title: content.nameTitle,
                text: $profileName,
                field: .profileName,
                labelY: -201.5,
                inputY: -157.5,
                proxy: proxy
            )

            completeInfoTextField(
                title: content.lastNameTitle,
                text: $profileLastName,
                field: .profileLastName,
                labelY: -107.5,
                inputY: -63.5,
                proxy: proxy
            )

            completeInfoContactFields(in: proxy)

            if let feedbackMessage = viewModel.feedbackMessage {
                Text(feedbackMessage)
                    .font(DARCiFont.maisonNeue(.book, size: scaled(14, in: proxy)))
                    .lineSpacing(scaled(1.4, in: proxy))
                    .foregroundStyle(.white)
                    .frame(width: scaled(392, in: proxy), alignment: .leading)
                    .accessibilityIdentifier("auth-feedback-message")
                    .position(x: proxy.size.width / 2, y: proxy.size.height / 2 + scaled(216, in: proxy))
            }

            completeInfoContinueButton(in: proxy)
                .position(x: proxy.size.width / 2 + scaled(-101.5, in: proxy), y: proxy.size.height / 2 + scaled(335, in: proxy))
        }
        .accessibilityIdentifier("authentication-complete-info")
    }

    @ViewBuilder
    private func completeInfoContactFields(in proxy: GeometryProxy) -> some View {
        if isEmailVerified {
            verifiedContactField(
                title: content.emailFieldTitle,
                value: resolvedProfileEmail,
                accessibilityLabel: "Verified email",
                accessibilityIdentifier: "complete-info-email-field",
                labelY: -13.5,
                inputY: 30.5,
                proxy: proxy
            )

            completeInfoTextField(
                title: content.phoneNumberTitle,
                text: $profilePhone,
                field: .profilePhone,
                keyboardType: .phonePad,
                textContentType: .telephoneNumber,
                labelY: 80.5,
                inputY: 124.5,
                proxy: proxy
            )
        } else {
            completeInfoTextField(
                title: content.emailFieldTitle,
                text: $profileEmail,
                field: .profileEmail,
                keyboardType: .emailAddress,
                textContentType: .emailAddress,
                labelY: -13.5,
                inputY: 30.5,
                proxy: proxy
            )

            verifiedContactField(
                title: content.phoneNumberTitle,
                value: resolvedProfilePhone,
                accessibilityLabel: "Verified phone number",
                accessibilityIdentifier: "complete-info-phone-field",
                labelY: 80.5,
                inputY: 124.5,
                proxy: proxy
            )
        }
    }

    private func completeInfoTextField(
        title: String,
        text: Binding<String>,
        field: Field,
        keyboardType: UIKeyboardType = .default,
        textContentType: UITextContentType? = nil,
        labelY: CGFloat,
        inputY: CGFloat,
        proxy: GeometryProxy
    ) -> some View {
        ZStack {
            Text(title)
                .font(DARCiFont.maisonNeue(.book, size: scaled(14, in: proxy)))
                .lineSpacing(scaled(1.4, in: proxy))
                .foregroundStyle(.white)
                .frame(width: scaled(392, in: proxy), alignment: .leading)
                .position(x: proxy.size.width / 2, y: proxy.size.height / 2 + scaled(labelY, in: proxy))

            TextField("", text: text)
                .font(DARCiFont.maisonNeue(.book, size: scaled(18, in: proxy)))
                .lineSpacing(scaled(1.8, in: proxy))
                .foregroundStyle(.white)
                .keyboardType(keyboardType)
                .textContentType(textContentType)
                .textInputAutocapitalization(keyboardType == .emailAddress || keyboardType == .phonePad ? .never : .words)
                .autocorrectionDisabled(keyboardType == .emailAddress || keyboardType == .phonePad)
                .tint(.white)
                .focused($focusedField, equals: field)
                .padding(.horizontal, scaled(24, in: proxy))
                .frame(width: scaled(392, in: proxy), height: scaled(49, in: proxy), alignment: .leading)
                .background(Color(red: 0.10, green: 0.10, blue: 0.10))
                .overlay(alignment: .bottom) {
                    Rectangle()
                        .fill(focusedField == field ? Color.white : Color.clear)
                        .frame(height: max(0.5, scaled(0.5, in: proxy)))
                }
                .accessibilityLabel(title)
                .accessibilityIdentifier("complete-info-field")
                .position(x: proxy.size.width / 2, y: proxy.size.height / 2 + scaled(inputY, in: proxy))
        }
    }

    private func verifiedContactField(
        title: String,
        value: String,
        accessibilityLabel: String,
        accessibilityIdentifier: String,
        labelY: CGFloat,
        inputY: CGFloat,
        proxy: GeometryProxy
    ) -> some View {
        ZStack {
            Text(title)
                .font(DARCiFont.maisonNeue(.book, size: scaled(14, in: proxy)))
                .lineSpacing(scaled(1.4, in: proxy))
                .foregroundStyle(.white)
                .frame(width: scaled(392, in: proxy), alignment: .leading)
                .position(x: proxy.size.width / 2, y: proxy.size.height / 2 + scaled(labelY, in: proxy))

            HStack(spacing: 0) {
                Text(value)
                    .font(DARCiFont.maisonNeue(.book, size: scaled(18, in: proxy)))
                    .lineSpacing(scaled(1.8, in: proxy))
                    .foregroundStyle(Color(red: 0.35, green: 0.35, blue: 0.35))

                Spacer()

                DARCiCheckIcon()
                    .stroke(DARCiTheme.onboardingGreen, style: StrokeStyle(lineWidth: scaled(2.0625, in: proxy), lineCap: .butt, lineJoin: .miter))
                    .frame(width: scaled(22, in: proxy), height: scaled(17, in: proxy))
                    .accessibilityHidden(true)
            }
            .padding(.leading, scaled(24, in: proxy))
            .padding(.trailing, scaled(24, in: proxy))
            .frame(width: scaled(392, in: proxy), height: scaled(49, in: proxy), alignment: .leading)
            .background(Color(red: 0.10, green: 0.10, blue: 0.10))
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(accessibilityLabel)
            .accessibilityIdentifier(accessibilityIdentifier)
            .position(x: proxy.size.width / 2, y: proxy.size.height / 2 + scaled(inputY, in: proxy))
        }
    }

    private func completeInfoContinueButton(in proxy: GeometryProxy) -> some View {
        Button(action: completeProfile) {
            HStack(spacing: scaled(8, in: proxy)) {
                Text(viewModel.isCompletingProfile ? "Saving" : content.continueTitle)
                    .font(DARCiFont.maisonNeue(.book, size: scaled(22, in: proxy)))
                    .lineSpacing(scaled(2.2, in: proxy))
                    .foregroundStyle(.black)

                DARCiArrowCornerIcon()
                    .stroke(.black, style: StrokeStyle(lineWidth: scaled(2.0625, in: proxy), lineCap: .butt, lineJoin: .miter))
                    .frame(width: scaled(16, in: proxy), height: scaled(16, in: proxy))
                    .accessibilityHidden(true)

                Spacer()
            }
            .padding(.leading, scaled(24, in: proxy))
            .padding(.trailing, scaled(18, in: proxy))
            .frame(width: scaled(191, in: proxy), height: scaled(54, in: proxy))
            .background(isCompleteInfoReady ? Color.white : Color(red: 0.35, green: 0.35, blue: 0.35))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(!isCompleteInfoReady || viewModel.isBusy)
    }

    private func successView(in proxy: GeometryProxy) -> some View {
        ZStack {
            AuthenticationBundledImage(name: "onboarding1", fileExtension: "png")
                .ignoresSafeArea()
                .allowsHitTesting(false)
                .accessibilityHidden(true)

            Color.black.opacity(0.40)
                .ignoresSafeArea()
                .allowsHitTesting(false)
                .accessibilityHidden(true)

            Text(content.successTitle)
                .font(DARCiFont.maisonNeue(.light, size: scaled(20, in: proxy)))
                .lineSpacing(scaled(6, in: proxy))
                .foregroundStyle(.white)
                .frame(width: scaled(395, in: proxy), alignment: .leading)
                .position(x: proxy.size.width / 2 + scaled(0.5, in: proxy), y: proxy.size.height / 2 + scaled(-322, in: proxy))

            successContinueButton(in: proxy)
                .position(x: proxy.size.width / 2 + scaled(0.5, in: proxy), y: proxy.size.height / 2 + scaled(335, in: proxy))
        }
        .accessibilityIdentifier("authentication-success")
    }

    private func successContinueButton(in proxy: GeometryProxy) -> some View {
        Button(action: onBrowse) {
            HStack(spacing: scaled(8, in: proxy)) {
                Spacer()

                Text(content.continueTitle)
                    .font(DARCiFont.maisonNeue(.book, size: scaled(22, in: proxy)))
                    .lineSpacing(scaled(2.2, in: proxy))
                    .foregroundStyle(.black)

                DARCiArrowCornerIcon()
                    .stroke(.black, style: StrokeStyle(lineWidth: scaled(2.0625, in: proxy), lineCap: .butt, lineJoin: .miter))
                    .frame(width: scaled(16, in: proxy), height: scaled(16, in: proxy))
                    .accessibilityHidden(true)
            }
            .padding(.trailing, scaled(42, in: proxy))
            .frame(width: scaled(395, in: proxy), height: scaled(54, in: proxy))
            .background(DARCiTheme.onboardingGreen)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private func separator(in proxy: GeometryProxy) -> some View {
        Rectangle()
            .fill(Color.black.opacity(0.18))
            .frame(width: scaled(395, in: proxy), height: max(0.5, scaled(0.5, in: proxy)))
    }

    private func startIntroAnimation() {
        visibleItemCount = 0

        for index in 1...7 {
            DispatchQueue.main.asyncAfter(deadline: .now() + Double(index - 1) * 0.11) {
                withAnimation(.easeOut(duration: 0.45)) {
                    visibleItemCount = index
                }
            }
        }
    }

    private func activatePhoneInputLayout() {
        activateInputLayout(.phone)
    }

    private func activateEmailInputLayout() {
        activateInputLayout(.email)
    }

    private func toggleInputMode() {
        if activeInputMode == .email {
            activatePhoneInputLayout()
        } else {
            activateEmailInputLayout()
        }
    }

    private func resetInputLayout() {
        focusedField = nil
        isEmailPlaceholderVisible = false
        viewModel.clearErrors()

        withAnimation(.easeInOut(duration: 0.32)) {
            activeInputMode = nil
            isHeadlineCollapsed = false
        }
    }

    private func requestOTP() {
        let method = currentInputMethod
        let rawIdentifier = currentRawIdentifier

        Task {
            let didStart = await viewModel.requestOTP(method: method, rawIdentifier: rawIdentifier)
            if didStart {
                showOTP()
            }
        }
    }

    private func showOTP() {
        focusedField = nil

        withAnimation(.easeInOut(duration: 0.22)) {
            isEntryFadingForOTP = true
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.24) {
            withAnimation(.easeInOut(duration: 0.18)) {
                authenticationStep = .otp
            }

            DispatchQueue.main.asyncAfter(deadline: .now() + 0.22) {
                focusedField = .otp
                isEntryFadingForOTP = false
            }
        }
    }

    private func verifyOTP() {
        let token = otpCode

        Task {
            guard let route = await viewModel.verifyOTP(token: token) else {
                return
            }

            switch route {
            case .completeProfile:
                showCompleteInfo()
            case .stepUpEmail:
                otpCode = ""
                focusedField = .otp
            case .success:
                showSuccess()
            }
        }
    }

    private func showCompleteInfo() {
        focusedField = nil
        hydrateVerifiedContactFields()

        withAnimation(.easeInOut(duration: 0.24)) {
            authenticationStep = .completeInfo
        }
    }

    private func completeProfile() {
        Task {
            let didComplete = await viewModel.completeProfile(
                firstName: profileName,
                lastName: profileLastName,
                email: profileEmail,
                phone: profilePhone
            )

            if didComplete {
                showSuccess()
            }
        }
    }

    private func hydrateVerifiedContactFields() {
        if isEmailVerified {
            profileEmail = viewModel.verifiedEmailAddress
        }

        if isPhoneVerified {
            profilePhone = viewModel.verifiedPhoneNumber
        }
    }

    private func showSuccess() {
        focusedField = nil

        withAnimation(.easeInOut(duration: 0.24)) {
            authenticationStep = .success
        }
    }

    private func returnFromOTP() {
        viewModel.clearErrors()
        isEntryFadingForOTP = false

        withAnimation(.easeInOut(duration: 0.24)) {
            authenticationStep = .entry
        }
    }

    private func toggleInputModeFromOTP() {
        viewModel.clearChallenge()
        otpCode = ""

        withAnimation(.easeInOut(duration: 0.24)) {
            authenticationStep = .entry
        }

        toggleInputMode()
    }

    private func otpCharacter(at index: Int) -> String {
        let characters = Array(otpCode)

        guard characters.indices.contains(index) else {
            return ""
        }

        return String(characters[index])
    }

    private func activateInputLayout(_ mode: InputMode) {
        viewModel.clearErrors()

        guard activeInputMode != mode else {
            return
        }

        isEmailPlaceholderVisible = false

        if isHeadlineCollapsed {
            withAnimation(.easeInOut(duration: 0.28)) {
                activeInputMode = mode
            }
            revealEmailPlaceholderIfNeeded(for: mode, after: 0.28)
            return
        }

        withAnimation(.easeOut(duration: 0.18)) {
            isHeadlineCollapsed = true
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.18) {
            withAnimation(.easeInOut(duration: 0.36)) {
                activeInputMode = mode
            }
            revealEmailPlaceholderIfNeeded(for: mode, after: 0.36)
        }
    }

    private func revealEmailPlaceholderIfNeeded(for mode: InputMode, after delay: TimeInterval) {
        guard mode == .email else {
            return
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + delay) {
            guard activeInputMode == .email else {
                return
            }

            withAnimation(.easeOut(duration: 0.22)) {
                isEmailPlaceholderVisible = true
            }
        }
    }

    private func scaled(_ value: CGFloat, in proxy: GeometryProxy) -> CGFloat {
        value * scale(in: proxy)
    }

    private func scale(in proxy: GeometryProxy) -> CGFloat {
        min(proxy.size.width / designSize.width, proxy.size.height / designSize.height)
    }
}

private struct AuthenticationBundledImage: View {
    let name: String
    let fileExtension: String

    var body: some View {
        GeometryReader { proxy in
            #if canImport(UIKit)
            if let image = bundledImage {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFit()
                    .frame(width: proxy.size.width, height: proxy.size.height)
            } else {
                DARCiTheme.onboardingImageFallback
                    .frame(width: proxy.size.width, height: proxy.size.height)
            }
            #else
            DARCiTheme.onboardingImageFallback
                .frame(width: proxy.size.width, height: proxy.size.height)
            #endif
        }
        .clipped()
    }

    #if canImport(UIKit)
    private var bundledImage: UIImage? {
        guard let url = Bundle.main.url(forResource: name, withExtension: fileExtension) else {
            return nil
        }

        return UIImage(contentsOfFile: url.path)
    }
    #endif
}

private extension View {
    func revealOrder(_ order: Int, visibleItemCount: Int, scale: CGFloat) -> some View {
        opacity(visibleItemCount > order ? 1 : 0)
            .offset(y: visibleItemCount > order ? 0 : 10 * scale)
            .accessibilityHidden(visibleItemCount <= order)
    }
}

#Preview {
    AuthenticationSignInView(
        content: .signIn,
        viewModel: AuthenticationViewModel(apiClient: MockAuthAPIClient(), sessionStore: InMemoryAuthSessionStore())
    )
}