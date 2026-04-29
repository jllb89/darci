"use client";

import React, {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/utils";

interface InfoCardTitleProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

interface InfoCardDescriptionProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

const InfoCardTitle = memo(
  ({ children, className, ...props }: InfoCardTitleProps) => {
    return (
      <div
        className={cn(
          "mb-1 font-sans text-sm font-medium text-Color-Scheme-1-Text",
          className,
        )}
        {...props}
      >
        {children}
      </div>
    );
  },
);
InfoCardTitle.displayName = "InfoCardTitle";

const InfoCardDescription = memo(
  ({ children, className, ...props }: InfoCardDescriptionProps) => {
    return (
      <div
        className={cn(
          "text-xs leading-4 text-Color-Neutral",
          className,
        )}
        {...props}
      >
        {children}
      </div>
    );
  },
);
InfoCardDescription.displayName = "InfoCardDescription";

interface CommonCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

interface InfoCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  storageKey?: string;
  dismissType?: "once" | "forever";
}

type InfoCardContentProps = CommonCardProps;
type InfoCardFooterProps = CommonCardProps;
type InfoCardDismissProps = React.HTMLAttributes<HTMLDivElement> & {
  children: React.ReactNode;
  onDismiss?: () => void;
};
type InfoCardActionProps = CommonCardProps;

const InfoCardContent = memo(
  ({ children, className, ...props }: InfoCardContentProps) => {
    return (
      <div
        className={cn(
          "flex flex-col gap-1 text-xs text-Color-Scheme-1-Text",
          className,
        )}
        {...props}
      >
        {children}
      </div>
    );
  },
);
InfoCardContent.displayName = "InfoCardContent";

interface MediaItem {
  type?: "image" | "video";
  src: string;
  alt?: string;
  className?: string;
  [key: string]: unknown;
}

interface InfoCardMediaProps extends React.HTMLAttributes<HTMLDivElement> {
  media: MediaItem[];
  loading?: "eager" | "lazy";
  shrinkHeight?: number;
  expandHeight?: number;
}

const InfoCardImageContext = createContext<{
  handleMediaLoad: (mediaSrc: string) => void;
  setAllImagesLoaded: (loaded: boolean) => void;
}>({
  handleMediaLoad: () => undefined,
  setAllImagesLoaded: () => undefined,
});

const InfoCardContext = createContext<{
  isHovered: boolean;
  onDismiss: () => void;
}>({
  isHovered: false,
  onDismiss: () => undefined,
});

