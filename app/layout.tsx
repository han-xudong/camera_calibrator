import type { Metadata } from "next";
import "./globals.css";
import { AprilTagProvider } from "./context/AprilTagContext";
import { ThemeProvider } from "./context/ThemeContext";

export const metadata: Metadata = {
  title: "Online Camera Calibrator",
  description: "Modern web-based camera calibration tool powered by AprilTag and WASM",
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
          <AprilTagProvider>
            {children}
          </AprilTagProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
