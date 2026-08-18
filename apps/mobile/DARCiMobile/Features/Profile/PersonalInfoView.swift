import SwiftUI

struct PersonalInfoSaveInput: Equatable, Sendable {
    let firstName: String
    let lastName: String
    let email: String
    let phone: String
    let address: String?
    let password: String?
}

struct PersonalInfoView: View {
    private enum Field: String, Hashable {
        case name
        case email
        case password
        case phone
        case address
    }

    private struct Snapshot: Equatable {
        let name: String
        let email: String
        let phone: String
        let address: String
    }

    private let designSize = CGSize(width: 440, height: 956)
    private let onBack: () -> Void
    private let onSave: (PersonalInfoSaveInput) async throws -> Void

    @State private var name: String
    @State private var email: String
    @State private var password = ""
    @State private var phone: String
    @State private var selectedPhoneCountry: PhoneCountry
    @State private var address: String
    @State private var savedSnapshot: Snapshot
    @State private var errorMessage: String?
    @State private var isSaving = false
    @State private var isPhoneCountryPickerPresented = false
    @FocusState private var focusedField: Field?

    init(
        session: AuthSession?,
        onBack: @escaping () -> Void,
        onSave: @escaping (PersonalInfoSaveInput) async throws -> Void
    ) {
        let user = session?.user
        let initialName = [user?.firstName, user?.lastName]
            .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { $0.isEmpty == false }
            .joined(separator: " ")
        let initialEmail = user?.email ?? ""
        let initialCountry = PhoneNumberFormatting.country(matchingPhone: user?.phone)
        let initialPhone = PhoneNumberFormatting.formattedNationalNumber(user?.phone ?? "", country: initialCountry)
        let initialAddress = user?.address ?? ""

        self.onBack = onBack
        self.onSave = onSave
        _name = State(initialValue: initialName)
        _email = State(initialValue: initialEmail)
        _phone = State(initialValue: initialPhone)
        _selectedPhoneCountry = State(initialValue: initialCountry)
        _address = State(initialValue: initialAddress)
        _savedSnapshot = State(initialValue: Snapshot(
            name: initialName,
            email: initialEmail,
            phone: initialPhone,
            address: initialAddress
        ))
    }

    private var currentSnapshot: Snapshot {
        Snapshot(name: name, email: email, phone: phone, address: address)
    }

    private var hasChanges: Bool {
        currentSnapshot != savedSnapshot || password.isEmpty == false
    }

    var body: some View {
        GeometryReader { proxy in
            VStack(alignment: .leading, spacing: 0) {
                Button(action: onBack) {
                    DARCiArrowLeftIcon()
                        .stroke(.white, style: StrokeStyle(lineWidth: 2, lineCap: .square, lineJoin: .miter))
                        .frame(width: scaled(21, in: proxy), height: scaled(21, in: proxy))
                        .frame(width: scaled(34, in: proxy), height: scaled(34, in: proxy), alignment: .leading)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Back to user settings")

                Text("Personal Info")
                    .font(DARCiFont.maisonNeue(.book, size: scaled(24, in: proxy)))
                    .lineSpacing(scaled(2.4, in: proxy))
                    .foregroundStyle(.white)
                    .padding(.top, scaled(52, in: proxy))

                VStack(alignment: .leading, spacing: scaled(33, in: proxy)) {
                    profileField(title: "Name", field: .name, proxy: proxy) {
                        TextField("", text: $name)
                            .textContentType(.name)
                            .textInputAutocapitalization(.words)
                    }

                    profileField(title: "Email", field: .email, proxy: proxy) {
                        TextField("", text: $email)
                            .textContentType(.emailAddress)
                            .textInputAutocapitalization(.never)
                            .keyboardType(.emailAddress)
                            .autocorrectionDisabled()
                    }

                    profileField(title: "Password", field: .password, proxy: proxy) {
                        SecureField("*********", text: $password)
                            .textContentType(.newPassword)
                    }

                    profileField(title: "Phone number", field: .phone, proxy: proxy) {
                        HStack(spacing: scaled(10, in: proxy)) {
                            Button {
                                isPhoneCountryPickerPresented = true
                            } label: {
                                HStack(spacing: scaled(5, in: proxy)) {
                                    Text(selectedPhoneCountry.dialCode)
                                    Image(systemName: "chevron.down")
                                        .font(.system(size: scaled(8, in: proxy), weight: .bold))
                                }
                                .foregroundStyle(.white)
                            }
                            .buttonStyle(.plain)
                            .accessibilityIdentifier("personal-info-phone-country-selector")

                            TextField("", text: $phone)
                                .textContentType(.telephoneNumber)
                                .keyboardType(.phonePad)
                                .onChange(of: phone) { _, nextValue in
                                    phone = PhoneNumberFormatting.formattedNationalNumber(nextValue, country: selectedPhoneCountry)
                                }
                        }
                    }

                    profileField(title: "Address", field: .address, proxy: proxy) {
                        TextField("", text: $address)
                            .textContentType(.fullStreetAddress)
                            .textInputAutocapitalization(.words)
                    }
                }
                .padding(.top, scaled(46, in: proxy))

                Spacer(minLength: scaled(18, in: proxy))

                if let errorMessage {
                    Text(errorMessage)
                        .font(DARCiFont.maisonNeue(.book, size: scaled(11, in: proxy)))
                        .foregroundStyle(Color(red: 1, green: 0.42, blue: 0.42))
                        .lineLimit(2)
                        .padding(.bottom, scaled(8, in: proxy))
                }

                Button(action: save) {
                    HStack(spacing: scaled(12, in: proxy)) {
                        Spacer(minLength: 0)

                        Text(isSaving ? "Saving..." : "Save changes")
                            .font(DARCiFont.maisonNeue(.book, size: scaled(22, in: proxy)))
                            .lineSpacing(scaled(2.2, in: proxy))

                        DARCiArrowCornerIcon()
                            .stroke(.black, style: StrokeStyle(lineWidth: 1.8, lineCap: .square, lineJoin: .miter))
                            .frame(width: scaled(18, in: proxy), height: scaled(18, in: proxy))
                    }
                    .foregroundStyle(.black)
                    .padding(.horizontal, scaled(22, in: proxy))
                    .frame(maxWidth: .infinity, minHeight: scaled(54, in: proxy), maxHeight: scaled(54, in: proxy))
                    .background(hasChanges && isSaving == false ? DARCiTheme.onboardingGreen : Color(red: 0.21, green: 0.21, blue: 0.21))
                }
                .buttonStyle(.plain)
                .disabled(hasChanges == false || isSaving)
                .accessibilityIdentifier("personal-info-save-button")
                .padding(.bottom, scaled(24, in: proxy))
            }
            .padding(.top, scaled(24, in: proxy))
            .padding(.horizontal, scaled(22, in: proxy))
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .background(Color.black.ignoresSafeArea())
            .clipped()
        }
        .ignoresSafeArea(.keyboard)
        .navigationTitle("")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.hidden, for: .navigationBar)
        .sheet(isPresented: $isPhoneCountryPickerPresented) {
            PhoneCountryPickerSheet(
                countries: PhoneNumberFormatting.countries,
                selectedCountry: selectedPhoneCountry
            ) { country in
                selectedPhoneCountry = country
                phone = PhoneNumberFormatting.formattedNationalNumber(phone, country: country)
            }
            .presentationDetents([.medium, .large])
        }
    }

