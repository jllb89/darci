import PDFKit
import SwiftUI

struct PDFKitDocumentPreview: UIViewRepresentable {
    let data: Data
    @Binding var pageCount: Int
    @Binding var currentPage: Int
    let zoomInTrigger: Int
    let zoomOutTrigger: Int

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
            let document = PDFDocument(data: data)
            uiView.document = document
            uiView.autoScales = false
            Self.fitToWidth(uiView)

            DispatchQueue.main.async {
                Self.fitToWidth(uiView)
                pageCount = max(document?.pageCount ?? 1, 1)
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
