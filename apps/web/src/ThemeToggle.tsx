import { useEffect, useState } from "react";

export default function ThemeToggle() {
  const [dark, setDark] = useState(() => {
    return localStorage.getItem("sentinel-theme") === "dark";
  });

  useEffect(() => {
    if (dark) {
      document.documentElement.classList.add("theme-dark");
      localStorage.setItem("sentinel-theme", "dark");
    } else {
      document.documentElement.classList.remove("theme-dark");
      localStorage.setItem("sentinel-theme", "light");
    }
  }, [dark]);

  return (
    <button
      type="button"
      className="themeToggle"
      onClick={() => setDark((value) => !value)}
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
      style={{
        width: "42px",
        height: "32px",
        border: "1px solid #e5e7eb",
        borderRadius: "8px",
        background: dark ? "#1e293b" : "#ffffff",
        color: dark ? "#f8fafc" : "#111827",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "16px",
        marginRight: "4px",
      }}
    >
      {dark ? "☀️" : "🌙"}
    </button>
  );
}