    private func profileField<Content: View>(
        title: String,
        field: Field,
        proxy: GeometryProxy,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: scaled(10, in: proxy)) {
            Text(title)
                .font(DARCiFont.maisonNeue(.book, size: scaled(12, in: proxy)))
                .lineSpacing(scaled(1.2, in: proxy))
                .foregroundStyle(.white)

            content()
                .font(DARCiFont.maisonNeue(.book, size: scaled(18, in: proxy)))
                .lineSpacing(scaled(1.8, in: proxy))
                .foregroundStyle(.white)
                .tint(.white)
                .focused($focusedField, equals: field)
                .accessibilityIdentifier("personal-info-\(field.rawValue)-field")
                .padding(.horizontal, focusedField == field ? scaled(11, in: proxy) : scaled(10, in: proxy))
                .frame(maxWidth: .infinity, minHeight: scaled(43, in: proxy), maxHeight: scaled(43, in: proxy), alignment: .leading)
                .background(focusedField == field ? Color(red: 0.10, green: 0.10, blue: 0.10) : .clear)
                .overlay(alignment: .bottom) {
                    if focusedField == field {
                        Rectangle()
                            .fill(.white)
                            .frame(height: 1)
                    }
                }
        }
    }

    private func save() {
        focusedField = nil
        errorMessage = nil

        guard let input = makeSaveInput() else {
            return
        }

        isSaving = true
        Task {
            do {
                try await onSave(input)
                savedSnapshot = currentSnapshot
                password = ""
            } catch {
                errorMessage = Self.message(for: error)
            }
            isSaving = false
        }
    }

    private func makeSaveInput() -> PersonalInfoSaveInput? {
        let nameParts = name
            .split(whereSeparator: { $0.isWhitespace })
            .map(String.init)
        guard nameParts.count >= 2 else {
            errorMessage = "Enter your first and last name."
            return nil
        }

        let normalizedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let emailParts = normalizedEmail.split(separator: "@", omittingEmptySubsequences: false)
        guard emailParts.count == 2, emailParts[0].isEmpty == false, emailParts[1].contains(".") else {
            errorMessage = "Enter a valid email address."
            return nil
        }

        guard let normalizedPhone = PhoneNumberFormatting.e164(phone, country: selectedPhoneCountry) else {
            errorMessage = "Enter a valid phone number."
            return nil
        }

        if password.isEmpty == false, password.count < 8 {
            errorMessage = "Password must contain at least 8 characters."
            return nil
        }

        return PersonalInfoSaveInput(
            firstName: nameParts.first ?? "",
            lastName: nameParts.dropFirst().joined(separator: " "),
            email: normalizedEmail,
            phone: normalizedPhone,
            address: address.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty,
            password: password.nilIfEmpty
        )
    }

    private static func message(for error: Error) -> String {
        guard let authError = error as? AuthAPIError else {
            return "Unable to save your changes. Try again."
        }

        switch authError {
        case .wrongCode(let message), .unauthorized(let message), .validation(let message), .rateLimited(let message):
            return message ?? "Unable to save your changes."
        case .server(_, let message), .unexpectedStatus(_, let message):
            return message ?? "Unable to save your changes. Try again."
        case .invalidURL, .invalidResponse, .emptyResponse:
            return "Unable to save your changes. Try again."
        }
    }

    private func scaled(_ value: CGFloat, in proxy: GeometryProxy) -> CGFloat {
        value * min(proxy.size.width / designSize.width, proxy.size.height / designSize.height, 1.08)
    }
}

private extension String {
    var nilIfEmpty: String? {
        isEmpty ? nil : self
    }
}