function InfoCard({
  children,
  className,
  storageKey,
  dismissType = "once",
}: InfoCardProps) {
  if (dismissType === "forever" && !storageKey) {
    throw new Error('A storageKey must be provided when using dismissType="forever"');
  }

  const [isHovered, setIsHovered] = useState(false);
  const [allImagesLoaded, setAllImagesLoaded] = useState(true);
  const [isDismissed, setIsDismissed] = useState(() => {
    if (typeof window === "undefined" || dismissType === "once") {
      return false;
    }

    return localStorage.getItem(storageKey!) === "dismissed";
  });

  const handleDismiss = useCallback(() => {
    setIsDismissed(true);

    if (dismissType === "forever") {
      localStorage.setItem(storageKey!, "dismissed");
    }
  }, [dismissType, storageKey]);

  const imageContextValue = useMemo(
    () => ({
      handleMediaLoad: () => undefined,
      setAllImagesLoaded,
    }),
    [],
  );

  const cardContextValue = useMemo(
    () => ({
      isHovered,
      onDismiss: handleDismiss,
    }),
    [handleDismiss, isHovered],
  );

  return (
    <InfoCardContext.Provider value={cardContextValue}>
      <InfoCardImageContext.Provider value={imageContextValue}>
        <AnimatePresence>
          {!isDismissed ? (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{
                opacity: allImagesLoaded ? 1 : 0,
                y: allImagesLoaded ? 0 : 10,
              }}
              exit={{
                opacity: 0,
                y: 10,
                transition: { duration: 0.2 },
              }}
              transition={{ duration: 0.25 }}
              className={cn(
                "group rounded-xl border border-Color-Scheme-1-Border/40 bg-Color-Scheme-1-Background p-3",
                className,
              )}
              onMouseEnter={() => setIsHovered(true)}
              onMouseLeave={() => setIsHovered(false)}
            >
              {children}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </InfoCardImageContext.Provider>
    </InfoCardContext.Provider>
  );
}

const InfoCardFooter = ({ children, className }: InfoCardFooterProps) => {
  const { isHovered } = useContext(InfoCardContext);

  return (
    <motion.div
      className={cn(
        "flex justify-between overflow-hidden text-xs text-Color-Neutral",
        className,
      )}
      initial={{ opacity: 0, height: 0 }}
      animate={{
        opacity: isHovered ? 1 : 0,
        height: isHovered ? "auto" : 0,
      }}
      transition={{
        type: "spring",
        stiffness: 320,
        damping: 30,
      }}
    >
      {children}
    </motion.div>
  );
};

const InfoCardDismiss = memo(
  ({ children, className, onDismiss, ...props }: InfoCardDismissProps) => {
    const { onDismiss: contextDismiss } = useContext(InfoCardContext);

    const handleClick = (event: React.MouseEvent) => {
      event.preventDefault();
      onDismiss?.();
      contextDismiss();
    };

    return (
      <div
        className={cn("cursor-pointer", className)}
        onClick={handleClick}
        {...props}
      >
        {children}
      </div>
    );
  },
);
InfoCardDismiss.displayName = "InfoCardDismiss";

const InfoCardAction = memo(
  ({ children, className, ...props }: InfoCardActionProps) => {
    return (
      <div className={cn(className)} {...props}>
        {children}
      </div>
    );
  },
);
InfoCardAction.displayName = "InfoCardAction";

const InfoCardMedia = ({
  media = [],
  className,
  loading,
  shrinkHeight = 76,
  expandHeight = 152,
}: InfoCardMediaProps) => {
  const { isHovered } = useContext(InfoCardContext);
  const { setAllImagesLoaded } = useContext(InfoCardImageContext);
  const loadedMedia = useRef(new Set<string>());

  const handleMediaLoad = (mediaSrc: string) => {
    loadedMedia.current.add(mediaSrc);

    if (loadedMedia.current.size === Math.min(3, media.slice(0, 3).length)) {
      setAllImagesLoaded(true);
    }
  };

  const processedMedia = media.map((item) => ({ ...item, type: item.type ?? "image" }));
  const displayMedia = processedMedia.slice(0, 3);

  useEffect(() => {
    if (media.length > 0) {
      setAllImagesLoaded(false);
      loadedMedia.current.clear();
      return;
    }

    setAllImagesLoaded(true);
  }, [media.length, setAllImagesLoaded]);

  const mediaCount = displayMedia.length;

  const getRotation = (index: number) => {
    if (!isHovered || mediaCount === 1) {
      return 0;
    }

    return (index - (mediaCount === 2 ? 0.5 : 1)) * 5;
  };

  const getTranslateX = (index: number) => {
    if (!isHovered || mediaCount === 1) {
      return 0;
    }

    return (index - (mediaCount === 2 ? 0.5 : 1)) * 20;
  };

  const getTranslateY = (index: number) => {
    if (!isHovered) {
      return 0;
    }

    if (mediaCount === 1) {
      return -5;
    }

    return index === 0 ? -10 : index === 1 ? -5 : 0;
  };

  const getScale = (index: number) => {
    if (!isHovered) {
      return 1;
    }

    return mediaCount === 1 ? 1 : 0.95 + index * 0.02;
  };

  return (
    <InfoCardImageContext.Provider
      value={{
        handleMediaLoad,
        setAllImagesLoaded,
      }}
    >
      <motion.div
        className={cn("relative mt-2 rounded-md", className)}
        animate={{
          height: media.length > 0 ? (isHovered ? expandHeight : shrinkHeight) : "auto",
        }}
        style={{ overflow: isHovered ? "visible" : "hidden" }}
        transition={{
          type: "spring",
          stiffness: 300,
          damping: 30,
          duration: 0.3,
        }}
      >
        <div
          className="relative"
          style={media.length > 0 ? { height: `${shrinkHeight}px` } : undefined}
        >
          {displayMedia.map((item, index) => {
            const {
              type,
              src,
              alt,
              className: itemClassName,
              ...mediaProps
            } = item;

            return (
              <motion.div
                key={src}
                className="absolute w-full"
                animate={{
                  rotateZ: getRotation(index),
                  x: getTranslateX(index),
                  y: getTranslateY(index),
                  scale: getScale(index),
                }}
                transition={{
                  type: "spring",
                  stiffness: 300,
                  damping: 30,
                }}
              >
                {type === "video" ? (
                  <video
                    src={src}
                    className={cn(
                      "w-full rounded-md border border-Color-Scheme-1-Border/50 object-cover shadow-md",
                      itemClassName,
                    )}
                    onLoadedData={() => handleMediaLoad(src)}
                    preload="metadata"
                    muted
                    playsInline
                    {...(mediaProps as React.VideoHTMLAttributes<HTMLVideoElement>)}
                  />
                ) : (
                  <img
                    src={src}
                    alt={alt ?? ""}
                    className={cn(
                      "w-full rounded-md border border-Color-Scheme-1-Border/50 object-cover shadow-md",
                      itemClassName,
                    )}
                    onLoad={() => handleMediaLoad(src)}
                    loading={loading}
                    {...(mediaProps as React.ImgHTMLAttributes<HTMLImageElement>)}
                  />
                )}
              </motion.div>
            );
          })}
        </div>

        <motion.div
          className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-b from-transparent to-Color-Scheme-1-Background"
          animate={{ opacity: isHovered ? 0 : 1 }}
          transition={{
            type: "spring",
            stiffness: 300,
            damping: 30,
            duration: 0.3,
          }}
        />
      </motion.div>
    </InfoCardImageContext.Provider>
  );
};

export {
  InfoCard,
  InfoCardAction,
  InfoCardContent,
  InfoCardDescription,
  InfoCardDismiss,
  InfoCardFooter,
  InfoCardMedia,
  InfoCardTitle,
};
