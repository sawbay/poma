import "./styles.css";
import { createRoot } from "react-dom/client";
import App from "./app";

const container = document.getElementById("app");

if (!container) {
  throw new Error("App root container #app not found in DOM.");
}

const root = createRoot(container);

root.render(<App />);
