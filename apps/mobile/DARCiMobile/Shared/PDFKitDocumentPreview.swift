import PDFKit
import SwiftUI

struct PDFKitDocumentPreview: View {
    let data: Data
    @Binding var pageCount: Int
    @Binding var currentPage: Int
    let zoomInTrigger: Int
    let zoomOutTrigger: Int

    @State private var loadFailure: PDFPreviewLoadFailure?

    var body: some View {
        ZStack {
            PDFKitDocumentView(
                data: data,
                pageCount: $pageCount,
                currentPage: $currentPage,
                zoomInTrigger: zoomInTrigger,
                zoomOutTrigger: zoomOutTrigger,
                loadFailure: $loadFailure
            )

            if let loadFailure {
                Color.white

                VStack(spacing: 10) {
                    Image(systemName: "exclamationmark.triangle")
                        .font(.system(size: 24, weight: .regular))

                    Text("This PDF cannot be previewed.")
                        .font(DARCiFont.maisonNeue(.medium, size: 13))

                    Text(loadFailure.message)
                        .font(DARCiFont.maisonNeue(.book, size: 11))
                        .multilineTextAlignment(.center)
                        .foregroundStyle(.black.opacity(0.62))
                }
                .foregroundStyle(.black)
                .padding(24)
                .accessibilityElement(children: .combine)
                .accessibilityIdentifier("pdf-preview-error")
            }
        }
    }
}

enum PDFPreviewLoadFailure: Error, Equatable {
    case unreadable
    case locked
    case unusablePage

    var message: String {
        switch self {
        case .unreadable:
            "The file is damaged or uses an unsupported PDF format. Use the download button or request a readable copy."
        case .locked:
            "The file requires a password. Ask the document owner to upload an unlocked copy."
        case .unusablePage:
            "The file does not contain a page that can be displayed. Ask the document owner for a readable copy."
        }
    }
}

enum PDFPreviewDocumentLoader {
    static func load(data: Data) throws -> PDFDocument {
        guard let document = PDFDocument(data: data) else {
            throw PDFPreviewLoadFailure.unreadable
        }

        if document.isLocked && document.unlock(withPassword: "") == false {
            throw PDFPreviewLoadFailure.locked
        }

        guard document.isLocked == false,
              document.pageCount > 0,
              let firstPage = document.page(at: 0) else {
            throw PDFPreviewLoadFailure.unusablePage
        }

        let bounds = firstPage.bounds(for: .cropBox)
        guard bounds.width.isFinite,
              bounds.height.isFinite,
              bounds.width > 0,
              bounds.height > 0 else {
            throw PDFPreviewLoadFailure.unusablePage
        }

        return document
    }
}

private struct PDFKitDocumentView: UIViewRepresentable {
    let data: Data
    @Binding var pageCount: Int
    @Binding var currentPage: Int
    let zoomInTrigger: Int
    let zoomOutTrigger: Int
    @Binding var loadFailure: PDFPreviewLoadFailure?

    func makeUIView(context: Context) -> PDFView {
        let view = PDFView()
        view.autoScales = false
        view.displayMode = .singlePageContinuous
        view.displayDirection = .vertical
        view.backgroundColor = .white
        NotificationCenter.default.addObserver(
            context.coordinator,
            selector: #selector(Coordinator.pageChanged(_:)),
            name: Notification.Name.PDFViewPageChanged,
            object: view
        )
        return view
    }

    func updateUIView(_ uiView: PDFView, context: Context) {
        if context.coordinator.data != data {
            context.coordinator.data = data
            context.coordinator.didUserAdjustZoom = false
            context.coordinator.lastBoundsSize = .zero
            let document: PDFDocument
            do {
                document = try PDFPreviewDocumentLoader.load(data: data)
            } catch let failure as PDFPreviewLoadFailure {
                uiView.document = nil
                DispatchQueue.main.async {
                    guard context.coordinator.data == data else { return }
                    loadFailure = failure
                    pageCount = 1
                    currentPage = 1
                }
                return
            } catch {
                uiView.document = nil
                DispatchQueue.main.async {
                    guard context.coordinator.data == data else { return }
                    loadFailure = .unreadable
                    pageCount = 1
                    currentPage = 1
                }
                return
            }
            uiView.document = document
            uiView.autoScales = false
            if let firstPage = document.page(at: 0) {
                uiView.go(to: firstPage)
            }
            Self.fitToWidth(uiView)

            DispatchQueue.main.async {
                guard uiView.document === document else { return }
                loadFailure = nil
                if let firstPage = document.page(at: 0) {
                    uiView.go(to: firstPage)
                }
                Self.fitToWidth(uiView)
                pageCount = document.pageCount
                currentPage = 1
            }
        }

        if context.coordinator.lastBoundsSize != uiView.bounds.size {
            context.coordinator.lastBoundsSize = uiView.bounds.size
            if context.coordinator.didUserAdjustZoom == false {
                DispatchQueue.main.async {
                    Self.fitToWidth(uiView)
                }
            }
        }

        if context.coordinator.zoomInTrigger != zoomInTrigger {
            context.coordinator.zoomInTrigger = zoomInTrigger
            context.coordinator.didUserAdjustZoom = true
            uiView.scaleFactor = min(uiView.scaleFactor * 1.2, uiView.maxScaleFactor)
        }

        if context.coordinator.zoomOutTrigger != zoomOutTrigger {
            context.coordinator.zoomOutTrigger = zoomOutTrigger
            context.coordinator.didUserAdjustZoom = true
            uiView.scaleFactor = max(uiView.scaleFactor / 1.2, uiView.minScaleFactor)
        }
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(pageCount: $pageCount, currentPage: $currentPage)
    }

    private static func fitToWidth(_ view: PDFView) {
        guard let page = view.document?.page(at: 0) else {
            return
        }

        let pageWidth = page.bounds(for: .cropBox).width
        let viewWidth = view.bounds.width
        guard pageWidth > 0, viewWidth > 0 else {
            return
        }

        let widthFitScale = viewWidth / pageWidth
        view.minScaleFactor = max(widthFitScale * 0.75, 0.1)
        view.maxScaleFactor = max(widthFitScale * 4, 4)
        view.scaleFactor = widthFitScale
    }

    final class Coordinator: NSObject {
        @Binding var pageCount: Int
        @Binding var currentPage: Int
        var data: Data?
        var zoomInTrigger = 0
        var zoomOutTrigger = 0
        var lastBoundsSize: CGSize = .zero
        var didUserAdjustZoom = false

        init(pageCount: Binding<Int>, currentPage: Binding<Int>) {
            _pageCount = pageCount
            _currentPage = currentPage
        }

        deinit {
            NotificationCenter.default.removeObserver(self)
        }

        @MainActor @objc func pageChanged(_ notification: Notification) {
            guard let view = notification.object as? PDFView,
                  let document = view.document,
                  let page = view.currentPage else {
                return
            }

            let nextPage = max(document.index(for: page) + 1, 1)
            let nextPageCount = max(document.pageCount, 1)
            currentPage = nextPage
            pageCount = nextPageCount
        }
    }
}
