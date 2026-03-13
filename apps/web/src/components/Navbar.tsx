import Image from "next/image";

export default function Navbar() {
  return (
    <div className="w-full bg-Color-Scheme-1-Text">
      <div className="mx-auto flex h-16 w-full max-w-[1440px] items-center justify-between px-6 md:px-16">
        <Image
          src="/icons/navbar/darci_white.svg"
          alt="DARCI"
          width={71}
          height={20}
          className="h-5 w-auto"
          priority
        />
        <div className="hidden h-10 w-20 md:block" />
        <div className="flex items-center gap-6">
          <div className="hidden items-center gap-6 md:flex">
            <div className="flex items-center gap-1">
              <div className="text-Color-Scheme-1-Background text-sm font-medium font-sans leading-6">
                Features
              </div>
            </div>
            <div className="flex items-center gap-1">
              <div className="text-Color-Scheme-1-Background text-sm font-medium font-sans leading-6">
                How it works
              </div>
            </div>
            <div className="flex items-center gap-1">
              <div className="text-Color-Scheme-1-Background text-sm font-medium font-sans leading-6">
                Pricing
              </div>
            </div>
            <div className="flex items-center gap-1">
              <div className="text-Color-Scheme-1-Background text-sm font-medium font-sans leading-6">
                Resources
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div
              data-alternate="False"
              data-icon-position="No icon"
              data-small="True"
              data-style="Secondary"
              className="flex items-center gap-2 bg-Green px-5 py-2"
            >
              <div className="text-Color-Scheme-1-Text text-sm font-medium font-sans leading-6">
                Get started
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
