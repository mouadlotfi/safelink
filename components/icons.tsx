"use client";

import { forwardRef, memo } from "react";

type IconProps = React.SVGProps<SVGSVGElement>;

function createIcon(path: React.ReactNode, viewBox = "0 0 24 24") {
  const Icon = forwardRef<SVGSVGElement, IconProps>(function Icon(props, ref) {
    return (
      <svg
        ref={ref}
        aria-hidden="true"
        focusable="false"
        viewBox={viewBox}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        {...props}
      >
        {path}
      </svg>
    );
  });
  return memo(Icon);
}

export const IconHistory = createIcon(
  <>
    <path d="M3 3v5h5" />
    <path d="M3.05 13A9 9 0 1 0 9 3.46" />
    <path d="M12 7v5l4 2" />
  </>
);

export const IconInfo = createIcon(
  <>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 16v-4" />
    <path d="M12 8h.01" />
  </>
);

export const IconLink2 = createIcon(
  <>
    <path d="M15 7h3a5 5 0 0 1 0 10h-3" />
    <path d="M9 17H6a5 5 0 0 1 0-10h3" />
    <path d="M8 12h8" />
  </>
);

export const IconLoader = createIcon(
  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
);

export const IconClipboardPaste = createIcon(
  <>
    <path d="M16.5 4H18a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-7.5" />
    <path d="M8 18H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h1.5" />
    <rect width="8" height="4" x="8" y="2" rx="1" />
  </>
);

export const IconArrowUpRight = createIcon(<path d="M7 7h10v10M7 17 17 7" />);

export const IconDownload = createIcon(
  <>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <path d="M7 10l5 5 5-5" />
    <path d="M12 15V3" />
  </>
);

export const IconTrash = createIcon(
  <>
    <path d="M3 6h18" />
    <path d="M19 6v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
    <path d="M10 11v6" />
    <path d="M14 11v6" />
    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
  </>
);

export const IconCopy = createIcon(
  <>
    <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
    <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
  </>
);

export const IconCheck = createIcon(<path d="M20 6 9 17l-5-5" />);

export const IconCode = createIcon(
  <>
    <path d="M16 18l6-6-6-6" />
    <path d="M8 6l-6 6 6 6" />
  </>
);

export const IconX = createIcon(<path d="M18 6 6 18M6 6l12 12" />);

