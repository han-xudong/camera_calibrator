import type { Metadata } from "next";
import "./globals.css";
import { CalibrationProvider } from "./context/CalibrationContext";
import { ThemeProvider } from "./context/ThemeContext";

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Online Camera Calibrator",
    template: "%s | Online Camera Calibrator",
  },
  description:
    "Calibrate camera intrinsics online with chessboard or AprilTag targets, inspect reprojection error, and export usable calibration parameters directly in the browser.",
  applicationName: "Online Camera Calibrator",
  keywords: [
    "camera calibration",
    "opencv calibration",
    "intrinsic calibration",
    "apriltag calibration",
    "chessboard calibration",
    "reprojection error",
    "camera matrix",
    "distortion coefficients",
    "computer vision",
  ],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: "/",
    title: "Online Camera Calibrator",
    description:
      "Browser-based camera calibration with chessboard and AprilTag support, visual diagnostics, and downloadable results.",
    siteName: "Online Camera Calibrator",
    images: [
      {
        url: "/assets/screenshot.jpg",
        width: 1280,
        height: 720,
        alt: "Online Camera Calibrator interface",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Online Camera Calibrator",
    description:
      "Calibrate cameras in the browser with chessboard and AprilTag targets, error charts, and exportable parameters.",
    images: ["/assets/screenshot.jpg"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  category: "technology",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`antialiased h-screen w-screen overflow-hidden bg-gray-50 text-gray-900 dark:bg-neutral-950 dark:text-gray-100 transition-colors duration-200`}
      >
        <ThemeProvider>
          <CalibrationProvider>
            {children}
          </CalibrationProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
